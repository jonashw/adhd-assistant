import { Env } from "./env";
import { HttpError } from "./http";
import { freshTracksDays, kindOfUrl, LinkedItem, PlaceSuggestion, ThreadState } from "../../src/TrailTypes";

/* Linked items: things outside the map that places point at. A Claude thread is one that also reports
   how it is doing; its state becomes at most one open signal, at its primary place. */

type ItemRow = {
    id: string, kind: LinkedItem["kind"], url: string | null, title: string,
    state: ThreadState | null, state_note: string | null, last_heard_at: string | null
};
type PlaceRow = {item_id: string, map_id: string, note_id: string, is_primary: number};

export type PlaceRef = {mapId: string, noteId: string};

const toItem = (row: ItemRow, places: PlaceRow[]): LinkedItem => {
    const item: LinkedItem = {
        id: row.id, kind: row.kind, title: row.title,
        places: places.map(p => ({noteId: p.note_id, primary: p.is_primary === 1}))
    };
    if (row.url) item.url = row.url;
    if (row.state) item.state = row.state;
    if (row.state_note) item.stateNote = row.state_note;
    if (row.last_heard_at) item.lastHeardAt = row.last_heard_at;
    return item;
};

export function checkUrl(url: unknown): string {
    if (typeof url !== "string" || url.length > 2000) {
        throw new HttpError(422, "That link is too long.");
    }
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        throw new HttpError(422, "That doesn't look like a link.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new HttpError(422, "Only web links can be linked.");
    }
    return parsed.toString();
}

const checkTitle = (title: unknown, fallback?: string): string => {
    const text = typeof title === "string" ? title.trim() : "";
    if (text.length === 0 && fallback) {
        return fallback.slice(0, 200);
    }
    if (text.length === 0 || text.length > 200) {
        throw new HttpError(422, "A title needs 1 to 200 characters.");
    }
    return text;
};

/* A place a signal can land on: on a map, not HOME, and not a top-level region right under HOME */
export async function checkTarget(env: Env, place: PlaceRef): Promise<{label: string}> {
    const note = await env.DB.prepare(
        `SELECT n.label, n.type, p.type AS parent_type FROM notes n
         LEFT JOIN notes p ON p.map_id = n.map_id AND p.id = n.parent_id
         WHERE n.map_id = ? AND n.id = ?`
    ).bind(place.mapId, place.noteId).first<{label: string, type: string, parent_type: string | null}>();
    if (!note) {
        throw new HttpError(404, "There is no such place.");
    }
    if (note.type === "HOME" || note.parent_type === "HOME") {
        throw new HttpError(422, `"${note.label}" is a whole region. Pick a place inside it.`);
    }
    return {label: note.label};
}

async function getItem(env: Env, id: string): Promise<LinkedItem | undefined> {
    const [items, places] = await env.DB.batch([
        env.DB.prepare("SELECT * FROM linked_items WHERE id = ?").bind(id),
        env.DB.prepare("SELECT * FROM item_places WHERE item_id = ? ORDER BY is_primary DESC").bind(id)
    ]);
    const row = (items.results as ItemRow[])[0];
    return row ? toItem(row, places.results as PlaceRow[]) : undefined;
}

async function primaryOf(env: Env, itemId: string): Promise<PlaceRef | undefined> {
    const row = await env.DB.prepare("SELECT map_id, note_id FROM item_places WHERE item_id = ? AND is_primary = 1")
        .bind(itemId).first<{map_id: string, note_id: string}>();
    return row ? {mapId: row.map_id, noteId: row.note_id} : undefined;
}

/* The one signal a thread's state stands for, replacing whatever it raised before */
async function raiseFor(env: Env, itemId: string): Promise<void> {
    const now = new Date();
    const item = await env.DB.prepare("SELECT * FROM linked_items WHERE id = ?").bind(itemId).first<ItemRow>();
    const statements = [
        env.DB.prepare("UPDATE signals SET cleared_at = ? WHERE item_id = ? AND cleared_at IS NULL").bind(now.toISOString(), itemId)
    ];
    const place = await primaryOf(env, itemId);
    if (item && place && item.state && item.state !== "working") {
        const note = item.state_note ? `: ${item.state_note}` : "";
        const [kind, label] =
            item.state === "waiting" ? ["request", `Claude is waiting on you${note}`]
            : item.state === "failed" ? ["trouble", `Claude ran into trouble${note}`]
            : ["news", `Claude finished${note}`];
        const expiresAt = kind === "news" ? new Date(now.getTime() + freshTracksDays * 864e5).toISOString() : null;
        statements.push(env.DB.prepare(
            `INSERT INTO signals (id, map_id, note_id, kind, source, label, raised_at, item_id, expires_at)
             VALUES (?, ?, ?, ?, 'claude', ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), place.mapId, place.noteId, kind, label.slice(0, 300), now.toISOString(), itemId, expiresAt));
    }
    await env.DB.batch(statements);
}

async function setPrimary(env: Env, itemId: string, place: PlaceRef): Promise<void> {
    await env.DB.batch([
        env.DB.prepare("UPDATE item_places SET is_primary = 0 WHERE item_id = ?").bind(itemId),
        env.DB.prepare(
            `INSERT INTO item_places (item_id, map_id, note_id, is_primary) VALUES (?, ?, ?, 1)
             ON CONFLICT (item_id, map_id, note_id) DO UPDATE SET is_primary = 1`
        ).bind(itemId, place.mapId, place.noteId)
    ]);
}

export type CheckIn = {threadId?: string, title?: string, url?: string, place?: PlaceRef, alsoAt?: PlaceRef[]};

/* A Claude thread checks in. The same link (or thread id) updates the same thread. */
export async function checkIn(env: Env, input: CheckIn): Promise<LinkedItem> {
    const url = input.url ? checkUrl(input.url) : undefined;
    let existing: ItemRow | null = null;
    if (input.threadId) {
        existing = await env.DB.prepare("SELECT * FROM linked_items WHERE id = ?").bind(input.threadId).first<ItemRow>();
        if (!existing) {
            throw new HttpError(404, "No thread has that id. Check in without one to start over.");
        }
    } else if (url) {
        existing = await env.DB.prepare("SELECT * FROM linked_items WHERE url = ?").bind(url).first<ItemRow>();
    }
    if (input.place) await checkTarget(env, input.place);
    for (const place of input.alsoAt ?? []) await checkTarget(env, place);

    const now = new Date().toISOString();
    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
        await env.DB.prepare(
            `UPDATE linked_items SET kind = 'claude.thread', title = ?, url = COALESCE(?, url),
             state = COALESCE(state, 'working'), last_heard_at = ? WHERE id = ?`
        ).bind(checkTitle(input.title, existing.title), url ?? null, now, id).run();
    } else {
        await env.DB.prepare(
            `INSERT INTO linked_items (id, kind, url, title, state, last_heard_at, created_at)
             VALUES (?, 'claude.thread', ?, ?, 'working', ?, ?)`
        ).bind(id, url ?? null, checkTitle(input.title), now, now).run();
    }
    if (input.place) {
        await setPrimary(env, id, input.place);
    }
    for (const place of input.alsoAt ?? []) {
        await env.DB.prepare("INSERT OR IGNORE INTO item_places (item_id, map_id, note_id, is_primary) VALUES (?, ?, ?, 0)")
            .bind(id, place.mapId, place.noteId).run();
    }
    await raiseFor(env, id);
    return (await getItem(env, id))!;
}

/* A thread says how it is doing; its signal follows */
export async function reportState(env: Env, threadId: string, state: ThreadState, note?: string): Promise<LinkedItem> {
    const text = note?.trim().slice(0, 240) || null;
    const result = await env.DB.prepare(
        "UPDATE linked_items SET state = ?, state_note = ?, last_heard_at = ? WHERE id = ? AND kind = 'claude.thread'"
    ).bind(state, text, new Date().toISOString(), threadId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "No thread has that id. Check in first.");
    }
    await raiseFor(env, threadId);
    return (await getItem(env, threadId))!;
}

/* Jon answers "Which place does this thread serve?", or moves a thread, from the app */
export async function placeItem(env: Env, itemId: string, place: PlaceRef): Promise<LinkedItem> {
    if (!await getItem(env, itemId)) {
        throw new HttpError(404, "That item is gone.");
    }
    await checkTarget(env, place);
    await setPrimary(env, itemId, place);
    await env.DB.prepare("DELETE FROM place_suggestions WHERE item_id = ?").bind(itemId).run();
    await raiseFor(env, itemId);
    return (await getItem(env, itemId))!;
}

/* A thread whose place isn't on the map suggests new names under the closest existing place. The map
   doesn't change: Jon charts it, picks another place, or says no. */
export async function suggestPlace(env: Env, threadId: string, under: PlaceRef, path: string[]): Promise<PlaceSuggestion> {
    const names = path.map(n => n.trim()).filter(Boolean);
    if (names.length === 0 || names.length > 3 || names.some(n => n.length > 120)) {
        throw new HttpError(422, "Suggest one to three names of up to 120 characters, outermost first.");
    }
    const item = await env.DB.prepare("SELECT kind FROM linked_items WHERE id = ?").bind(threadId).first<{kind: string}>();
    if (item?.kind !== "claude.thread") {
        throw new HttpError(404, "No thread has that id. Check in first.");
    }
    const parent = await env.DB.prepare("SELECT type FROM notes WHERE map_id = ? AND id = ?")
        .bind(under.mapId, under.noteId).first<{type: string}>();
    if (!parent) {
        throw new HttpError(404, "There is no such place to suggest under.");
    }
    if (parent.type === "HOME" && names.length < 2) {
        throw new HttpError(422, 'Right under HOME, suggest a region and a place inside it, like ["Music", "NYE party"].');
    }
    // if the whole path already exists, the thread should simply check in there
    let current: string | undefined = under.noteId;
    for (const name of names) {
        const child: {id: string} | null = current === undefined ? null : await env.DB.prepare(
            "SELECT id FROM notes WHERE map_id = ? AND parent_id = ? AND lower(label) = lower(?)"
        ).bind(under.mapId, current, name).first<{id: string}>();
        current = child?.id;
    }
    if (current) {
        throw new HttpError(409, `That place already exists: check in with place "${under.mapId}/${current}".`);
    }
    await env.DB.prepare(
        `INSERT INTO place_suggestions (item_id, map_id, under_note_id, path, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (item_id) DO UPDATE SET map_id = excluded.map_id, under_note_id = excluded.under_note_id,
            path = excluded.path, created_at = excluded.created_at`
    ).bind(threadId, under.mapId, under.noteId, JSON.stringify(names), new Date().toISOString()).run();
    return {mapId: under.mapId, underNoteId: under.noteId, path: names};
}

/* Jon pastes a link onto a place */
export async function addLink(env: Env, place: PlaceRef, input: unknown): Promise<LinkedItem> {
    const body = input as {url?: unknown, title?: unknown};
    const url = checkUrl(body?.url);
    const note = await env.DB.prepare("SELECT 1 FROM notes WHERE map_id = ? AND id = ?").bind(place.mapId, place.noteId).first();
    if (!note) {
        throw new HttpError(404, "There is no such place.");
    }
    const existing = await env.DB.prepare("SELECT id FROM linked_items WHERE url = ?").bind(url).first<{id: string}>();
    const id = existing?.id ?? crypto.randomUUID();
    if (!existing) {
        const kind = kindOfUrl(url);
        const parsed = new URL(url);
        const pr = /^\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(parsed.pathname);
        const fallback = kind === "github.pr" && pr ? `${pr[1]} PR #${pr[2]}`
            : kind === "claude.thread" ? "Claude thread"
            : kind === "claude.project" ? "Claude project"
            : parsed.hostname + parsed.pathname.replace(/\/$/, "");
        await env.DB.prepare(
            "INSERT INTO linked_items (id, kind, url, title, state, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, kind, url, checkTitle(body.title, fallback), null, new Date().toISOString()).run();
    }
    const hasPrimary = await primaryOf(env, id);
    await env.DB.prepare("INSERT OR IGNORE INTO item_places (item_id, map_id, note_id, is_primary) VALUES (?, ?, ?, ?)")
        .bind(id, place.mapId, place.noteId, hasPrimary ? 0 : 1).run();
    return (await getItem(env, id))!;
}

/* Unlink an item from a place. A pasted link with no places left is forgotten; a thread waits to be placed again. */
export async function removeLink(env: Env, place: PlaceRef, itemId: string): Promise<void> {
    await env.DB.prepare("DELETE FROM item_places WHERE item_id = ? AND map_id = ? AND note_id = ?")
        .bind(itemId, place.mapId, place.noteId).run();
    const item = await getItem(env, itemId);
    if (!item) {
        return;
    }
    if (item.places.length === 0 && item.kind !== "claude.thread") {
        await env.DB.prepare("DELETE FROM linked_items WHERE id = ?").bind(itemId).run();
        return;
    }
    await raiseFor(env, itemId);
}

/* The items linked to places on one map, and the Claude threads still waiting for a place */
export async function itemsFor(env: Env, mapId: string): Promise<{items: LinkedItem[], unplaced: LinkedItem[]}> {
    const [items, places, unplaced, suggestions] = await env.DB.batch([
        env.DB.prepare(
            `SELECT * FROM linked_items WHERE id IN (SELECT item_id FROM item_places WHERE map_id = ?) ORDER BY created_at`
        ).bind(mapId),
        env.DB.prepare("SELECT * FROM item_places WHERE map_id = ?").bind(mapId),
        env.DB.prepare(
            `SELECT * FROM linked_items WHERE kind = 'claude.thread' AND state != 'done'
             AND id NOT IN (SELECT item_id FROM item_places WHERE is_primary = 1) ORDER BY created_at`
        ),
        env.DB.prepare("SELECT * FROM place_suggestions")
    ]);
    type SuggestionRow = {item_id: string, map_id: string, under_note_id: string, path: string};
    const suggestionOf = new Map((suggestions.results as SuggestionRow[])
        .map(r => [r.item_id, {mapId: r.map_id, underNoteId: r.under_note_id, path: JSON.parse(r.path) as string[]}]));
    const placeRows = places.results as PlaceRow[];
    return {
        items: (items.results as ItemRow[]).map(r => toItem(r, placeRows.filter(p => p.item_id === r.id))),
        unplaced: (unplaced.results as ItemRow[]).map(r => {
            const item = toItem(r, []);
            const suggestion = suggestionOf.get(r.id);
            if (suggestion) item.suggestion = suggestion;
            return item;
        })
    };
}

/* Jon says a thread doesn't belong on the map: it and its signals go */
export async function forgetItem(env: Env, itemId: string): Promise<void> {
    await env.DB.prepare("DELETE FROM linked_items WHERE id = ?").bind(itemId).run();
}
