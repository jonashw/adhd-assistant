/* The trail (visits) and the signals over places, kept beside the map.
   Signed in, they live on the server; on the local-only site, in this browser. */

import { LinkedItem, Signal, TrailData, Visit, VisitKind } from "./TrailTypes";
export * from "./TrailTypes";

export const emptyTrail: TrailData = {recent: [], lastArrivedAt: {}, signals: [], items: [], unplaced: []};

export interface TrailStore {
    load(mapId: string): Promise<TrailData>;
    addVisit(mapId: string, noteId: string, kind: VisitKind): Promise<Visit>;
    plantFlag(mapId: string, noteId: string, label: string, dueAt: string): Promise<Signal>;
    clearSignal(mapId: string, signalId: string): Promise<void>;
    /* linked items need the server; the local-only site has none */
    readonly linksSupported: boolean;
    addLink(mapId: string, noteId: string, url: string, title?: string): Promise<LinkedItem>;
    removeLink(mapId: string, noteId: string, itemId: string): Promise<void>;
    placeItem(itemId: string, mapId: string, noteId: string): Promise<LinkedItem>;
    forgetItem(itemId: string): Promise<void>;
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
    clearSignal: (mapId, signalId) => send(`${mapPath(mapId)}/signals/${encodeURIComponent(signalId)}/clear`, {}),
    linksSupported: true,
    addLink: (mapId, noteId, url, title) => send(`${mapPath(mapId)}/places/${encodeURIComponent(noteId)}/links`, {url, title}),
    removeLink: (mapId, noteId, itemId) =>
        send(`${mapPath(mapId)}/places/${encodeURIComponent(noteId)}/links/${encodeURIComponent(itemId)}/remove`, {}),
    placeItem: (itemId, mapId, noteId) => send(`/api/items/${encodeURIComponent(itemId)}/place`, {mapId, noteId}),
    forgetItem: itemId => send(`/api/items/${encodeURIComponent(itemId)}/forget`, {})
};

const needsServer = () => Promise.reject(new Error("Linked items need you to be signed in."));

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
        return {recent: visits, lastArrivedAt, signals: signals.filter(s => !s.clearedAt), items: [], unplaced: []};
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
    },
    linksSupported: false,
    addLink: needsServer,
    removeLink: needsServer,
    placeItem: needsServer,
    forgetItem: needsServer
};
