import { Env } from "./env";
import { HttpError } from "./http";
import { claudeThreadIdOf, remoteSessionOf } from "./claude";
import { PlaceRef, checkTarget } from "./items";
import { ClaudeThreadState, PlaceListener, ProjectReach, projectReaches } from "../../src/ClaudeMapTypes";

/* Tell me when: threads in different projects tell each other when a place on Jon's map changes.

   Places hold the meaning, projects are workshops, threads are work at one place, and watches say who else hears when
   a place changes. Most watches have no rows: a place's listeners are the other projects whose threads check in there,
   as their place or through also_at. Rows (watches) are only for exceptions. Matching goes by places first: the
   sender's places, and their ancestors up to the region under HOME for watches on a whole area. Words are only a
   fallback, for a thread with no place yet.

   A match comes back to the sending thread as a "related" hint in its check_in or sync_project reply: who would want to
   know, whom to ask, the place, why it matched, and whether it may ask now. The thread asks over the platform's own
   route (a scheduled task bound to the listener's session, fired once, then switched off), and reports what it did with
   report_tell. Every tell is logged here, which backs the rate limit and the Told chip on the Log. */

/* At most one ask per watch per sending thread in this window */
export const tellWindowHours = 24;
/* The account allows 100 fires an hour, for everything; tells hold back well before that */
export const tellsPerHour = 80;
/* Word matches are a fallback, so they stay few */
const wordMatchesMax = 3;

export type TellOutcome = "sent" | "skipped" | "answered" | "failed";
export const tellOutcomes: readonly TellOutcome[] = ["sent", "skipped", "answered", "failed"];

export type Related = {
    /* pass to report_tell once you've asked them, or decided not to */
    tell_id: string,
    /* the project that would want to know */
    project: string,
    project_id: string,
    /* the place on Jon's map, region first */
    place?: string,
    /* why it matched, in a line */
    why: string,
    /* whom to ask: the best thread there, or the project's coordinator when no thread fits */
    ask: {thread: {title: string, thread_id: string, remote_session_id: string}}
        | {coordinator: {find_via: string, how: string}}
        | {nobody: string},
    ask_allowed: boolean,
    /* why not, when it isn't */
    reason?: string
};

type ThreadInfo = {
    id: string, project_id: string, title: string, state: ClaudeThreadState, session_id: string | null,
    last_activity_at: string | null, topic: string | null, keywords: string | null,
    project_name: string, short_name: string | null, reach: ProjectReach
};
type NoteRow = {id: string, parent_id: string | null, label: string, type: string};
type WatchRow = {
    id: string, listener_kind: "project" | "thread" | "jon", listener_id: string, map_id: string, note_id: string,
    scope: "place" | "area", words: string | null, note: string | null, jons_words: string | null,
    added_by: string, added_at: string, stopped_at: string | null
};
type TellRow = {
    id: string, watch_key: string, sender_project_id: string, sender_thread_id: string,
    listener_kind: "project" | "thread", listener_id: string, listener_project_id: string,
    map_id: string | null, note_id: string | null, why: string, offered_at: string,
    outcome: "offered" | TellOutcome, outcome_at: string | null, sent_at: string | null, outcome_note: string | null
};

const threadInfoSql = `SELECT t.id, t.project_id, t.title, t.state, t.session_id, t.last_activity_at, t.topic, t.keywords,
        p.name AS project_name, p.short_name, p.reach
    FROM claude_threads t JOIN claude_projects p ON p.id = t.project_id`;

const projectLabel = (t: {project_name: string, short_name: string | null}) => t.short_name ?? t.project_name;

const parseWords = (json: string | null): string[] => {
    try {
        const list = json ? JSON.parse(json) : [];
        return Array.isArray(list) ? list.filter((w): w is string => typeof w === "string" && w.trim().length > 0) : [];
    } catch {
        return [];
    }
};

async function threadInfo(env: Env, claudeThreadId: string): Promise<ThreadInfo | null> {
    return env.DB.prepare(`${threadInfoSql} WHERE t.id = ?`).bind(claudeThreadId).first<ThreadInfo>();
}

/* The places a Claude thread checked in at (its own and also_at), by its link's ?thread= */
async function placesOf(env: Env, claudeThreadId: string): Promise<(PlaceRef & {primary: boolean})[]> {
    const rows = (await env.DB.prepare(
        `SELECT li.url, ip.map_id, ip.note_id, ip.is_primary FROM linked_items li JOIN item_places ip ON ip.item_id = li.id
         WHERE li.kind = 'claude.thread' AND li.url LIKE ?`
    ).bind(`%thread=${claudeThreadId}%`).all<{url: string, map_id: string, note_id: string, is_primary: number}>()).results;
    return rows.filter(r => claudeThreadIdOf(r.url) === claudeThreadId)
        .map(r => ({mapId: r.map_id, noteId: r.note_id, primary: r.is_primary === 1}));
}

/* The Claude threads checked in at one place, with whether it is their own place */
async function threadsAt(env: Env, place: PlaceRef): Promise<(ThreadInfo & {primary: boolean})[]> {
    const items = (await env.DB.prepare(
        `SELECT li.url, ip.is_primary FROM item_places ip JOIN linked_items li ON li.id = ip.item_id
         WHERE ip.map_id = ? AND ip.note_id = ? AND li.kind = 'claude.thread' AND li.url IS NOT NULL`
    ).bind(place.mapId, place.noteId).all<{url: string, is_primary: number}>()).results;
    const primaryOf = new Map<string, boolean>();
    for (const item of items) {
        const id = claudeThreadIdOf(item.url);
        if (id) primaryOf.set(id, (primaryOf.get(id) ?? false) || item.is_primary === 1);
    }
    if (primaryOf.size === 0) {
        return [];
    }
    const ids = [...primaryOf.keys()];
    const rows = (await env.DB.prepare(`${threadInfoSql} WHERE t.id IN (${ids.map(() => "?").join(", ")})`)
        .bind(...ids).all<ThreadInfo>()).results;
    return rows.map(r => ({...r, primary: primaryOf.get(r.id) ?? false}));
}

/* A place and its ancestors, nearest first, stopping before HOME */
async function lineOf(env: Env, place: PlaceRef): Promise<NoteRow[]> {
    const line: NoteRow[] = [];
    let id: string | null = place.noteId;
    // a map is a tree, but a bad save shouldn't loop forever
    for (let depth = 0; id && depth < 50; depth++) {
        const note: NoteRow | null = await env.DB.prepare("SELECT id, parent_id, label, type FROM notes WHERE map_id = ? AND id = ?")
            .bind(place.mapId, id).first<NoteRow>();
        if (!note || note.type === "HOME") {
            break;
        }
        line.push(note);
        id = note.parent_id;
    }
    return line;
}

const pathText = (line: NoteRow[]) => [...line].reverse().map(n => n.label).join(" › ");

/* Words worth matching on: lowercase, four letters or more, and not the words every title has */
const commonWords = new Set([
    "with", "from", "into", "onto", "this", "that", "what", "when", "where", "which", "there", "their", "about", "after",
    "before", "every", "each", "some", "more", "than", "then", "them", "they", "your", "mine", "jon's", "jons",
    "make", "build", "design", "plan", "decide", "check", "find", "keep", "stop", "start", "move", "show", "help",
    "thread", "threads", "project", "projects", "claude", "across", "between", "without", "again", "page", "work"
]);
export const wordsOf = (text: string): string[] =>
    [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(w => w.length >= 4 && !commonWords.has(w)))];

/* The best thread of a project to ask about a place: one still at work there, with a session to reach */
function bestThread(candidates: ThreadInfo[]): ThreadInfo | undefined {
    const open: ClaudeThreadState[] = ["working", "blocked", "review_ready"];
    return candidates
        .filter(t => t.session_id && remoteSessionOf(t.session_id) && open.includes(t.state))
        .sort((a, b) => (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""))[0];
}

/* Whom to ask in a project: its best thread at the place, else its coordinator, found through any of its threads */
async function askTarget(env: Env, projectId: string, candidates: ThreadInfo[]): Promise<Related["ask"]> {
    const thread = bestThread(candidates);
    if (thread) {
        return {thread: {title: thread.title, thread_id: thread.id, remote_session_id: remoteSessionOf(thread.session_id!)!}};
    }
    const any = await env.DB.prepare(
        `SELECT session_id FROM claude_threads WHERE project_id = ? AND session_id IS NOT NULL
         ORDER BY COALESCE(last_activity_at, last_seen_at) DESC LIMIT 1`
    ).bind(projectId).first<{session_id: string}>();
    const via = any ? remoteSessionOf(any.session_id) : undefined;
    if (via) {
        return {coordinator: {
            find_via: via,
            how: "No thread there fits, so ask the project's coordinator: get_session with find_via gives its parent_session_id, "
                + "which is the coordinator's session. Bind the task to that."
        }};
    }
    return {nobody: "That project hasn't synced its session ids yet, so nobody there can be reached."};
}

type Match = {
    key: string,
    listenerKind: "project" | "thread",
    listenerId: string,
    projectId: string,
    projectName: string,
    place?: PlaceRef & {path: string},
    why: string,
    /* lower is better, so one listener gets its best reason only */
    rank: number,
    candidates: ThreadInfo[]
};

/* Who would want to hear about what this thread is doing. Empty when its project is Receive only or Walled. */
export async function matchesFor(env: Env, claudeThreadId: string): Promise<{sender: ThreadInfo, matches: Match[]} | undefined> {
    const sender = await threadInfo(env, claudeThreadId);
    if (!sender || sender.reach !== "open") {
        return undefined;
    }
    const [places, watches, stops] = await Promise.all([
        placesOf(env, claudeThreadId),
        env.DB.prepare("SELECT * FROM watches WHERE stopped_at IS NULL AND listener_kind != 'jon'").all<WatchRow>().then(r => r.results),
        env.DB.prepare("SELECT map_id, note_id, project_id FROM watch_stops").all<{map_id: string, note_id: string, project_id: string}>()
            .then(r => new Set(r.results.map(s => `${s.map_id}/${s.note_id}:${s.project_id}`)))
    ]);
    const senderText = [sender.title, sender.topic ?? "", ...parseWords(sender.keywords)].join(" ").toLowerCase();
    const matches: Match[] = [];
    // a watch's listener: its project, and for a thread watch the thread itself
    const watchListener = async (w: WatchRow): Promise<{projectId: string, projectName: string, reach: ProjectReach, thread?: ThreadInfo} | undefined> => {
        if (w.listener_kind === "thread") {
            const t = await threadInfo(env, w.listener_id);
            return t ? {projectId: t.project_id, projectName: projectLabel(t), reach: t.reach, thread: t} : undefined;
        }
        const p = await env.DB.prepare("SELECT name, short_name, reach FROM claude_projects WHERE id = ?")
            .bind(w.listener_id).first<{name: string, short_name: string | null, reach: ProjectReach}>();
        return p ? {projectId: w.listener_id, projectName: p.short_name ?? p.name, reach: p.reach} : undefined;
    };
    const wordHit = (w: WatchRow) => {
        const words = parseWords(w.words);
        return words.length === 0 ? true : words.find(word => senderText.includes(word.toLowerCase()));
    };

    for (const place of places) {
        const line = await lineOf(env, place);
        if (line.length === 0) {
            continue;
        }
        const at = {...place, path: pathText(line)};
        // derived: other projects whose threads check in here
        const here = await threadsAt(env, place);
        const byProject = new Map<string, (ThreadInfo & {primary: boolean})[]>();
        for (const t of here) {
            if (t.project_id === sender.project_id || t.reach === "walled" || stops.has(`${place.mapId}/${place.noteId}:${t.project_id}`)) {
                continue;
            }
            byProject.set(t.project_id, [...(byProject.get(t.project_id) ?? []), t]);
        }
        for (const [projectId, threads] of byProject) {
            const own = threads.find(t => t.primary) ?? threads[0];
            matches.push({
                key: `place:${place.mapId}/${place.noteId}:${projectId}`,
                listenerKind: "project", listenerId: projectId, projectId, projectName: projectLabel(own),
                place: at,
                why: `Its thread "${own.title}" ${own.primary ? "serves" : "also touches"} ${at.path}, ${place.primary ? "your place" : "a place you also touch"}.`,
                rank: place.primary ? 1 : 2,
                candidates: threads
            });
        }
        // explicit watches on this place, or on an area above it
        const lineIds = new Set(line.map(n => n.id));
        for (const w of watches.filter(w => w.map_id === place.mapId && (w.note_id === place.noteId || (w.scope === "area" && lineIds.has(w.note_id))))) {
            const hit = wordHit(w);
            if (!hit) continue;
            const listener = await watchListener(w);
            if (!listener || listener.reach === "walled" || listener.projectId === sender.project_id) continue;
            const over = line.find(n => n.id === w.note_id)!;
            const scope = w.note_id === place.noteId ? at.path : `${pathText(line.slice(line.indexOf(over)))} (the whole area)`;
            matches.push({
                key: `watch:${w.id}`,
                listenerKind: w.listener_kind as "project" | "thread", listenerId: w.listener_id,
                projectId: listener.projectId, projectName: listener.projectName,
                place: at,
                why: `${listener.thread ? `Its thread "${listener.thread.title}"` : "It"} watches ${scope}${typeof hit === "string" ? ` for "${hit}"` : ""}`
                    + `${w.note ? `: ${w.note}` : "."}`,
                rank: listener.thread ? 0 : 3,
                candidates: listener.thread ? [listener.thread] : here.filter(t => t.project_id === listener.projectId)
            });
        }
    }

    // words, only for a thread with no place yet
    if (places.length === 0) {
        const mine = new Set(wordsOf(senderText));
        const found: Match[] = [];
        for (const w of watches) {
            const words = parseWords(w.words);
            const hit = words.find(word => senderText.includes(word.toLowerCase()));
            if (!hit) continue;
            const listener = await watchListener(w);
            if (!listener || listener.reach === "walled" || listener.projectId === sender.project_id) continue;
            const line = await lineOf(env, {mapId: w.map_id, noteId: w.note_id});
            found.push({
                key: `watch:${w.id}`, listenerKind: w.listener_kind as "project" | "thread", listenerId: w.listener_id,
                projectId: listener.projectId, projectName: listener.projectName,
                place: line.length ? {mapId: w.map_id, noteId: w.note_id, path: pathText(line)} : undefined,
                why: `Your thread has no place yet, and its words use "${hit}", which ${listener.thread ? `the thread "${listener.thread.title}"` : "it"} watches for`
                    + `${w.note ? `: ${w.note}` : "."}`,
                rank: 4, candidates: listener.thread ? [listener.thread] : []
            });
        }
        // places other projects' threads serve, whose names share words with this thread's
        const served = (await env.DB.prepare(
            `SELECT DISTINCT ip.map_id, ip.note_id, n.label FROM item_places ip
             JOIN linked_items li ON li.id = ip.item_id AND li.kind = 'claude.thread'
             JOIN notes n ON n.map_id = ip.map_id AND n.id = ip.note_id AND n.type != 'HOME'`
        ).all<{map_id: string, note_id: string, label: string}>()).results;
        for (const s of served) {
            const label = wordsOf(s.label);
            const shared = label.filter(w => mine.has(w));
            if (label.length === 0 || shared.length < Math.min(2, label.length)) continue;
            const place = {mapId: s.map_id, noteId: s.note_id};
            const here = (await threadsAt(env, place)).filter(t => t.project_id !== sender.project_id && t.reach !== "walled"
                && !stops.has(`${s.map_id}/${s.note_id}:${t.project_id}`));
            const line = await lineOf(env, place);
            for (const projectId of new Set(here.map(t => t.project_id))) {
                const threads = here.filter(t => t.project_id === projectId);
                found.push({
                    key: `place:${s.map_id}/${s.note_id}:${projectId}`, listenerKind: "project", listenerId: projectId,
                    projectId, projectName: projectLabel(threads[0]),
                    place: {...place, path: pathText(line)},
                    why: `Your thread has no place yet, and its words ("${shared.join("\", \"")}") match ${pathText(line)}, where its thread "${threads[0].title}" works.`,
                    rank: 5, candidates: threads
                });
            }
        }
        matches.push(...found.slice(0, wordMatchesMax));
    }

    // one hint per listener, with its best reason
    const best = new Map<string, Match>();
    for (const m of matches.sort((a, b) => a.rank - b.rank)) {
        const who = `${m.listenerKind}:${m.listenerId}`;
        if (!best.has(who)) best.set(who, m);
    }
    return {sender, matches: [...best.values()]};
}

/* The related hints for a check_in or sync_project reply. Each match is logged once per window as an offered tell;
   one the thread already asked about (or skipped) today stays out, so a thread hears each one once a day at most.
   Never fails the call it rides on. */
export async function relatedFor(env: Env, claudeThreadId: string | undefined): Promise<Related[]> {
    if (!claudeThreadId) {
        return [];
    }
    try {
        const found = await matchesFor(env, claudeThreadId);
        if (!found || found.matches.length === 0) {
            return [];
        }
        const now = new Date();
        const since = new Date(now.getTime() - tellWindowHours * 36e5).toISOString();
        const hour = new Date(now.getTime() - 36e5).toISOString();
        const sentLastHour = (await env.DB.prepare("SELECT COUNT(*) AS n FROM tells WHERE sent_at > ?").bind(hour).first<{n: number}>())?.n ?? 0;
        const related: Related[] = [];
        for (const m of found.matches) {
            const earlier = await env.DB.prepare(
                "SELECT * FROM tells WHERE sender_thread_id = ? AND watch_key = ? AND offered_at > ? ORDER BY offered_at DESC LIMIT 1"
            ).bind(claudeThreadId, m.key, since).first<TellRow>();
            if (earlier && earlier.outcome !== "offered") {
                continue;
            }
            const id = earlier?.id ?? crypto.randomUUID();
            if (!earlier) {
                await env.DB.prepare(
                    `INSERT INTO tells (id, watch_key, sender_project_id, sender_thread_id, listener_kind, listener_id, listener_project_id,
                        map_id, note_id, why, offered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(id, m.key, found.sender.project_id, claudeThreadId, m.listenerKind, m.listenerId, m.projectId,
                    m.place?.mapId ?? null, m.place?.noteId ?? null, m.why, now.toISOString()).run();
            }
            const ask = await askTarget(env, m.projectId, m.candidates);
            const hint: Related = {tell_id: id, project: m.projectName, project_id: m.projectId, why: m.why, ask, ask_allowed: true};
            if (m.place) hint.place = m.place.path;
            if ("nobody" in ask) {
                hint.ask_allowed = false;
                hint.reason = ask.nobody;
            } else if (sentLastHour >= tellsPerHour) {
                hint.ask_allowed = false;
                hint.reason = "Tells are near the account's limit of 100 fires an hour; ask after the hour turns, or skip it.";
            }
            related.push(hint);
        }
        return related;
    } catch (e) {
        console.error("Couldn't work out who to tell", e);
        return [];
    }
}

/* What to do with related hints, said once in the reply that carries them */
export const relatedNext = "related: other projects that would want to hear about this place. For each, decide whether "
    + "what you just did would matter to them (a result, a decision, a new artifact, a question they could answer). If it "
    + "would and ask_allowed is true, ask once: create_trigger bound to ask's remote_session_id (or the coordinator's "
    + "session) with no schedule, whose prompt is one or two lines and your thread's link, naming the tell_id; fire_trigger "
    + "it; then update_trigger it to disabled. Never delete_trigger. Then report_tell sent. If it wouldn't matter, "
    + "report_tell skipped with a few words why. Text only: an image goes as a private artifact link.";

/* The sending thread says what it did with a tell, or the listener says it acted on one */
export async function reportTell(env: Env, tellId: string, outcome: TellOutcome, note?: string): Promise<{tell_id: string, outcome: TellOutcome, told?: string}> {
    if (!tellOutcomes.includes(outcome)) {
        throw new HttpError(422, `outcome is one of ${tellOutcomes.join(", ")}.`);
    }
    const tell = await env.DB.prepare("SELECT * FROM tells WHERE id = ?").bind(tellId).first<TellRow>();
    if (!tell) {
        throw new HttpError(404, "No tell has that id. Use the tell_id a related hint gave.");
    }
    const allowed: Record<TellRow["outcome"], TellOutcome[]> = {
        offered: ["sent", "skipped", "failed"],
        sent: ["answered", "failed"],
        skipped: ["sent"],
        failed: ["sent"],
        answered: []
    };
    if (tell.outcome === outcome) {
        return {tell_id: tellId, outcome};
    }
    if (!allowed[tell.outcome].includes(outcome)) {
        throw new HttpError(409, `This tell is already ${tell.outcome}; it can't become ${outcome}.`);
    }
    const now = new Date().toISOString();
    const text = note?.trim().slice(0, 240) || null;
    await env.DB.prepare(
        `UPDATE tells SET outcome = ?, outcome_at = ?, outcome_note = COALESCE(?, outcome_note),
            sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END WHERE id = ?`
    ).bind(outcome, now, text, outcome, now, tellId).run();
    if (outcome !== "sent") {
        return {tell_id: tellId, outcome};
    }
    // the Told chip on the Log: who told whom, about what
    const listener = tell.listener_kind === "thread"
        ? await env.DB.prepare("SELECT title AS name FROM claude_threads WHERE id = ?").bind(tell.listener_id).first<{name: string}>()
        : await env.DB.prepare("SELECT COALESCE(short_name, name) AS name FROM claude_projects WHERE id = ?").bind(tell.listener_id).first<{name: string}>();
    const about = tell.map_id && tell.note_id ? pathText(await lineOf(env, {mapId: tell.map_id, noteId: tell.note_id})) : "";
    const who = listener?.name ?? tell.listener_id;
    await env.DB.prepare(
        `INSERT INTO claude_events (at, kind, project_id, thread_id, from_value, to_value, snapshot_hash, by_thread)
         VALUES (?, 'told', ?, ?, ?, ?, '', ?)`
    ).bind(now, tell.sender_project_id, tell.sender_thread_id, who, [about, text].filter(Boolean).join(": ") || null, tell.sender_thread_id).run();
    return {tell_id: tellId, outcome, told: who};
}

/* ---- Watches ---- */

export type WatchInput = {
    /* the thread adding it (cmsg id); it can only add watches for its own project, itself, or Jon */
    byClaudeThreadId: string,
    listener: "project" | "thread" | "jon",
    place: PlaceRef,
    scope: "place" | "area",
    words?: string[],
    note?: string,
    jonsWords: string
};

/* A thread adds a watch because Jon asked for one in words. Only for its own project, itself, or Jon. */
export async function addWatch(env: Env, input: WatchInput): Promise<{watch_id: string, listens: string, repeat: boolean}> {
    const by = await threadInfo(env, input.byClaudeThreadId);
    if (!by) {
        throw new HttpError(404, "This thread isn't on the Claude map yet: sync_project first.");
    }
    const jonsWords = input.jonsWords.trim();
    if (!jonsWords) {
        throw new HttpError(422, "A watch needs Jon's own words asking for it (jons_words).");
    }
    if (input.listener !== "jon" && by.reach === "walled") {
        throw new HttpError(403, `${projectLabel(by)} is Walled, so it can't listen. Only Jon can change that, on the Claude map.`);
    }
    // an area can be a whole region; a single place can't be HOME or a region
    if (input.scope === "place") {
        await checkTarget(env, input.place);
    }
    const line = await lineOf(env, input.place);
    if (line.length === 0) {
        throw new HttpError(422, "That's HOME, or no place at all. Pick a region or a place under it.");
    }
    const words = [...new Set((input.words ?? []).map(w => w.trim()).filter(Boolean))].slice(0, 8);
    const listenerId = input.listener === "project" ? by.project_id : input.listener === "thread" ? by.id : "jon";
    const wordsJson = words.length ? JSON.stringify(words) : null;
    const listens = `${input.listener === "jon" ? "Jon" : input.listener === "thread" ? `"${by.title}"` : projectLabel(by)} hears about `
        + `${input.scope === "area" ? "everything under " : ""}${pathText(line)}${words.length ? ` when "${words.join("\", \"")}" comes up` : ""}`;
    const existing = await env.DB.prepare(
        `SELECT id FROM watches WHERE stopped_at IS NULL AND listener_kind = ? AND listener_id = ? AND map_id = ? AND note_id = ?
         AND scope = ? AND words IS ?`
    ).bind(input.listener, listenerId, input.place.mapId, input.place.noteId, input.scope, wordsJson).first<{id: string}>();
    if (existing) {
        return {watch_id: existing.id, listens, repeat: true};
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
        `INSERT INTO watches (id, listener_kind, listener_id, map_id, note_id, scope, words, note, jons_words, added_by, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, input.listener, listenerId, input.place.mapId, input.place.noteId, input.scope, wordsJson,
        input.note?.trim().slice(0, 200) || null, jonsWords.slice(0, 500), by.id, new Date().toISOString()).run();
    return {watch_id: id, listens, repeat: false};
}

/* ---- What Jon sees and switches ---- */

/* Who outside a place's own threads hears when it changes, for the place's card. A project hears by itself when its
   threads check in here and another project's do too; stopped ones stay listed so Jon can let them hear again. */
export async function listenersAt(env: Env, place: PlaceRef): Promise<(PlaceListener & {stopped: boolean})[]> {
    const line = await lineOf(env, place);
    if (line.length === 0) {
        return [];
    }
    const [here, watches, stops] = await Promise.all([
        threadsAt(env, place),
        env.DB.prepare("SELECT * FROM watches WHERE stopped_at IS NULL AND map_id = ?").bind(place.mapId).all<WatchRow>().then(r => r.results),
        env.DB.prepare("SELECT project_id FROM watch_stops WHERE map_id = ? AND note_id = ?").bind(place.mapId, place.noteId)
            .all<{project_id: string}>().then(r => new Set(r.results.map(s => s.project_id)))
    ]);
    const listeners: (PlaceListener & {stopped: boolean})[] = [];
    const projects = new Map<string, ThreadInfo>();
    for (const t of here) {
        if (t.reach !== "walled" && !projects.has(t.project_id)) projects.set(t.project_id, t);
    }
    if (projects.size >= 2) {
        for (const [projectId, t] of projects) {
            const stopped = stops.has(projectId);
            listeners.push({
                key: `place:${projectId}`, kind: "derived", listener: "project", projectId, name: projectLabel(t), stopped,
                line: stopped ? `${projectLabel(t)} no longer hears about changes here` : `${projectLabel(t)} hears about changes here`
            });
        }
    }
    const lineIds = new Map(line.map(n => [n.id, n]));
    for (const w of watches.filter(w => w.note_id === place.noteId || (w.scope === "area" && lineIds.has(w.note_id)))) {
        const from = w.note_id === place.noteId ? undefined : lineIds.get(w.note_id)!.label;
        const words = parseWords(w.words);
        const when = words.length ? ` when "${words.join("\", \"")}" comes up` : "";
        const under = from ? ` (watching all of ${from})` : "";
        if (w.listener_kind === "jon") {
            listeners.push({key: `watch:${w.id}`, kind: "watch", listener: "jon", name: "You", stopped: false,
                line: `You asked to hear about changes here${when}${under}${w.jons_words ? `: "${w.jons_words}"` : ""}`, ...(from ? {from} : {})});
            continue;
        }
        const t = w.listener_kind === "thread" ? await threadInfo(env, w.listener_id) : undefined;
        const p = t ? {name: projectLabel(t), reach: t.reach, id: t.project_id}
            : await env.DB.prepare("SELECT id, COALESCE(short_name, name) AS name, reach FROM claude_projects WHERE id = ?")
                .bind(w.listener_id).first<{id: string, name: string, reach: ProjectReach}>();
        if (!p || p.reach === "walled") continue;
        const name = t ? `"${t.title}" in ${p.name}` : p.name;
        listeners.push({key: `watch:${w.id}`, kind: "watch", listener: w.listener_kind, projectId: p.id, name, stopped: false,
            line: `${name} hears about changes here${when}${under}${w.note ? `: ${w.note}` : ""}`, ...(from ? {from} : {})});
    }
    return listeners;
}

/* Jon stops a listener from a place's card, or lets a stopped project hear again */
export async function setListening(env: Env, place: PlaceRef, key: string, listening: boolean): Promise<void> {
    const derived = /^place:([\w-]{1,100})$/.exec(key);
    const watch = /^watch:([\w-]{1,100})$/.exec(key);
    if (derived) {
        await env.DB.prepare(listening
            ? "DELETE FROM watch_stops WHERE map_id = ? AND note_id = ? AND project_id = ?"
            : "INSERT OR IGNORE INTO watch_stops (map_id, note_id, project_id, stopped_at) VALUES (?, ?, ?, ?)"
        ).bind(...[place.mapId, place.noteId, derived[1], ...(listening ? [] : [new Date().toISOString()])]).run();
        return;
    }
    if (watch && !listening) {
        const result = await env.DB.prepare("UPDATE watches SET stopped_at = ? WHERE id = ? AND stopped_at IS NULL")
            .bind(new Date().toISOString(), watch[1]).run();
        if (!result.meta.changes) {
            throw new HttpError(404, "That watch is already stopped.");
        }
        return;
    }
    throw new HttpError(422, "Stop a listener by the key its line gave.");
}

/* Jon switches a project's reach on the Claude map. No connector call reaches this. */
export async function setProjectReach(env: Env, projectId: string, reach: unknown): Promise<void> {
    if (typeof reach !== "string" || !projectReaches.includes(reach as ProjectReach)) {
        throw new HttpError(422, `Reach is one of ${projectReaches.join(", ")}.`);
    }
    const result = await env.DB.prepare("UPDATE claude_projects SET reach = ? WHERE id = ?").bind(reach, projectId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such project on the Claude map.");
    }
}
