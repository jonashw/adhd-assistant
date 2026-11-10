import { Env } from "./env";
import { HttpError } from "./http";
import { resumeAnswered, setItemsAside } from "./items";
import { spotNameMax } from "../../src/spots";
import {
    ClaudeArtifact, ClaudeAskKind, ClaudeCard, ClaudeCiState, ClaudeEventKind, ClaudeLogEntry, ClaudePr, ClaudePrState, ClaudeProject, ClaudeThreadState, ProjectReach, ClaudeTodo, DelayClass, InterestAnswer, InterestGuess, TodoSize,
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
    last_activity_at?: string,
    /* the platform's session id (cse_...): what its own tools take to read or reach this thread from another project */
    session_id?: string
};
export type SnapshotArtifact = {
    title: string,
    url: string,
    updated_at?: string
};
/* What the sending thread says about itself; the whole card each time */
export type SnapshotCard = {
    headline?: string,
    /* where: the spot Jon needs to be at to answer (a name from his spots), when it isn't Anywhere */
    ask?: {kind: ClaudeAskKind, text: string, where?: string},
    progress?: {done: number, total: number, now?: string},
    /* the one it made or updated last */
    artifact?: {title: string, url: string},
    /* every one it made or updated; the map keeps what earlier cards named too, so a short list loses nothing */
    artifacts?: SnapshotArtifact[],
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
    this_thread?: {thread_id: string, card: SnapshotCard, state?: ClaudeThreadState, set_aside_until?: string},
    /* left out = unchanged; sent = the project's whole PR list */
    prs?: SnapshotPr[],
    /* the project's artifacts as the platform lists them (newest first, maybe cut short). Added to what the map
       has, never a replacement, so a short list loses nothing. */
    artifacts?: (SnapshotArtifact & {artifact_id?: string})[]
};

type ProjectRow = {
    id: string, name: string, short_name: string | null, hidden: number, first_seen_at: string, last_synced_at: string,
    artifacts_since: string | null, reach: ProjectReach | null
};
type ArtifactRow = {
    id: number, project_id: string, url: string, title: string, updated_at: string | null,
    first_seen_at: string, last_seen_at: string, opened_at: string | null
};
type ArtifactThreadRow = {artifact_id: number, thread_id: string, at: string};
type ThreadRow = {
    id: string, project_id: string, title: string, state: ClaudeThreadState, created_at: string | null,
    last_activity_at: string | null, first_seen_at: string, last_seen_at: string,
    headline: string | null, ask_kind: ClaudeAskKind | null, ask_text: string | null,
    progress_done: number | null, progress_total: number | null, progress_now: string | null,
    artifact_title: string | null, artifact_url: string | null, topic: string | null, keywords: string | null,
    card_at: string | null, opened_at: string | null,
    set_aside_until: string | null, set_aside_by: "thread" | "jon" | null,
    ask_where: string | null, ask_where_jon: string | null, ask_where_jon_for: string | null,
    session_id: string | null
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
    if (card.ask?.where !== undefined && (typeof card.ask.where !== "string" || card.ask.where.trim().length > spotNameMax)) {
        fail(`The ask's where is a spot name of up to ${spotNameMax} characters.`);
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
    checkArtifacts(card.artifacts ?? [], "The card's");
}

function checkArtifacts(artifacts: SnapshotArtifact[], whose: string) {
    const seen = new Set<string>();
    for (const a of artifacts) {
        if (!isHttps(a.url) || seen.has(a.url) || !a.title || (a.updated_at !== undefined && !isTime(a.updated_at))) {
            fail(`${whose} artifact ${a.url} isn't valid or is listed twice.`);
        }
        seen.add(a.url);
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
        if (input.this_thread.set_aside_until !== undefined && !isDay(input.this_thread.set_aside_until)) {
            fail("set_aside_until must be a day like 2026-12-07.");
        }
    }
    if (input.prs) {
        checkPrs(input.prs);
    }
    checkArtifacts(input.artifacts ?? [], "The project's");
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
        if (t.session_id !== undefined && !idPattern.test(t.session_id)) {
            fail(`Thread ${t.thread_id} has a session id that isn't valid.`);
        }
    }
    return input;
}

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export type SyncResult = {project: string, threads: number, needsYou: number};

const isDay = (day: unknown): day is string =>
    typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(`${day}T00:00:00Z`));

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

    // 2. the map, as it was, so the event log can say what this sync changed
    const before = await mapOf(env, snapshot.project_id);
    const statements = [
        // an unchanged list: every thread the last sync listed counts as listed again
        ...(snapshot.threads ? [] : [env.DB.prepare(
            `UPDATE claude_threads SET last_seen_at = ?1
             WHERE project_id = ?2 AND last_seen_at >= (SELECT last_synced_at FROM claude_projects WHERE id = ?2)`
        ).bind(now, snapshot.project_id)]),
        env.DB.prepare(
            `INSERT INTO claude_projects (id, name, short_name, first_seen_at, last_synced_at, artifacts_since) VALUES (?1, ?2, ?3, ?4, ?5, ?4)
             ON CONFLICT (id) DO UPDATE SET name = excluded.name,
                -- the project instructions are the only source of a short name, so a sync without one means it was dropped
                short_name = excluded.short_name,
                last_synced_at = excluded.last_synced_at`
        ).bind(snapshot.project_id, snapshot.project_name, snapshot.short_name ?? null, now, now),
        // a thread's state only moves forward in time: an older list can't undo a newer one
        ...(snapshot.threads ?? []).map(t => env.DB.prepare(
            `INSERT INTO claude_threads (id, project_id, title, state, created_at, last_activity_at, listed_activity_at, first_seen_at, last_seen_at, session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
                project_id = excluded.project_id,
                -- a rename doesn't move the platform's time, so a title only needs a list no older than the last one
                title = CASE WHEN ${listedNotOlder} THEN excluded.title ELSE claude_threads.title END,
                listed_activity_at = CASE WHEN ${listedNotOlder} THEN excluded.listed_activity_at ELSE claude_threads.listed_activity_at END,
                state = CASE WHEN ${newer} THEN excluded.state ELSE claude_threads.state END,
                last_activity_at = CASE WHEN ${newer} THEN excluded.last_activity_at ELSE claude_threads.last_activity_at END,
                created_at = COALESCE(claude_threads.created_at, excluded.created_at),
                -- a thread keeps its session, so a list from a thread that didn't send one keeps the one on file
                session_id = COALESCE(excluded.session_id, claude_threads.session_id),
                last_seen_at = excluded.last_seen_at`
        ).bind(t.thread_id, snapshot.project_id, t.title, t.state, t.created_at ?? null, t.last_activity_at ?? null, t.last_activity_at ?? null, now, now, t.session_id ?? null)),
        // a thread's word on its own state as its turn ends beats the platform's list, which lags behind by a turn
        ...(snapshot.this_thread?.state ? [env.DB.prepare(
            `UPDATE claude_threads SET state = ?, last_activity_at = ? WHERE id = ? AND project_id = ?`
        ).bind(snapshot.this_thread.state, now, snapshot.this_thread.thread_id, snapshot.project_id)] : []),
        ...(snapshot.this_thread ? cardStatements(env, snapshot.project_id, snapshot.this_thread.thread_id, snapshot.this_thread.card, now) : []),
        // Jon deferred: the thread sets its ask aside until a day
        ...(snapshot.this_thread?.set_aside_until ? [env.DB.prepare(
            "UPDATE claude_threads SET set_aside_until = ?, set_aside_by = 'thread' WHERE id = ? AND project_id = ?"
        ).bind(snapshot.this_thread.set_aside_until, snapshot.this_thread.thread_id, snapshot.project_id)] : []),
        ...artifactStatements(env, snapshot, now),
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

    const after = await mapOf(env, snapshot.project_id);

    // 3. the event log; a failure here must not fail a sync that already landed
    try {
        await logChanges(env, before, after, hash, snapshot.this_thread?.thread_id, now);
    } catch (e) {
        console.error("Couldn't write the Claude event log", e);
    }

    // 4. a thread that waited on Jon and now works again got his answer: its flare on the map comes down too,
    // and whatever set its ask aside is over
    try {
        const answered = answeredBetween(before, after);
        await resumeAnswered(env, answered);
        if (answered.length) {
            await env.DB.batch(answered.map(id => env.DB.prepare(
                "UPDATE claude_threads SET set_aside_until = NULL, set_aside_by = NULL WHERE id = ?"
            ).bind(id)));
        }
    } catch (e) {
        console.error("Couldn't take down answered flares", e);
    }

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

/* Artifacts: the project's list first, then what the sending thread says it made. A thread's latest one
   moves it to the top of that artifact's threads; the rest of its list only adds it if it isn't there yet. */
function artifactStatements(env: Env, snapshot: Snapshot, now: string) {
    const upsert = (a: SnapshotArtifact) => env.DB.prepare(
        `INSERT INTO claude_artifacts (project_id, url, title, updated_at, first_seen_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT (project_id, url) DO UPDATE SET title = excluded.title, last_seen_at = excluded.last_seen_at,
            updated_at = CASE WHEN excluded.updated_at IS NULL THEN claude_artifacts.updated_at
                WHEN claude_artifacts.updated_at IS NULL OR excluded.updated_at > claude_artifacts.updated_at THEN excluded.updated_at
                ELSE claude_artifacts.updated_at END`
    ).bind(snapshot.project_id, a.url, a.title, a.updated_at ?? null, now);
    const claim = (url: string, threadId: string, latest: boolean) => env.DB.prepare(
        `INSERT INTO claude_artifact_threads (artifact_id, thread_id, at)
         SELECT id, ?1, ?2 FROM claude_artifacts WHERE project_id = ?3 AND url = ?4
         ON CONFLICT (artifact_id, thread_id) DO ${latest ? "UPDATE SET at = excluded.at" : "NOTHING"}`
    ).bind(threadId, now, snapshot.project_id, url);
    const statements = (snapshot.artifacts ?? []).map(upsert);
    const self = snapshot.this_thread;
    if (self) {
        const card = self.card;
        // a list is newest first, so claim it oldest first; the card's latest one goes last, on top
        const listed = (card.artifacts ?? []).filter(a => a.url !== card.artifact?.url).reverse();
        for (const a of listed) {
            statements.push(upsert(a), claim(a.url, self.thread_id, false));
        }
        if (card.artifact) {
            const fromList = card.artifacts?.find(a => a.url === card.artifact!.url);
            statements.push(upsert({...card.artifact, updated_at: fromList?.updated_at}), claim(card.artifact.url, self.thread_id, true));
        }
    }
    return statements;
}

/* The card's columns, in order. A card that matches the stored one keeps its time, so a repeat isn't "New". */
const cardColumns = [
    "headline", "ask_kind", "ask_text", "progress_done", "progress_total", "progress_now",
    "artifact_title", "artifact_url", "topic", "keywords", "ask_where"
] as const;

function cardValues(card: SnapshotCard): (string | number | null)[] {
    const keywords = card.keywords?.map(k => k.trim()).filter(Boolean);
    return [
        card.headline ?? null, card.ask?.kind ?? null, card.ask?.text ?? null,
        card.progress?.done ?? null, card.progress?.total ?? null, card.progress?.now ?? null,
        card.artifact?.title ?? null, card.artifact?.url ?? null,
        card.topic ?? null, keywords?.length ? JSON.stringify(keywords) : null,
        card.ask?.where?.trim() || null
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
    const [projects, threads, prs, topics, artifacts, claims, todos] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM claude_projects ORDER BY last_synced_at DESC"),
        env.DB.prepare("SELECT * FROM claude_threads ORDER BY created_at"),
        env.DB.prepare("SELECT * FROM claude_prs WHERE thread_id IS NOT NULL ORDER BY number DESC"),
        env.DB.prepare("SELECT * FROM claude_topics ORDER BY at DESC"),
        env.DB.prepare("SELECT * FROM claude_artifacts ORDER BY COALESCE(updated_at, first_seen_at) DESC, id DESC"),
        env.DB.prepare("SELECT * FROM claude_artifact_threads ORDER BY at DESC"),
        // to-dos threads left for Jon; a thread's link says which Claude thread it is
        env.DB.prepare(`SELECT id, text, link, added_at, thread_url, worth, why, size, delay_class, due_on, needs, done_when, waits_on,
                interest_guess, interest_reason, interest_answer, where_spot, where_by, waiting_for, check_back_on
         FROM checklist_items WHERE done_at IS NULL AND thread_url IS NOT NULL ORDER BY added_at DESC`)
    ]);
    const todosBy = groupBy(todos.results as TodoRow[], r => claudeThreadIdOf(r.thread_url) ?? "");
    const threadRows = threads.results as ThreadRow[];
    const prsBy = groupBy(prs.results as PrRow[], r => r.thread_id!);
    const topicsBy = groupBy(topics.results as TopicRow[], r => r.thread_id);
    const artifactsBy = groupBy(artifacts.results as ArtifactRow[], r => r.project_id);
    const claimRows = claims.results as ArtifactThreadRow[];
    const threadsOf = groupBy(claimRows, r => String(r.artifact_id));
    const artifactIdsBy = groupBy(claimRows, r => r.thread_id);
    return (projects.results as ProjectRow[]).map(p => {
        const projectArtifacts = (artifactsBy.get(p.id) ?? []).map(a => artifactOf(a, threadsOf.get(String(a.id)) ?? []));
        const project: ClaudeProject = {
            id: p.id,
            name: p.name,
            url: claudeProjectUrl(p.id),
            hidden: p.hidden === 1,
            firstSeenAt: p.first_seen_at,
            lastSyncedAt: p.last_synced_at,
            reach: p.reach ?? "open",
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
                if (t.set_aside_until) thread.setAsideUntil = t.set_aside_until;
                if (t.set_aside_by) thread.setAsideBy = t.set_aside_by;
                const card = cardOf(t);
                if (card) thread.card = card;
                const threadPrs = prsBy.get(t.id)?.filter(r => r.project_id === p.id);
                if (threadPrs?.length) thread.prs = threadPrs.map(prOf);
                const ownIds = new Set((artifactIdsBy.get(t.id) ?? []).map(r => r.artifact_id));
                const own = projectArtifacts.filter(a => ownIds.has(a.id));
                if (own.length) thread.artifactIds = own.map(a => a.id);
                const past = (topicsBy.get(t.id) ?? []).filter(r => r.topic !== t.topic)
                    .map(r => [r.topic, ...parseKeywords(r.keywords)].join(" "));
                if (past.length) thread.pastTopics = past;
                const threadTodos = todosBy.get(t.id);
                if (threadTodos?.length) thread.todos = threadTodos.map(todoOf);
                return thread;
            })
        };
        if (p.short_name) project.shortName = p.short_name;
        if (p.artifacts_since) project.artifactsSince = p.artifacts_since;
        if (projectArtifacts.length) project.artifacts = projectArtifacts;
        return project;
    });
}

/* ---- Finding a thread in any project ---- */

export type FoundThread = {
    project: string,
    project_id: string,
    thread_id: string,
    title: string,
    state: ClaudeThreadState,
    last_activity_at?: string,
    /* as list_threads gives it (cse_...); missing until its project syncs with session ids */
    session_id?: string,
    /* the same session as claude-code-remote's tools take it (get_session, list_events, create_trigger) */
    remote_session_id?: string,
    link: string,
    /* false: its project's latest list didn't have it, so it may be archived */
    listed: boolean
};

type FoundRow = {
    id: string, project_id: string, title: string, state: ClaudeThreadState, last_activity_at: string | null,
    last_seen_at: string, session_id: string | null, name: string, short_name: string | null, last_synced_at: string
};

/* The platform names one session two ways: cse_<id> in a project's thread list, session_<id> in claude-code-remote's
   tools. Seen 2026-11-10 and documented nowhere, so the id as listed goes along with it. */
export const remoteSessionOf = (id: string): string | undefined => /^cse_\w+$/.test(id) ? `session_${id.slice(4)}` : undefined;

/* Threads in any of Jon's projects by words in their title or their project's name, for reaching one from
   another project: best match first, then the most recently active. */
export async function findClaudeThreads(env: Env, query: string, projectId?: string, limit = 15): Promise<FoundThread[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (await env.DB.prepare(
        `SELECT t.id, t.project_id, t.title, t.state, t.last_activity_at, t.last_seen_at, t.session_id,
                p.name, p.short_name, p.last_synced_at
         FROM claude_threads t JOIN claude_projects p ON p.id = t.project_id
         WHERE ?1 IS NULL OR t.project_id = ?1
         ORDER BY COALESCE(t.last_activity_at, t.last_seen_at) DESC`
    ).bind(projectId ?? null).all<FoundRow>()).results;
    return rows
        .map(r => {
            const title = r.title.toLowerCase();
            // a thread's own ids count too, so either id finds its project and the other id
            const haystack = `${title} ${r.name} ${r.short_name ?? ""} ${r.id} ${r.session_id ?? ""}`.toLowerCase();
            const score = words.length === 0 ? 1
                : words.every(w => haystack.includes(w)) ? words.filter(w => title.includes(w)).length + 1 : 0;
            return {r, score};
        })
        .filter(m => m.score > 0)
        // a stable sort, so equal scores stay most recently active first
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({r}) => {
            const found: FoundThread = {
                project: r.short_name ?? r.name,
                project_id: r.project_id,
                thread_id: r.id,
                title: r.title,
                state: r.state,
                link: claudeThreadUrl(r.project_id, r.id),
                listed: r.last_seen_at >= r.last_synced_at
            };
            if (r.last_activity_at) found.last_activity_at = r.last_activity_at;
            if (r.session_id) {
                found.session_id = r.session_id;
                const remote = remoteSessionOf(r.session_id);
                if (remote) found.remote_session_id = remote;
            }
            return found;
        });
}

type TodoRow = {
    id: string, text: string, link: string | null, added_at: string, thread_url: string,
    worth: 1 | 2 | 3 | null, why: string | null, size: TodoSize | null, delay_class: DelayClass | null, due_on: string | null,
    needs: string | null, done_when: string | null, waits_on: string | null,
    interest_guess: InterestGuess | null, interest_reason: string | null, interest_answer: InterestAnswer | null,
    where_spot: string | null, where_by: "claude" | "jon" | null,
    waiting_for: string | null, check_back_on: string | null
};

const stringsOf = (json: string | null): string[] | undefined => {
    try {
        const list = json ? JSON.parse(json) : undefined;
        return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : undefined;
    } catch {
        return undefined;
    }
};

/* The Claude thread a checked-in thread's link points at: claude.ai/code/project/<project>?thread=<id> */
export function claudeThreadIdOf(url: string): string | undefined {
    try {
        return new URL(url).searchParams.get("thread") ?? undefined;
    } catch {
        return undefined;
    }
}

function todoOf(r: TodoRow): ClaudeTodo {
    const todo: ClaudeTodo = {id: r.id, text: r.text, addedAt: r.added_at};
    if (r.link) todo.link = r.link;
    if (r.worth) todo.worth = r.worth;
    if (r.why) todo.why = r.why;
    if (r.size) todo.size = r.size;
    if (r.delay_class) todo.delayClass = r.delay_class;
    if (r.due_on) todo.dueOn = r.due_on;
    const needs = stringsOf(r.needs), doneWhen = stringsOf(r.done_when), waitsOn = stringsOf(r.waits_on);
    if (needs) todo.needs = needs;
    if (doneWhen) todo.doneWhen = doneWhen;
    if (waitsOn) todo.waitsOn = waitsOn;
    if (r.waiting_for) {
        todo.waitingFor = {who: r.waiting_for};
        if (r.check_back_on) todo.waitingFor.checkBackOn = r.check_back_on;
    }
    if (r.where_spot) {
        todo.where = r.where_spot;
        todo.whereBy = r.where_by ?? "claude";
    }
    if (r.interest_guess) {
        todo.interest = {guess: r.interest_guess};
        if (r.interest_reason) todo.interest.reason = r.interest_reason;
        if (r.interest_answer) todo.interest.answer = r.interest_answer;
    }
    return todo;
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
    if (t.ask_kind && t.ask_text) {
        card.ask = {kind: t.ask_kind, text: t.ask_text};
        // Jon's correction holds for the ask he made it on; a new ask takes Claude's guess again
        if (t.ask_where_jon && t.ask_where_jon_for === t.ask_text) {
            card.ask.where = t.ask_where_jon;
            card.ask.whereBy = "jon";
        } else if (t.ask_where) {
            card.ask.where = t.ask_where;
            card.ask.whereBy = "claude";
        }
    }
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

function artifactOf(r: ArtifactRow, claims: ArtifactThreadRow[]): ClaudeArtifact {
    const artifact: ClaudeArtifact = {id: r.id, title: r.title, url: r.url, firstSeenAt: r.first_seen_at, threadIds: claims.map(c => c.thread_id)};
    if (r.updated_at) artifact.updatedAt = r.updated_at;
    if (r.opened_at) artifact.openedAt = r.opened_at;
    return artifact;
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

/* Jon puts a pin in an ask from Your move (until a day), or brings it back (null). The thread's flare on his map
   follows, so the two never disagree. */
export async function setThreadAside(env: Env, threadId: string, until: string | null): Promise<void> {
    if (until !== null && !isDay(until)) {
        throw new HttpError(422, "Set it aside until a day like 2026-12-07.");
    }
    const before = await env.DB.prepare("SELECT * FROM claude_threads WHERE id = ?").bind(threadId).first<ThreadRow>();
    if (!before) {
        throw new HttpError(404, "There is no such thread on the Claude map.");
    }
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE claude_threads SET set_aside_until = ?, set_aside_by = ? WHERE id = ?")
        .bind(until, until ? "jon" : null, threadId).run();
    await setItemsAside(env, threadId, until);
    if ((before.set_aside_until ?? null) !== until) {
        await env.DB.prepare(
            `INSERT INTO claude_events (at, kind, project_id, thread_id, from_value, to_value, snapshot_hash, by_thread)
             VALUES (?, 'set_aside', ?, ?, ?, ?, '', NULL)`
        ).bind(now, before.project_id, threadId, before.set_aside_until, until).run();
    }
}

/* Jon opened it from the map: it stops reading "New" or "Updated" until it changes again */
export async function markArtifactOpened(env: Env, artifactId: number): Promise<void> {
    const result = await env.DB.prepare("UPDATE claude_artifacts SET opened_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), artifactId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such artifact on the Claude map.");
    }
}

export async function setProjectHidden(env: Env, projectId: string, hidden: boolean): Promise<void> {
    const result = await env.DB.prepare("UPDATE claude_projects SET hidden = ? WHERE id = ?").bind(hidden ? 1 : 0, projectId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such project on the Claude map.");
    }
}

/* ---- The event log ---- */

type MapState = {
    project: ProjectRow | null,
    threads: Map<string, ThreadRow>,
    prs: Map<string, PrRow>,
    /* by link, with the thread that last claimed it */
    artifacts: Map<string, ArtifactState>
};
type ArtifactState = ArtifactRow & {thread_id: string | null};

async function mapOf(env: Env, projectId: string): Promise<MapState> {
    const [project, threads, prs, artifacts] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM claude_projects WHERE id = ?").bind(projectId),
        env.DB.prepare("SELECT * FROM claude_threads WHERE project_id = ?").bind(projectId),
        env.DB.prepare("SELECT * FROM claude_prs WHERE project_id = ?").bind(projectId),
        env.DB.prepare(
            `SELECT a.*, (SELECT thread_id FROM claude_artifact_threads c WHERE c.artifact_id = a.id ORDER BY at DESC LIMIT 1) AS thread_id
             FROM claude_artifacts a WHERE project_id = ?`
        ).bind(projectId)
    ]);
    return {
        project: (project.results[0] as ProjectRow | undefined) ?? null,
        threads: new Map((threads.results as ThreadRow[]).map(t => [t.id, t])),
        prs: new Map((prs.results as PrRow[]).map(r => [`${r.repo}#${r.number}`, r])),
        artifacts: new Map((artifacts.results as ArtifactState[]).map(a => [a.url, a]))
    };
}

/* Threads that waited on Jon (needs you, ready to review) before a sync and are working after it: he answered */
export function answeredBetween(before: MapState, after: MapState): string[] {
    return [...after.threads.values()]
        .filter(t => t.state === "working" && ["blocked", "review_ready"].includes(before.threads.get(t.id)?.state ?? ""))
        .map(t => t.id);
}

type Change = {kind: ClaudeEventKind, threadId?: string, pr?: string, from?: string | null, to?: string | null};

const askOf = (t: ThreadRow) => t.ask_kind && t.ask_text ? `${t.ask_kind}: ${t.ask_text}` : null;
/* listed in the project's latest sync */
const listed = (t: ThreadRow, p: ProjectRow | null) => !!p && t.last_seen_at >= p.last_synced_at;

/* What one sync changed, comparing the map before and after it */
export function changesBetween(before: MapState, after: MapState): Change[] {
    const changes: Change[] = [];
    const a = after.project, b = before.project;
    if (!a) {
        return changes;
    }
    if (!b) {
        changes.push({kind: "project_new", to: a.name});
    } else {
        if (a.name !== b.name) changes.push({kind: "project_renamed", from: b.name, to: a.name});
        if (a.short_name !== b.short_name) changes.push({kind: "short_name", from: b.short_name, to: a.short_name});
    }
    for (const [id, t] of after.threads) {
        const old = before.threads.get(id);
        if (!old) {
            changes.push({kind: "thread_new", threadId: id, to: t.title, from: null});
            changes.push({kind: "thread_state", threadId: id, from: null, to: t.state});
            continue;
        }
        if (t.title !== old.title) changes.push({kind: "thread_renamed", threadId: id, from: old.title, to: t.title});
        if (t.state !== old.state) changes.push({kind: "thread_state", threadId: id, from: old.state, to: t.state});
        if (askOf(t) !== askOf(old)) changes.push({kind: "ask", threadId: id, from: askOf(old), to: askOf(t)});
        if (t.set_aside_until !== old.set_aside_until) changes.push({kind: "set_aside", threadId: id, from: old.set_aside_until, to: t.set_aside_until});
        if (t.headline !== old.headline && t.headline) changes.push({kind: "reply", threadId: id, from: old.headline, to: t.headline});
        if (listed(old, b) && !listed(t, a)) changes.push({kind: "thread_unlisted", threadId: id, to: t.title});
    }
    for (const [key, r] of after.prs) {
        const old = before.prs.get(key);
        const threadId = r.thread_id ?? undefined;
        if (!old) {
            changes.push({kind: "pr_new", pr: key, threadId, to: r.title});
            continue;
        }
        if (r.state !== old.state) changes.push({kind: "pr_state", pr: key, threadId, from: old.state, to: r.state});
        if ((r.ci ?? null) !== (old.ci ?? null) && r.ci) changes.push({kind: "pr_ci", pr: key, threadId, from: old.ci, to: r.ci});
    }
    // what was already there when the map started counting artifacts isn't news, here as on the map
    const since = new Date(Date.parse(a.artifacts_since ?? a.first_seen_at) + 5 * 60000).toISOString();
    for (const [url, r] of after.artifacts) {
        const old = before.artifacts.get(url);
        const threadId = r.thread_id ?? undefined;
        if (!old) {
            if (r.first_seen_at > since && (r.updated_at ?? r.first_seen_at) > since) {
                changes.push({kind: "artifact_new", threadId, to: r.title});
            }
            continue;
        }
        if (r.updated_at && r.updated_at !== old.updated_at && r.updated_at > since) {
            changes.push({kind: "artifact_updated", threadId, to: r.title});
        }
    }
    return changes;
}

async function logChanges(env: Env, before: MapState, after: MapState, hash: string, by: string | undefined, now: string) {
    const projectId = after.project?.id;
    const changes = changesBetween(before, after);
    if (!projectId || changes.length === 0) {
        return;
    }
    await env.DB.batch(changes.map(c => env.DB.prepare(
        `INSERT INTO claude_events (at, kind, project_id, thread_id, pr, from_value, to_value, snapshot_hash, by_thread)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(now, c.kind, projectId, c.threadId ?? null, c.pr ?? null, c.from ?? null, c.to ?? null, hash, by ?? null)));
}

type EventRow = {
    id: number, at: string, kind: ClaudeEventKind, project_id: string, thread_id: string | null, pr: string | null,
    from_value: string | null, to_value: string | null, snapshot_hash: string, by_thread: string | null
};
type SnapshotRow = {hash: string, project_id: string, payload: string, received_at: string, applied_at: string | null};

function syncOf(r: SnapshotRow): ClaudeLogEntry {
    let s: Partial<Snapshot> = {};
    try {
        s = JSON.parse(r.payload);
    } catch {
        // kept as sent; a payload that doesn't parse still shows up as a sync
    }
    const sync: ClaudeLogEntry = {
        type: "sync", hash: r.hash, at: r.received_at, projectId: r.project_id,
        card: !!s.this_thread?.card, applied: !!r.applied_at
    };
    if (s.project_name) sync.projectName = s.project_name;
    if (s.this_thread?.thread_id) sync.by = s.this_thread.thread_id;
    if (s.threads) sync.threads = s.threads.length;
    if (s.prs) sync.prs = s.prs.length;
    if (s.artifacts) sync.artifacts = s.artifacts.length;
    if (s.this_thread?.state) sync.selfState = s.this_thread.state;
    return sync;
}

/* The log, newest first: what changed, and every sync, before the given time */
export async function listClaudeLog(env: Env, before: string | null, limit = 200): Promise<ClaudeLogEntry[]> {
    const until = before && isTime(before) ? before : "9999";
    const [events, syncs] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM claude_events WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?").bind(until, limit),
        env.DB.prepare("SELECT * FROM claude_snapshots WHERE received_at < ? ORDER BY received_at DESC LIMIT ?").bind(until, limit)
    ]);
    const entries: ClaudeLogEntry[] = [
        ...(events.results as EventRow[]).map(e => {
            const event: ClaudeLogEntry = {type: "event", id: e.id, at: e.at, kind: e.kind, projectId: e.project_id, sync: e.snapshot_hash};
            if (e.thread_id) event.threadId = e.thread_id;
            if (e.pr) event.pr = e.pr;
            if (e.from_value !== null) event.from = e.from_value;
            if (e.to_value !== null) event.to = e.to_value;
            if (e.by_thread) event.by = e.by_thread;
            return event;
        }),
        ...(syncs.results as SnapshotRow[]).map(syncOf)
    ];
    // a sync sorts below the changes it brought, which share its time
    const rank = (e: ClaudeLogEntry) => e.type === "event" ? 1 : 0;
    entries.sort((x, y) => y.at.localeCompare(x.at) || rank(y) - rank(x)
        || (x.type === "event" && y.type === "event" ? y.id - x.id : 0));
    // both lists stop at the limit, so past the older of their two ends the merge could miss entries
    const ends = [events.results, syncs.results].filter(r => r.length === limit)
        .map(r => (r.at(-1) as {at?: string, received_at?: string}))
        .map(r => r.at ?? r.received_at ?? "");
    const floor = ends.sort().at(-1);
    return floor ? entries.filter(e => e.at >= floor) : entries;
}

/* One sync exactly as Claude sent it, for debugging */
export async function getClaudeSnapshot(env: Env, hash: string): Promise<unknown> {
    const row = await env.DB.prepare("SELECT * FROM claude_snapshots WHERE hash = ?").bind(hash).first<SnapshotRow>();
    if (!row) {
        throw new HttpError(404, "There is no such sync.");
    }
    let payload: unknown = row.payload;
    try {
        payload = JSON.parse(row.payload);
    } catch {
        // shown as the text it was
    }
    return {hash: row.hash, projectId: row.project_id, receivedAt: row.received_at, appliedAt: row.applied_at, payload};
}
