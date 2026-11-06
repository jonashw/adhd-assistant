import { Env } from "./env";
import { HttpError } from "./http";
import { checkTarget, checkUrl, PlaceRef } from "./items";
import { ChecklistItem, checklistDoneDays, checklistMaxPerCall } from "../../src/TrailTypes";

/* To-dos a Claude thread leaves for Jon at a place. They are Jon's to do: each says which thread asked and links back
   to it. A thread whose place is only suggested can still leave them; they wait on the suggestion and move to the place
   Jon charts or picks. The same words twice at one place are stored once. */

type Row = {
    id: string, map_id: string, note_id: string | null, text: string, text_key: string,
    item_group: string | null, link: string | null,
    thread_item_id: string | null, thread_title: string, thread_url: string | null,
    added_at: string, done_at: string | null, done_by: ChecklistItem["doneBy"] | null
};

const toItem = (row: Row): ChecklistItem => {
    const item: ChecklistItem = {id: row.id, text: row.text, addedAt: row.added_at, thread: {title: row.thread_title}};
    if (row.note_id) item.noteId = row.note_id;
    if (row.item_group) item.group = row.item_group;
    if (row.link) item.link = row.link;
    if (row.thread_item_id) item.thread.id = row.thread_item_id;
    if (row.thread_url) item.thread.url = row.thread_url;
    if (row.done_at) item.doneAt = row.done_at;
    if (row.done_by) item.doneBy = row.done_by;
    return item;
};

export const textKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

type Thread = {id: string, title: string, url: string | null};

async function requireThread(env: Env, threadId: string): Promise<Thread> {
    const thread = await env.DB.prepare("SELECT id, title, url FROM linked_items WHERE id = ? AND kind = 'claude.thread'")
        .bind(threadId).first<Thread>();
    if (!thread) {
        throw new HttpError(404, "No thread has that id. Check in first.");
    }
    return thread;
}

/* Where a thread's items go: the place it names, else its own place, else the place it suggested */
type Target = {mapId: string, noteId: string | null, label: string};

async function targetFor(env: Env, thread: Thread, place?: PlaceRef): Promise<Target> {
    if (place) {
        return {...place, label: (await checkTarget(env, place)).label};
    }
    const primary = await env.DB.prepare(
        `SELECT p.map_id, p.note_id, n.label FROM item_places p JOIN notes n ON n.map_id = p.map_id AND n.id = p.note_id
         WHERE p.item_id = ? AND p.is_primary = 1`
    ).bind(thread.id).first<{map_id: string, note_id: string, label: string}>();
    if (primary) {
        return {mapId: primary.map_id, noteId: primary.note_id, label: primary.label};
    }
    const suggestion = await env.DB.prepare("SELECT map_id, path FROM place_suggestions WHERE item_id = ?")
        .bind(thread.id).first<{map_id: string, path: string}>();
    if (suggestion) {
        return {mapId: suggestion.map_id, noteId: null, label: `${(JSON.parse(suggestion.path) as string[]).join(" › ")} (suggested)`};
    }
    throw new HttpError(422, "This thread has no place yet. Pass a place from find_places, or call suggest_place first; items can wait on a suggested place.");
}

const whereSql = (target: Target, threadId: string) => target.noteId
    ? {sql: "map_id = ? AND note_id = ?", binds: [target.mapId, target.noteId]}
    : {sql: "note_id IS NULL AND thread_item_id = ?", binds: [threadId]};

export type NewChecklistItem = {text: string, group?: string, link?: string};

export async function addChecklistItems(env: Env, threadId: string, place: PlaceRef | undefined, items: NewChecklistItem[]) {
    if (items.length === 0 || items.length > checklistMaxPerCall) {
        throw new HttpError(422, `Add 1 to ${checklistMaxPerCall} items at a time.`);
    }
    const clean = items.map(item => {
        const text = item.text.trim().replace(/\s*\n\s*/g, " ");
        if (text.length === 0 || text.length > 300) {
            throw new HttpError(422, "Each item needs 1 to 300 characters of text.");
        }
        const group = item.group?.trim() || null;
        if (group && group.length > 40) {
            throw new HttpError(422, "A group name can have up to 40 characters.");
        }
        return {text, key: textKey(text), group, link: item.link?.trim() ? checkUrl(item.link) : null};
    });
    const thread = await requireThread(env, threadId);
    const target = await targetFor(env, thread, place);
    const now = new Date().toISOString();
    // the same words twice in one call count once
    const unique = clean.filter((item, i) => clean.findIndex(c => c.key === item.key) === i);
    const results = await env.DB.batch(unique.map(item => env.DB.prepare(
        `INSERT OR IGNORE INTO checklist_items
            (id, map_id, note_id, text, text_key, item_group, link, thread_item_id, thread_title, thread_url, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(crypto.randomUUID(), target.mapId, target.noteId, item.text, item.key, item.group, item.link,
        thread.id, thread.title, thread.url, now)));
    const addedKeys = new Set(unique.filter((_, i) => results[i].results.length > 0).map(item => item.key));
    const where = whereSql(target, thread.id);
    const stored = (await env.DB.prepare(`SELECT * FROM checklist_items WHERE ${where.sql} AND text_key IN (SELECT value FROM json_each(?))`)
        .bind(...where.binds, JSON.stringify(unique.map(i => i.key))).all<Row>()).results;
    const byKey = new Map(stored.map(r => [r.text_key, r]));
    const describe = (key: string) => {
        const row = byKey.get(key)!;
        return {id: row.id, text: row.text, done: row.done_at !== null};
    };
    return {
        place: target.label,
        added: unique.filter(i => addedKeys.has(i.key)).map(i => describe(i.key)),
        already_there: unique.filter(i => !addedKeys.has(i.key) && byKey.has(i.key)).map(i => describe(i.key)),
        next: target.noteId
            ? "They show in Jon's What's next until he checks them off. Tell him in one line; don't repeat the list in chat."
            : "They wait on the suggested place and move there when Jon charts it (or picks another place for this thread)."
    };
}

export async function listChecklistItems(env: Env, input: {place?: PlaceRef, threadId?: string}) {
    let target: Target;
    let threadId = "";
    if (input.place) {
        target = {...input.place, label: (await checkTarget(env, input.place)).label};
    } else if (input.threadId) {
        const thread = await requireThread(env, input.threadId);
        threadId = thread.id;
        target = await targetFor(env, thread);
    } else {
        throw new HttpError(422, "Pass a place, or this thread's thread_id to list its own place.");
    }
    const where = whereSql(target, threadId);
    const rows = (await env.DB.prepare(`SELECT * FROM checklist_items WHERE ${where.sql} ORDER BY done_at IS NOT NULL, added_at, rowid`)
        .bind(...where.binds).all<Row>()).results;
    return {
        place: target.label,
        items: rows.map(r => ({
            id: r.id, text: r.text, group: r.item_group ?? undefined, link: r.link ?? undefined,
            done: r.done_at !== null,
            done_by: r.done_by === "claude" ? "a Claude thread" : r.done_by === "jon" ? "Jon" : undefined,
            added_by: r.thread_title, added_by_this_thread: input.threadId !== undefined && r.thread_item_id === input.threadId
        }))
    };
}

/* A thread checks off an item it added, once it saw it happen itself (the PR merged). Jon's own steps stay his to check. */
export async function completeChecklistItem(env: Env, threadId: string, id: string) {
    await requireThread(env, threadId);
    const row = await env.DB.prepare("SELECT * FROM checklist_items WHERE id = ?").bind(id).first<Row>();
    if (!row) {
        throw new HttpError(404, "No checklist item has that id.");
    }
    if (row.thread_item_id !== threadId) {
        throw new HttpError(403, "Only the thread that added an item can check it off. This one is Jon's to check.");
    }
    if (!row.done_at) {
        await env.DB.prepare("UPDATE checklist_items SET done_at = ?, done_by = 'claude' WHERE id = ?")
            .bind(new Date().toISOString(), id).run();
    }
    return {id, text: row.text, done: true, already_done: row.done_at !== null};
}

/* Jon checks an item off, or back on */
export async function setChecklistDone(env: Env, id: string, done: boolean): Promise<void> {
    const result = await (done
        ? env.DB.prepare("UPDATE checklist_items SET done_at = COALESCE(done_at, ?), done_by = COALESCE(done_by, 'jon') WHERE id = ?")
            .bind(new Date().toISOString(), id)
        : env.DB.prepare("UPDATE checklist_items SET done_at = NULL, done_by = NULL WHERE id = ?").bind(id)
    ).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "That item is gone.");
    }
}

export async function removeChecklistItem(env: Env, id: string): Promise<void> {
    await env.DB.prepare("DELETE FROM checklist_items WHERE id = ?").bind(id).run();
}

/* The items at this map's places (open, and done in the last week), plus those waiting on a suggested place */
export async function checklistFor(env: Env, mapId: string): Promise<ChecklistItem[]> {
    const since = new Date(Date.now() - checklistDoneDays * 864e5).toISOString();
    const rows = (await env.DB.prepare(
        "SELECT * FROM checklist_items WHERE map_id = ? AND (done_at IS NULL OR done_at > ?) ORDER BY added_at, rowid"
    ).bind(mapId, since).all<Row>()).results;
    return rows.map(toItem);
}
