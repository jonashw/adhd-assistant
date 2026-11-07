import { Env } from "./env";
import { HttpError } from "./http";
import type { Monologue } from "./monologues";
import { Stake } from "../../src/TrailTypes";

/* The spoken map (PRD v1.0, E7.S3, FR-33): autopilot turns a read monologue into dashed stakes. A stake is a
   proposed place kept beside the map, so the map itself never changes until Jon charts one. A drill plants it
   under where he was, a sideways move beside it, a surface move one level up, and a jump under the closest region.
   A topic that is already a place's name becomes a mention of that place instead of a duplicate. */

type Cursor = {kind: "note", id: string} | {kind: "stake", id: string};
type NoteRow = {id: string, label: string, type: "HOME" | "RabbitHole", parent_id: string | null};

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "about", "what", "when", "then", "some", "more"]);
const wordsOf = (text: string) => new Set(norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stopWords.has(w)));

/* Where a monologue starts: its thread's place, else where Jon last stood, else the first map's HOME */
async function startingPlace(env: Env, threadItemId?: string): Promise<{mapId: string, noteId: string} | undefined> {
    if (threadItemId) {
        const place = await env.DB.prepare("SELECT map_id, note_id FROM item_places WHERE item_id = ? AND is_primary = 1")
            .bind(threadItemId).first<{map_id: string, note_id: string}>();
        if (place) return {mapId: place.map_id, noteId: place.note_id};
    }
    const visit = await env.DB.prepare("SELECT map_id, note_id FROM visits WHERE kind = 'arrive' ORDER BY at DESC, id DESC LIMIT 1")
        .first<{map_id: string, note_id: string}>();
    if (visit) return {mapId: visit.map_id, noteId: visit.note_id};
    const home = await env.DB.prepare(
        "SELECT n.map_id, n.id FROM notes n JOIN maps m ON m.id = n.map_id WHERE n.type = 'HOME' ORDER BY m.created_at LIMIT 1"
    ).first<{map_id: string, id: string}>();
    return home ? {mapId: home.map_id, noteId: home.id} : undefined;
}

type Planted = Omit<Stake, "mapId" | "madeAt"> & {underStakeId?: string};

/* The placement itself, kept free of the database so it can be tested on its own */
export function plant(monologue: Monologue, notes: NoteRow[], startId: string, newId: () => string): Planted[] {
    const byId = new Map(notes.map(n => [n.id, n]));
    const home = notes.find(n => n.type === "HOME");
    const byLabel = new Map(notes.filter(n => n.type !== "HOME").map(n => [norm(n.label), n]));
    const regions = notes.filter(n => n.parent_id === home?.id);
    const planted: Planted[] = [];
    const stakeParent = new Map<string, Cursor>();
    const seen = new Map<string, Cursor>();

    const parentOf = (c: Cursor): Cursor | undefined => {
        if (c.kind === "stake") return stakeParent.get(c.id);
        const parent = byId.get(c.id)?.parent_id;
        return parent ? {kind: "note", id: parent} : undefined;
    };
    const homeCursor: Cursor | undefined = home ? {kind: "note", id: home.id} : undefined;
    const closestRegion = (topic: string): Cursor | undefined => {
        const words = wordsOf(topic);
        let best: {region: NoteRow, score: number} | undefined;
        for (const region of regions) {
            const score = [...wordsOf(region.label)].filter(w => words.has(w)).length;
            if (score > 0 && (!best || score > best.score)) best = {region, score};
        }
        return best ? {kind: "note", id: best.region.id} : homeCursor;
    };

    let cursor: Cursor | undefined = byId.has(startId) ? {kind: "note", id: startId} : homeCursor;
    let currentTopic: string | undefined;
    for (const u of monologue.utterances) {
        const reading = u.reading;
        if (!reading || !cursor) continue;
        // a question is for the crew, not a place
        if (reading.move === "ask") continue;
        const key = norm(reading.topic);
        if (key === currentTopic) continue;
        currentTopic = key;
        // a topic said before in this monologue: go back to it
        const earlier = seen.get(key);
        if (earlier) {
            cursor = earlier;
            continue;
        }
        // a topic that is already a place: a mention of it, not a new stake
        const existing = byLabel.get(key);
        if (existing) {
            planted.push({id: newId(), monologueId: monologue.id, seq: u.seq, topic: reading.topic, move: reading.move, noteId: existing.id});
            cursor = {kind: "note", id: existing.id};
            seen.set(key, cursor);
            continue;
        }
        const parent: Cursor | undefined =
            reading.move === "drill" ? cursor
            : reading.move === "surface" ? parentOf(parentOf(cursor) ?? cursor) ?? homeCursor
            : reading.move === "jump" || reading.move === "return" ? closestRegion(reading.topic)
            // sideways, and a new topic under stay: beside where he was
            : parentOf(cursor) ?? cursor;
        if (!parent) continue;
        const id = newId();
        planted.push({
            id, monologueId: monologue.id, seq: u.seq, topic: reading.topic, move: reading.move,
            ...(parent.kind === "note" ? {underNoteId: parent.id} : {underStakeId: parent.id})
        });
        stakeParent.set(id, parent);
        cursor = {kind: "stake", id};
        seen.set(key, cursor);
    }
    return planted;
}

/* Plant a read monologue's stakes once. Returns how many it planted (0 when already charted or not yet read). */
export async function chartMonologue(env: Env, monologue: Monologue): Promise<number> {
    if (monologue.read.state !== "read") return 0;
    const already = await env.DB.prepare("SELECT 1 FROM stakes WHERE monologue_id = ? LIMIT 1").bind(monologue.id).first();
    if (already) return 0;
    const start = await startingPlace(env, monologue.threadItemId);
    if (!start) return 0;
    const {results: notes} = await env.DB.prepare("SELECT id, label, type, parent_id FROM notes WHERE map_id = ?")
        .bind(start.mapId).all<NoteRow>();
    const planted = plant(monologue, notes, start.noteId, () => crypto.randomUUID());
    if (planted.length === 0) return 0;
    const madeAt = new Date().toISOString();
    // in order, so a stake under another stake finds its parent already there
    await env.DB.batch(planted.map(s => env.DB.prepare(
        `INSERT INTO stakes (id, monologue_id, seq, map_id, topic, move, under_note_id, under_stake_id, note_id, made_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(s.id, s.monologueId, s.seq, start.mapId, s.topic, s.move, s.underNoteId ?? null, s.underStakeId ?? null, s.noteId ?? null, madeAt)));
    return planted.length;
}

type StakeRow = {
    id: string, monologue_id: string, seq: number, map_id: string, topic: string, move: Stake["move"],
    under_note_id: string | null, under_stake_id: string | null, note_id: string | null, made_at: string
};

/* A map's open stakes, oldest first: still dashed, neither charted nor set aside */
export async function stakesFor(env: Env, mapId: string): Promise<Stake[]> {
    const {results} = await env.DB.prepare(
        "SELECT * FROM stakes WHERE map_id = ? AND settled IS NULL ORDER BY made_at, seq"
    ).bind(mapId).all<StakeRow>();
    return results.map(r => {
        const stake: Stake = {id: r.id, mapId: r.map_id, monologueId: r.monologue_id, seq: r.seq, topic: r.topic, move: r.move, madeAt: r.made_at};
        if (r.under_note_id) stake.underNoteId = r.under_note_id;
        if (r.under_stake_id) stake.underStakeId = r.under_stake_id;
        if (r.note_id) stake.noteId = r.note_id;
        return stake;
    });
}

/* Jon charted a stake (the app saved the place first) or said "Not now". Stakes under a dismissed one go with it. */
export async function settleStake(env: Env, mapId: string, stakeId: string, input: unknown): Promise<void> {
    const body = input as {settled?: unknown, noteId?: unknown};
    const now = new Date().toISOString();
    if (body?.settled === "charted") {
        if (typeof body.noteId !== "string" || body.noteId.length === 0 || body.noteId.length > 100) {
            throw new HttpError(422, "Charting a stake needs the place it became.");
        }
        const done = await env.DB.prepare(
            "UPDATE stakes SET settled = 'charted', settled_at = ?, charted_note_id = ? WHERE id = ? AND map_id = ? AND settled IS NULL"
        ).bind(now, body.noteId, stakeId, mapId).run();
        if (done.meta.changes === 0) throw new HttpError(404, "That stake is gone or already settled.");
        // stakes that hung under it now hang under the real place
        await env.DB.prepare("UPDATE stakes SET under_stake_id = NULL, under_note_id = ? WHERE under_stake_id = ? AND settled IS NULL")
            .bind(body.noteId, stakeId).run();
        return;
    }
    if (body?.settled === "dismissed") {
        await env.DB.prepare(
            `WITH RECURSIVE tree(id) AS (SELECT ? UNION SELECT s.id FROM stakes s JOIN tree t ON s.under_stake_id = t.id)
             UPDATE stakes SET settled = 'dismissed', settled_at = ? WHERE map_id = ? AND settled IS NULL AND id IN (SELECT id FROM tree)`
        ).bind(stakeId, now, mapId).run();
        return;
    }
    throw new HttpError(422, "Say charted or dismissed.");
}
