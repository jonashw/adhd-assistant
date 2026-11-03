import { Env } from "./env";
import { HttpError } from "./http";
import {
    ClaudeArtifact, ClaudeProject, ClaudeThreadState, claudeProjectUrl, claudeThreadStates, claudeThreadUrl
} from "../../src/ClaudeMapTypes";

/* The Claude map. Any Claude in a project sends a snapshot of the project's threads, as the platform
   lists them; the latest word wins. Each snapshot lands in the inbox first, then updates the map.
   A thread missing from a snapshot is kept and marked, never deleted, so a partial list can't wipe the map. */

export type SnapshotThread = {
    thread_id: string,
    title: string,
    state: ClaudeThreadState,
    created_at?: string,
    last_activity_at?: string
};
export type SnapshotArtifact = {
    artifact_id: string,
    title: string,
    url: string,
    updated_at?: string
};
export type Snapshot = {
    project_id: string,
    project_name: string,
    short_name?: string,
    threads: SnapshotThread[],
    /* the project's artifacts, as the platform lists them; left out means "not sent", not "none" */
    artifacts?: SnapshotArtifact[]
};

type ProjectRow = {
    id: string, name: string, short_name: string | null, hidden: number, first_seen_at: string, last_synced_at: string
};
type ArtifactRow = {
    id: string, project_id: string, title: string, url: string, updated_at: string | null,
    first_seen_at: string, last_seen_at: string, opened_at: string | null
};
type ThreadRow = {
    id: string, project_id: string, title: string, state: ClaudeThreadState, created_at: string | null,
    last_activity_at: string | null, first_seen_at: string, last_seen_at: string
};

const idPattern = /^[\w-]{1,100}$/;

const fail = (message: string): never => {
    throw new HttpError(422, message);
};

const isTime = (value: unknown): value is string =>
    typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));

export function checkSnapshot(input: Snapshot): Snapshot {
    if (!idPattern.test(input.project_id)) {
        fail("That project id isn't valid.");
    }
    const seen = new Set<string>();
    for (const t of input.threads) {
        if (!idPattern.test(t.thread_id)) {
            fail(`Thread id "${t.thread_id}" isn't valid.`);
        }
        if (seen.has(t.thread_id)) {
            fail(`Thread ${t.thread_id} is listed twice.`);
        }
        seen.add(t.thread_id);
        if (!claudeThreadStates.includes(t.state)) {
            fail(`Thread ${t.thread_id} has an unknown state.`);
        }
        if ((t.created_at !== undefined && !isTime(t.created_at)) || (t.last_activity_at !== undefined && !isTime(t.last_activity_at))) {
            fail(`Thread ${t.thread_id} has a time that isn't a date.`);
        }
    }
    const artifactIds = new Set<string>();
    for (const a of input.artifacts ?? []) {
        if (!idPattern.test(a.artifact_id) || artifactIds.has(a.artifact_id)) {
            fail(`Artifact id "${a.artifact_id}" isn't valid or is listed twice.`);
        }
        artifactIds.add(a.artifact_id);
        if (!/^https:\/\/claude\.ai\//.test(a.url)) {
            fail(`Artifact ${a.artifact_id} needs a claude.ai link.`);
        }
        if (a.updated_at !== undefined && !isTime(a.updated_at)) {
            fail(`Artifact ${a.artifact_id} has a time that isn't a date.`);
        }
    }
    return input;
}

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function syncProject(env: Env, input: Snapshot): Promise<{project: string, threads: number, needsYou: number}> {
    const snapshot = checkSnapshot(input);
    const now = new Date().toISOString();
    const payload = JSON.stringify(snapshot);
    const hash = await sha256(payload);

    // 1. the inbox: kept as sent, before anything else can go wrong
    await env.DB.prepare(
        `INSERT INTO claude_snapshots (hash, project_id, payload, received_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (hash) DO UPDATE SET received_at = excluded.received_at`
    ).bind(hash, snapshot.project_id, payload, now).run();

    // 2. the map
    const statements = [
        env.DB.prepare(
            `INSERT INTO claude_projects (id, name, short_name, first_seen_at, last_synced_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name,
                short_name = COALESCE(excluded.short_name, claude_projects.short_name),
                last_synced_at = excluded.last_synced_at`
        ).bind(snapshot.project_id, snapshot.project_name, snapshot.short_name ?? null, now, now),
        // a thread's state only moves forward in time: an older list can't undo a newer one
        ...snapshot.threads.map(t => env.DB.prepare(
            `INSERT INTO claude_threads (id, project_id, title, state, created_at, last_activity_at, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
                project_id = excluded.project_id,
                title = CASE WHEN ${newer} THEN excluded.title ELSE claude_threads.title END,
                state = CASE WHEN ${newer} THEN excluded.state ELSE claude_threads.state END,
                last_activity_at = CASE WHEN ${newer} THEN excluded.last_activity_at ELSE claude_threads.last_activity_at END,
                created_at = COALESCE(claude_threads.created_at, excluded.created_at),
                last_seen_at = excluded.last_seen_at`
        ).bind(t.thread_id, snapshot.project_id, t.title, t.state, t.created_at ?? null, t.last_activity_at ?? null, now, now)),
        ...(snapshot.artifacts ?? []).map(a => env.DB.prepare(
            `INSERT INTO claude_artifacts (id, project_id, title, url, updated_at, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET project_id = excluded.project_id, title = excluded.title, url = excluded.url,
                updated_at = COALESCE(MAX(excluded.updated_at, claude_artifacts.updated_at), excluded.updated_at, claude_artifacts.updated_at),
                last_seen_at = excluded.last_seen_at`
        ).bind(a.artifact_id, snapshot.project_id, a.title, a.url, a.updated_at ?? null, now, now)),
        // a snapshot without artifacts says nothing about them, so they still count as seen
        ...(snapshot.artifacts ? [] : [env.DB.prepare("UPDATE claude_artifacts SET last_seen_at = ? WHERE project_id = ?").bind(now, snapshot.project_id)]),
        env.DB.prepare("UPDATE claude_snapshots SET applied_at = ? WHERE hash = ?").bind(now, hash)
    ];
    await env.DB.batch(statements);

    return {
        project: snapshot.short_name ?? snapshot.project_name,
        threads: snapshot.threads.length,
        needsYou: snapshot.threads.filter(t => t.state === "blocked").length
    };
}

/* true when the incoming row is at least as recent as the stored one (or either has no time) */
const newer = `(excluded.last_activity_at IS NULL OR claude_threads.last_activity_at IS NULL
    OR excluded.last_activity_at >= claude_threads.last_activity_at)`;

export async function listClaudeMap(env: Env): Promise<ClaudeProject[]> {
    const [projects, threads, artifacts] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM claude_projects ORDER BY last_synced_at DESC"),
        env.DB.prepare("SELECT * FROM claude_threads ORDER BY created_at"),
        env.DB.prepare("SELECT * FROM claude_artifacts ORDER BY COALESCE(updated_at, first_seen_at) DESC")
    ]);
    const threadRows = threads.results as ThreadRow[];
    const artifactRows = artifacts.results as ArtifactRow[];
    return (projects.results as ProjectRow[]).map(p => {
        const project: ClaudeProject = {
            id: p.id,
            name: p.name,
            url: claudeProjectUrl(p.id),
            hidden: p.hidden === 1,
            firstSeenAt: p.first_seen_at,
            lastSyncedAt: p.last_synced_at,
            threads: threadRows.filter(t => t.project_id === p.id).map(t => {
                const thread: ClaudeProject["threads"][number] = {
                    id: t.id,
                    title: t.title,
                    state: t.state,
                    url: claudeThreadUrl(p.id, t.id),
                    lastSeenAt: t.last_seen_at,
                    inLatest: t.last_seen_at >= p.last_synced_at
                };
                if (t.created_at) thread.createdAt = t.created_at;
                if (t.last_activity_at) thread.lastActivityAt = t.last_activity_at;
                return thread;
            }),
            artifacts: artifactRows.filter(a => a.project_id === p.id).map(a => {
                const artifact: ClaudeArtifact = {
                    id: a.id, title: a.title, url: a.url, firstSeenAt: a.first_seen_at,
                    inLatest: a.last_seen_at >= p.last_synced_at
                };
                if (a.updated_at) artifact.updatedAt = a.updated_at;
                if (a.opened_at) artifact.openedAt = a.opened_at;
                return artifact;
            })
        };
        if (p.short_name) project.shortName = p.short_name;
        return project;
    });
}

export async function setProjectHidden(env: Env, projectId: string, hidden: boolean): Promise<void> {
    const result = await env.DB.prepare("UPDATE claude_projects SET hidden = ? WHERE id = ?").bind(hidden ? 1 : 0, projectId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such project on the Claude map.");
    }
}

/* Jon opened it from the map: it stops reading "New" or "Updated" until it changes again */
export async function markArtifactOpened(env: Env, artifactId: string): Promise<void> {
    const result = await env.DB.prepare("UPDATE claude_artifacts SET opened_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), artifactId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such artifact on the Claude map.");
    }
}
