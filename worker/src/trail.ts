import { Env } from "./env";
import { HttpError } from "./http";
import { itemsFor } from "./items";
import { Signal, TrailData, Visit, VisitKind } from "../../src/TrailTypes";

/* The trail (visits) and the signals over places. Both live beside the map, so adding one never bumps the map's revision. */

export const visitKinds: readonly VisitKind[] = ["arrive", "untie", "tie_off"];
export type Trail = TrailData;

type VisitRow = {id: number, note_id: string, kind: Visit["kind"], at: string};
type SignalRow = {
    id: string, note_id: string, kind: Signal["kind"], source: Signal["source"], label: string,
    due_at: string | null, raised_at: string, item_id: string | null
};

const toVisit = (r: VisitRow): Visit => ({id: r.id, noteId: r.note_id, kind: r.kind, at: r.at});
const toSignal = (r: SignalRow): Signal => {
    const signal: Signal = {id: r.id, noteId: r.note_id, kind: r.kind, source: r.source, label: r.label, raisedAt: r.raised_at};
    if (r.due_at) signal.dueAt = r.due_at;
    if (r.item_id) signal.itemId = r.item_id;
    return signal;
};

const isNoteId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;

async function requireMap(env: Env, mapId: string) {
    const map = await env.DB.prepare("SELECT id FROM maps WHERE id = ?").bind(mapId).first();
    if (!map) {
        throw new HttpError(404, "No such map.");
    }
}

/* Open signals: not cleared, and fresh tracks not yet faded */
export const openSignalsSql = "cleared_at IS NULL AND (expires_at IS NULL OR expires_at > ?)";

export async function getTrail(env: Env, mapId: string): Promise<Trail> {
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [recent, last, signals] = await env.DB.batch([
        env.DB.prepare("SELECT id, note_id, kind, at FROM visits WHERE map_id = ? AND at >= ? ORDER BY at, id LIMIT 2000").bind(mapId, since),
        env.DB.prepare("SELECT note_id, MAX(at) AS at FROM visits WHERE map_id = ? AND kind = 'arrive' GROUP BY note_id").bind(mapId),
        env.DB.prepare(`SELECT * FROM signals WHERE map_id = ? AND ${openSignalsSql} ORDER BY raised_at`).bind(mapId, now)
    ]);
    // the tether needs the last tie-off or untie even when it is older than a day
    const tether = await env.DB.prepare(
        "SELECT id, note_id, kind, at FROM visits WHERE map_id = ? AND kind != 'arrive' AND at < ? ORDER BY at DESC, id DESC LIMIT 1"
    ).bind(mapId, since).first<VisitRow>();
    const recentVisits = (recent.results as VisitRow[]).map(toVisit);
    const {items, unplaced} = await itemsFor(env, mapId);
    return {
        items, unplaced,
        recent: tether ? [toVisit(tether), ...recentVisits] : recentVisits,
        lastArrivedAt: Object.fromEntries((last.results as {note_id: string, at: string}[]).map(r => [r.note_id, r.at])),
        signals: (signals.results as SignalRow[]).map(toSignal)
    };
}

export async function addVisit(env: Env, mapId: string, input: unknown): Promise<Visit> {
    const body = input as {noteId?: unknown, kind?: unknown};
    if (!isNoteId(body?.noteId) || !visitKinds.includes(body.kind as VisitKind)) {
        throw new HttpError(422, "A visit needs a place and a kind.");
    }
    await requireMap(env, mapId);
    const at = new Date().toISOString();
    const row = await env.DB.prepare("INSERT INTO visits (map_id, note_id, kind, at) VALUES (?, ?, ?, ?) RETURNING id")
        .bind(mapId, body.noteId, body.kind, at).first<{id: number}>();
    if (body.kind === "arrive") {
        //Jon has seen the fresh tracks here
        await env.DB.prepare("UPDATE signals SET cleared_at = ? WHERE map_id = ? AND note_id = ? AND kind = 'news' AND cleared_at IS NULL")
            .bind(at, mapId, body.noteId).run();
    }
    return {id: row!.id, noteId: body.noteId, kind: body.kind as VisitKind, at};
}

/* Jon plants a flag: a deadline with a short label */
export async function plantFlag(env: Env, mapId: string, input: unknown): Promise<Signal> {
    const body = input as {noteId?: unknown, label?: unknown, dueAt?: unknown};
    if (!isNoteId(body?.noteId)
        || typeof body.label !== "string" || body.label.trim().length === 0 || body.label.length > 200
        || typeof body.dueAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueAt)) {
        throw new HttpError(422, "A flag needs a place, a short label and a due date.");
    }
    await requireMap(env, mapId);
    const signal: Signal = {
        id: crypto.randomUUID(), noteId: body.noteId, kind: "deadline", source: "jon",
        label: body.label.trim(), dueAt: body.dueAt, raisedAt: new Date().toISOString()
    };
    await env.DB.prepare(
        "INSERT INTO signals (id, map_id, note_id, kind, source, label, due_at, raised_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(signal.id, mapId, signal.noteId, signal.kind, signal.source, signal.label, signal.dueAt, signal.raisedAt).run();
    return signal;
}

export async function clearSignal(env: Env, mapId: string, signalId: string): Promise<void> {
    await env.DB.prepare("UPDATE signals SET cleared_at = ? WHERE map_id = ? AND id = ? AND cleared_at IS NULL")
        .bind(new Date().toISOString(), mapId, signalId).run();
}
