import { Env } from "./env";
import { HttpError } from "./http";
import {
    ClaudeAskKind, ClaudeCard, ClaudeCiState, ClaudePr, ClaudePrState, ClaudeProject, ClaudeThreadState,
    claudeAskKinds, claudeCiStates, claudePrStates, claudeProjectUrl, claudeThreadStates, claudeThreadUrl
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
/* What the sending thread says about itself; the whole card each time */
export type SnapshotCard = {
    headline?: string,
    ask?: {kind: ClaudeAskKind, text: string},
    progress?: {done: number, total: number, now?: string},
    artifact?: {title: string, url: string},
    topic?: string,
    keywords?: string[]
};
export type SnapshotPr = {
    repo: string,
    number: number,
    title: string,
    state: ClaudePrState,
    ci?: ClaudeCiState,
    url: string,
    thread_id?: string
};
export type Snapshot = {
    project_id: string,
    project_name: string,
    short_name?: string,
    /* left out = the list hasn't changed since the last sync (only once the project is on the map) */
    threads?: SnapshotThread[],
    /* state: what the thread leaves itself as when this turn ends; the platform's own list only catches up later */
    this_thread?: {thread_id: string, card: SnapshotCard, state?: ClaudeThreadState},
    /* left out = unchanged; sent = the project's whole PR list */
    prs?: SnapshotPr[]
};

type ProjectRow = {
    id: string, name: string, short_name: string | null, hidden: number, first_seen_at: string, last_synced_at: string
};
type ThreadRow = {
    id: string, project_id: string, title: string, state: ClaudeThreadState, created_at: string | null,
    last_activity_at: string | null, first_seen_at: string, last_seen_at: string,
    headline: string | null, ask_kind: ClaudeAskKind | null, ask_text: string | null,
    progress_done: number | null, progress_total: number | null, progress_now: string | null,
    artifact_title: string | null, artifact_url: string | null, topic: string | null, keywords: string | null,
    card_at: string | null, opened_at: string | null
};
type PrRow = {
    project_id: string, repo: string, number: number, thread_id: string | null, title: string,
    state: ClaudePrState, ci: ClaudeCiState | null, url: string, seen_at: string
};
type TopicRow = {thread_id: string, topic: string, keywords: string | null, at: string};

const idPattern = /^[\w-]{1,100}$/;

const fail = (message: string): never => {
    throw new HttpError(422, message);
};

const isTime = (value: unknown): value is string =>
    typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));

const isHttps = (value: string) => /^https:\/\/[^\s]{1,1990}$/.test(value);

function checkCard(card: SnapshotCard) {
    if (card.ask && !claudeAskKinds.includes(card.ask.kind)) {
        fail("The card's ask has an unknown kind.");
    }
    if (card.progress) {
        const {done, total} = card.progress;
        if (!Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total < 1 || done > total || total > 500) {
            fail("The card's progress must be whole numbers, done no more than total.");
        }
    }
    if (card.artifact && !isHttps(card.artifact.url)) {
        fail("The card's artifact link must be an https link.");
    }
}

function checkPrs(prs: SnapshotPr[]) {
    const seen = new Set<string>();
    for (const pr of prs) {
        const key = `${pr.repo}#${pr.number}`;
        if (seen.has(key)) {
            fail(`PR ${key} is listed twice.`);
        }
        seen.add(key);
        if (!Number.isInteger(pr.number) || pr.number < 1 || !claudePrStates.includes(pr.state)
            || (pr.ci !== undefined && !claudeCiStates.includes(pr.ci)) || !isHttps(pr.url)
            || (pr.thread_id !== undefined && !idPattern.test(pr.thread_id))) {
            fail(`PR ${key} isn't valid.`);
        }
    }
}

export function checkSnapshot(input: Snapshot): Snapshot {
    if (!idPattern.test(input.project_id)) {
        fail("That project id isn't valid.");
    }
    if (input.this_thread) {
        if (!idPattern.test(input.this_thread.thread_id)) {
            fail("this_thread's id isn't valid.");
        }
        if (input.threads && !input.threads.some(t => t.thread_id === input.this_thread!.thread_id)) {
            fail("this_thread must be one of the threads listed.");
        }
        checkCard(input.this_thread.card);
        if (input.this_thread.state !== undefined && !claudeThreadStates.includes(input.this_thread.state)) {
            fail("this_thread has an unknown state.");
        }
    }
    if (input.prs) {
        checkPrs(input.prs);
    }
    const seen = new Set<string>();
    for (const t of input.threads ?? []) {
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
    return input;
}

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export type SyncResult = {project: string, threads: number, needsYou: number};

export async function syncProject(env: Env, input: Snapshot): Promise<SyncResult> {
    const snapshot = checkSnapshot(input);
    const now = new Date().toISOString();
    const payload = JSON.stringify(snapshot);
    const hash = await sha256(payload);

    if (!snapshot.threads) {
        // "unchanged since the last sync" needs a last sync, and the card's thread must be on the map
        const known = await env.DB.prepare(
            `SELECT (SELECT COUNT(*) FROM claude_projects WHERE id = ?1) AS project,
                    (SELECT COUNT(*) FROM claude_threads WHERE id = ?2 AND project_id = ?1) AS thread`
        ).bind(snapshot.project_id, snapshot.this_thread?.thread_id ?? "").first<{project: number, thread: number}>();
        if (!known?.project) {
            fail("This project isn't on the map yet: send its whole thread list the first time.");
        }
        if (snapshot.this_thread && !known?.thread) {
            fail("this_thread isn't on the map yet: send the whole thread list.");
        }
    }

    // 1. the inbox: kept as sent, before anything else can go wrong
    await env.DB.prepare(
        `INSERT INTO claude_snapshots (hash, project_id, payload, received_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (hash) DO UPDATE SET received_at = excluded.received_at`
    ).bind(hash, snapshot.project_id, payload, now).run();

    // 2. the map
    const statements = [
        // an unchanged list: every thread the last sync listed counts as listed again
        ...(snapshot.threads ? [] : [env.DB.prepare(
            `UPDATE claude_threads SET last_seen_at = ?1
             WHERE project_id = ?2 AND last_seen_at >= (SELECT last_synced_at FROM claude_projects WHERE id = ?2)`
        ).bind(now, snapshot.project_id)]),
        env.DB.prepare(
            `INSERT INTO claude_projects (id, name, short_name, first_seen_at, last_synced_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name,
                -- the project instructions are the only source of a short name, so a sync without one means it was dropped
                short_name = excluded.short_name,
                last_synced_at = excluded.last_synced_at`
        ).bind(snapshot.project_id, snapshot.project_name, snapshot.short_name ?? null, now, now),
        // a thread's state only moves forward in time: an older list can't undo a newer one
        ...(snapshot.threads ?? []).map(t => env.DB.prepare(
            `INSERT INTO claude_threads (id, project_id, title, state, created_at, last_activity_at, listed_activity_at, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
                project_id = excluded.project_id,
                -- a rename doesn't move the platform's time, so a title only needs a list no older than the last one
                title = CASE WHEN ${listedNotOlder} THEN excluded.title ELSE claude_threads.title END,
                listed_activity_at = CASE WHEN ${listedNotOlder} THEN excluded.listed_activity_at ELSE claude_threads.listed_activity_at END,
                state = CASE WHEN ${newer} THEN excluded.state ELSE claude_threads.state END,
                last_activity_at = CASE WHEN ${newer} THEN excluded.last_activity_at ELSE claude_threads.last_activity_at END,
                created_at = COALESCE(claude_threads.created_at, excluded.created_at),
                last_seen_at = excluded.last_seen_at`
        ).bind(t.thread_id, snapshot.project_id, t.title, t.state, t.created_at ?? null, t.last_activity_at ?? null, t.last_activity_at ?? null, now, now)),
        // a thread's word on its own state as its turn ends beats the platform's list, which lags behind by a turn
        ...(snapshot.this_thread?.state ? [env.DB.prepare(
            `UPDATE claude_threads SET state = ?, last_activity_at = ? WHERE id = ? AND project_id = ?`
        ).bind(snapshot.this_thread.state, now, snapshot.this_thread.thread_id, snapshot.project_id)] : []),
        ...(snapshot.this_thread ? cardStatements(env, snapshot.project_id, snapshot.this_thread.thread_id, snapshot.this_thread.card, now) : []),
        ...(snapshot.prs ? [
            env.DB.prepare("DELETE FROM claude_prs WHERE project_id = ?").bind(snapshot.project_id),
            ...snapshot.prs.map(pr => env.DB.prepare(
                `INSERT INTO claude_prs (project_id, repo, number, thread_id, title, state, ci, url, seen_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(snapshot.project_id, pr.repo, pr.number, pr.thread_id ?? null, pr.title, pr.state, pr.ci ?? null, pr.url, now))
        ] : []),
        env.DB.prepare("UPDATE claude_snapshots SET applied_at = ? WHERE hash = ?").bind(now, hash)
    ];
    await env.DB.batch(statements);

    if (snapshot.threads) {
        return {
            project: snapshot.short_name ?? snapshot.project_name,
            threads: snapshot.threads.length,
            needsYou: snapshot.threads.filter(t => t.state === "blocked").length
        };
    }
    const counts = await env.DB.prepare(
        `SELECT COUNT(*) AS threads, SUM(state = 'blocked') AS needsYou FROM claude_threads
         WHERE project_id = ? AND last_seen_at = ?`
    ).bind(snapshot.project_id, now).first<{threads: number, needsYou: number | null}>();
    return {project: snapshot.short_name ?? snapshot.project_name, threads: counts?.threads ?? 0, needsYou: counts?.needsYou ?? 0};
}

/* The card's columns, in order. A card that matches the stored one keeps its time, so a repeat isn't "New". */
const cardColumns = [
    "headline", "ask_kind", "ask_text", "progress_done", "progress_total", "progress_now",
    "artifact_title", "artifact_url", "topic", "keywords"
] as const;

function cardValues(card: SnapshotCard): (string | number | null)[] {
    const keywords = card.keywords?.map(k => k.trim()).filter(Boolean);
    return [
        card.headline ?? null, card.ask?.kind ?? null, card.ask?.text ?? null,
        card.progress?.done ?? null, card.progress?.total ?? null, card.progress?.now ?? null,
        card.artifact?.title ?? null, card.artifact?.url ?? null,
        card.topic ?? null, keywords?.length ? JSON.stringify(keywords) : null
    ];
}

function cardStatements(env: Env, projectId: string, threadId: string, card: SnapshotCard, now: string) {
    const values = cardValues(card);
    const n = cardColumns.length;
    // ?1..?n are the new values; in an UPDATE, the right-hand sides see the row as it was
    const unchanged = cardColumns.map((c, i) => `${c} IS ?${i + 1}`).join(" AND ");
    const statements = [env.DB.prepare(
        `UPDATE claude_threads SET ${cardColumns.map((c, i) => `${c} = ?${i + 1}`).join(", ")},
            card_at = CASE WHEN card_at IS NOT NULL AND ${unchanged} THEN card_at ELSE ?${n + 1} END
         WHERE id = ?${n + 2} AND project_id = ?${n + 3}`
    ).bind(...values, now, threadId, projectId)];
    if (card.topic) {
        statements.push(env.DB.prepare(
            `INSERT INTO claude_topics (thread_id, topic, keywords, at) VALUES (?, ?, ?, ?)
             ON CONFLICT (thread_id, topic) DO UPDATE SET keywords = excluded.keywords, at = excluded.at`
        ).bind(threadId, card.topic, values[9], now));
    }
    return statements;
}

/* true when the incoming row is at least as recent as the stored one (or either has no time) */
const newer = `(excluded.last_activity_at IS NULL OR claude_threads.last_activity_at IS NULL
    OR excluded.last_activity_at >= claude_threads.last_activity_at)`;
/* Against the platform's own time only: a thread's self-reported state stamps last_activity_at with the server's clock. */
const listedNotOlder = `(excluded.listed_activity_at IS NULL OR claude_threads.listed_activity_at IS NULL
    OR excluded.listed_activity_at >= claude_threads.listed_activity_at)`;

export async function listClaudeMap(env: Env): Promise<ClaudeProject[]> {
    const [projects, threads, prs, topics] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM claude_projects ORDER BY last_synced_at DESC"),
        env.DB.prepare("SELECT * FROM claude_threads ORDER BY created_at"),
        env.DB.prepare("SELECT * FROM claude_prs WHERE thread_id IS NOT NULL ORDER BY number DESC"),
        env.DB.prepare("SELECT * FROM claude_topics ORDER BY at DESC")
    ]);
    const threadRows = threads.results as ThreadRow[];
    const prsBy = groupBy(prs.results as PrRow[], r => r.thread_id!);
    const topicsBy = groupBy(topics.results as TopicRow[], r => r.thread_id);
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
                if (t.opened_at) thread.openedAt = t.opened_at;
                const card = cardOf(t);
                if (card) thread.card = card;
                const threadPrs = prsBy.get(t.id)?.filter(r => r.project_id === p.id);
                if (threadPrs?.length) thread.prs = threadPrs.map(prOf);
                const past = (topicsBy.get(t.id) ?? []).filter(r => r.topic !== t.topic)
                    .map(r => [r.topic, ...parseKeywords(r.keywords)].join(" "));
                if (past.length) thread.pastTopics = past;
                return thread;
            })
        };
        if (p.short_name) project.shortName = p.short_name;
        return project;
    });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
    }
    return groups;
}

function parseKeywords(text: string | null): string[] {
    try {
        const value = text ? JSON.parse(text) : [];
        return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string") : [];
    } catch {
        return [];
    }
}

function cardOf(t: ThreadRow): ClaudeCard | undefined {
    if (!t.card_at) {
        return undefined;
    }
    const card: ClaudeCard = {at: t.card_at};
    if (t.headline) card.headline = t.headline;
    if (t.ask_kind && t.ask_text) card.ask = {kind: t.ask_kind, text: t.ask_text};
    if (t.progress_done !== null && t.progress_total) {
        card.progress = {done: t.progress_done, total: t.progress_total};
        if (t.progress_now) card.progress.now = t.progress_now;
    }
    if (t.artifact_title && t.artifact_url) card.artifact = {title: t.artifact_title, url: t.artifact_url};
    if (t.topic) card.topic = t.topic;
    const keywords = parseKeywords(t.keywords);
    if (keywords.length) card.keywords = keywords;
    return card;
}

function prOf(r: PrRow): ClaudePr {
    const pr: ClaudePr = {repo: r.repo, number: r.number, title: r.title, state: r.state, url: r.url};
    if (r.ci) pr.ci = r.ci;
    return pr;
}

/* Jon opened the thread from the map: what it says now is no longer new */
export async function markThreadOpened(env: Env, threadId: string): Promise<void> {
    const result = await env.DB.prepare("UPDATE claude_threads SET opened_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), threadId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such thread on the Claude map.");
    }
}

export async function setProjectHidden(env: Env, projectId: string, hidden: boolean): Promise<void> {
    const result = await env.DB.prepare("UPDATE claude_projects SET hidden = ? WHERE id = ?").bind(hidden ? 1 : 0, projectId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such project on the Claude map.");
    }
}
