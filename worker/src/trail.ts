import { Env } from "./env";
import { HttpError } from "./http";

/* The trail (visits) and the signals over places. Both live beside the map, so adding one never bumps the map's revision. */

export const visitKinds = ["arrive", "untie", "tie_off"] as const;
export type Visit = {id: number, noteId: string, kind: typeof visitKinds[number], at: string};
export type Signal = {
    id: string, noteId: string,
    kind: "deadline" | "request" | "trouble" | "news",
    source: "jon" | "claude" | "jira" | "calendar",
    label: string, dueAt?: string, raisedAt: string
};
export type Trail = {
    /* the last day of visits, oldest first: enough for the tether, string out and the weather */
    recent: Visit[],
    /* when each place was last arrived at, for staleness */
    lastArrivedAt: {[noteId: string]: string},
    signals: Signal[]
};

type VisitRow = {id: number, note_id: string, kind: Visit["kind"], at: string};
type SignalRow = {id: string, note_id: string, kind: Signal["kind"], source: Signal["source"], label: string, due_at: string | null, raised_at: string};

const toVisit = (r: VisitRow): Visit => ({id: r.id, noteId: r.note_id, kind: r.kind, at: r.at});
const toSignal = (r: SignalRow): Signal => {
    const signal: Signal = {id: r.id, noteId: r.note_id, kind: r.kind, source: r.source, label: r.label, raisedAt: r.raised_at};
    if (r.due_at) signal.dueAt = r.due_at;
    return signal;
};

const isNoteId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;

async function requireMap(env: Env, mapId: string) {
    const map = await env.DB.prepare("SELECT id FROM maps WHERE id = ?").bind(mapId).first();
    if (!map) {
        throw new HttpError(404, "No such map.");
    }
}

export async function getTrail(env: Env, mapId: string): Promise<Trail> {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [recent, last, signals] = await env.DB.batch([
        env.DB.prepare("SELECT id, note_id, kind, at FROM visits WHERE map_id = ? AND at >= ? ORDER BY at, id LIMIT 2000").bind(mapId, since),
        env.DB.prepare("SELECT note_id, MAX(at) AS at FROM visits WHERE map_id = ? AND kind = 'arrive' GROUP BY note_id").bind(mapId),
        env.DB.prepare("SELECT * FROM signals WHERE map_id = ? AND cleared_at IS NULL ORDER BY raised_at").bind(mapId)
    ]);
    // the tether needs the last tie-off or untie even when it is older than a day
    const tether = await env.DB.prepare(
        "SELECT id, note_id, kind, at FROM visits WHERE map_id = ? AND kind != 'arrive' AND at < ? ORDER BY at DESC, id DESC LIMIT 1"
    ).bind(mapId, since).first<VisitRow>();
    const recentVisits = (recent.results as VisitRow[]).map(toVisit);
    return {
        recent: tether ? [toVisit(tether), ...recentVisits] : recentVisits,
        lastArrivedAt: Object.fromEntries((last.results as {note_id: string, at: string}[]).map(r => [r.note_id, r.at])),
        signals: (signals.results as SignalRow[]).map(toSignal)
    };
}

export async function addVisit(env: Env, mapId: string, input: unknown): Promise<Visit> {
    const body = input as {noteId?: unknown, kind?: unknown};
    if (!isNoteId(body?.noteId) || !visitKinds.includes(body.kind as Visit["kind"])) {
        throw new HttpError(422, "A visit needs a place and a kind.");
    }
    await requireMap(env, mapId);
    const at = new Date().toISOString();
    const row = await env.DB.prepare("INSERT INTO visits (map_id, note_id, kind, at) VALUES (?, ?, ?, ?) RETURNING id")
        .bind(mapId, body.noteId, body.kind, at).first<{id: number}>();
    return {id: row!.id, noteId: body.noteId, kind: body.kind as Visit["kind"], at};
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
