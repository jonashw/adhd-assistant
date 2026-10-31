/* The trail (visits) and the signals over places, kept beside the map.
   Signed in, they live on the server; on the local-only site, in this browser. */

export type VisitKind = "arrive" | "untie" | "tie_off";
export type Visit = {id: number, noteId: string, kind: VisitKind, at: string};
export type SignalKind = "deadline" | "request" | "trouble" | "news";
export type Signal = {
    id: string, noteId: string, kind: SignalKind,
    source: "jon" | "claude" | "jira" | "calendar",
    label: string,
    /* YYYY-MM-DD, for deadlines */
    dueAt?: string,
    raisedAt: string
};
export type TrailData = {
    /* recent visits, oldest first, always including the last tie-off or untie */
    recent: Visit[],
    lastArrivedAt: {[noteId: string]: string},
    signals: Signal[]
};

export const emptyTrail: TrailData = {recent: [], lastArrivedAt: {}, signals: []};

export interface TrailStore {
    load(mapId: string): Promise<TrailData>;
    addVisit(mapId: string, noteId: string, kind: VisitKind): Promise<Visit>;
    plantFlag(mapId: string, noteId: string, label: string, dueAt: string): Promise<Signal>;
    clearSignal(mapId: string, signalId: string): Promise<void>;
}

async function send<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: {"content-type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (response.status === 204) {
        return undefined as T;
    }
    const json = await response.json().catch(() => undefined);
    if (!response.ok) {
        throw new Error(json?.error ?? `The server answered ${response.status}.`);
    }
    return json as T;
}

const mapPath = (mapId: string) => `/api/maps/${encodeURIComponent(mapId)}`;

export const serverTrailStore: TrailStore = {
    load: mapId => send(`${mapPath(mapId)}/trail`),
    addVisit: (mapId, noteId, kind) => send(`${mapPath(mapId)}/visits`, {noteId, kind}),
    plantFlag: (mapId, noteId, label, dueAt) => send(`${mapPath(mapId)}/signals`, {noteId, label, dueAt}),
    clearSignal: (mapId, signalId) => send(`${mapPath(mapId)}/signals/${encodeURIComponent(signalId)}/clear`, {})
};

type LocalTrail = {visits: Visit[], signals: (Signal & {clearedAt?: string})[]};

const localKey = (mapId: string) => `trail:${mapId}`;
function readLocal(mapId: string): LocalTrail {
    try {
        const parsed = JSON.parse(localStorage.getItem(localKey(mapId)) ?? "null");
        if (parsed && Array.isArray(parsed.visits) && Array.isArray(parsed.signals)) {
            return parsed;
        }
    } catch {
        // unreadable or blocked storage: start a fresh trail
    }
    return {visits: [], signals: []};
}
function writeLocal(mapId: string, trail: LocalTrail) {
    try {
        //keep the browser's copy small: a week of visits is plenty for the trail
        const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
        const lastTether = [...trail.visits].reverse().find(v => v.kind !== "arrive");
        const visits = trail.visits.filter(v => v.at >= weekAgo || v === lastTether);
        localStorage.setItem(localKey(mapId), JSON.stringify({...trail, visits}));
    } catch {
        // storage full or blocked; the trail just won't survive a reload
    }
}

export const localTrailStore: TrailStore = {
    async load(mapId) {
        const {visits, signals} = readLocal(mapId);
        const lastArrivedAt: {[noteId: string]: string} = {};
        for (const v of visits) {
            if (v.kind === "arrive") {
                lastArrivedAt[v.noteId] = v.at;
            }
        }
        return {recent: visits, lastArrivedAt, signals: signals.filter(s => !s.clearedAt)};
    },
    async addVisit(mapId, noteId, kind) {
        const trail = readLocal(mapId);
        const visit: Visit = {id: (trail.visits.at(-1)?.id ?? 0) + 1, noteId, kind, at: new Date().toISOString()};
        writeLocal(mapId, {...trail, visits: [...trail.visits, visit]});
        return visit;
    },
    async plantFlag(mapId, noteId, label, dueAt) {
        const trail = readLocal(mapId);
        const signal: Signal = {
            id: crypto.randomUUID(), noteId, kind: "deadline", source: "jon",
            label, dueAt, raisedAt: new Date().toISOString()
        };
        writeLocal(mapId, {...trail, signals: [...trail.signals, signal]});
        return signal;
    },
    async clearSignal(mapId, signalId) {
        const trail = readLocal(mapId);
        const clearedAt = new Date().toISOString();
        writeLocal(mapId, {...trail, signals: trail.signals.map(s => s.id === signalId ? {...s, clearedAt} : s)});
    }
};
