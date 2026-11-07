import { MindMapGraphDataRecord } from "./MindMap";
import { ClaudeLogEntry, ClaudeProject } from "./ClaudeMapTypes";
import { Spot, Whereabouts } from "./spots";
import { announceFromResponse, liveTabHeader, liveTabId } from "./live";

/* A map as the server holds it: the app's graph plus the revision last saved */
export type ServerMap = MindMapGraphDataRecord & {revision: number};

export type ServerStatus =
    | {mode: "server", email: string}
    | {mode: "signed-out"}
    /* no server behind this site (the Netlify build), so maps stay in this browser */
    | {mode: "local"};

export type Connection = {id: string, name: string, connectedAt: string};

export class ConflictError extends Error {
    constructor(message: string, public readonly latest: ServerMap | null) {
        super(message);
    }
}

const isJson = (response: Response) =>
    (response.headers.get("content-type") ?? "").includes("application/json");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        headers: {"content-type": "application/json", [liveTabHeader]: liveTabId, ...init?.headers}
    });
    if (response.ok) {
        announceFromResponse(response);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    const body = isJson(response) ? await response.json() : undefined;
    if (response.status === 409) {
        throw new ConflictError(body?.error ?? "This map changed somewhere else.", body?.map ?? null);
    }
    if (!response.ok) {
        throw new Error(body?.error ?? `The server answered ${response.status}.`);
    }
    return body as T;
}

export const ServerApi = {
    async status(): Promise<ServerStatus> {
        try {
            const response = await fetch("/api/me", {credentials: "same-origin"});
            if (!isJson(response)) {
                return {mode: "local"};
            }
            if (response.status === 401) {
                return {mode: "signed-out"};
            }
            if (response.ok) {
                return {mode: "server", email: (await response.json()).email};
            }
        } catch {
            // offline, or no server at all
        }
        return {mode: "local"};
    },
    listMaps: () => request<ServerMap[]>("/api/maps"),
    /* Just each map's id and revision, to tell cheaply which maps changed somewhere else */
    mapRevisions: () => request<{id: string, revision: number}[]>("/api/maps/revisions"),
    getMap: (id: string) => request<ServerMap>(`/api/maps/${encodeURIComponent(id)}`),
    saveMap: (graph: MindMapGraphDataRecord, revision: number | null) =>
        request<{revision: number}>(`/api/maps/${encodeURIComponent(graph.id)}`, {
            method: "PUT",
            body: JSON.stringify({revision, title: graph.title ?? null, nodes: graph.nodes, links: graph.links})
        }),
    deleteMap: (id: string) => request<void>(`/api/maps/${encodeURIComponent(id)}`, {method: "DELETE"}),
    /* A photo for a place's note; answers the URL the note points at */
    uploadMedia: async (mapId: string, noteId: string, photo: Blob): Promise<{id: string, url: string}> => {
        const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}/media?place=${encodeURIComponent(noteId)}`, {
            method: "POST",
            credentials: "same-origin",
            headers: {"content-type": photo.type || "image/jpeg"},
            body: photo
        });
        const body = isJson(response) ? await response.json() : undefined;
        if (!response.ok) {
            throw new Error(body?.error ?? `The server answered ${response.status}.`);
        }
        return body;
    },
    /* The Claude map: projects and threads, as Claude last synced them */
    claudeMap: () => request<ClaudeProject[]>("/api/claude-map"),
    claudeLog: (before?: string) =>
        request<ClaudeLogEntry[]>(`/api/claude-map/log${before ? `?before=${encodeURIComponent(before)}` : ""}`),
    claudeSync: (hash: string) => request<unknown>(`/api/claude-map/syncs/${encodeURIComponent(hash)}`),
    setClaudeProjectHidden: (id: string, hidden: boolean) =>
        request<void>(`/api/claude-map/projects/${encodeURIComponent(id)}/${hidden ? "hide" : "show"}`, {method: "POST"}),
    setChecklistInterest: (id: string, answer: "up" | "down" | undefined) =>
        request<void>(`/api/checklist/${encodeURIComponent(id)}/interest/${answer ?? "clear"}`, {method: "POST"}),
    markClaudeArtifactOpened: (id: number) =>
        request<void>(`/api/claude-map/artifacts/${id}/opened`, {method: "POST"}),
    setClaudeThreadAside: (id: string, until: string | null) =>
        request<void>(`/api/claude-map/threads/${encodeURIComponent(id)}/set-aside`, {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({until})
        }),
    /* where Jon can be (his spots) and where he is now */
    where: () => request<{spots: Spot[], now?: Whereabouts}>("/api/where"),
    setWhere: (spotId: string | null, until?: string) =>
        request<void>("/api/where", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({spotId, until})}),
    saveSpots: (spots: Spot[]) =>
        request<Spot[]>("/api/where/spots", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(spots)}),
    setTodoWhere: (id: string, where: string) =>
        request<void>(`/api/checklist/${encodeURIComponent(id)}/where`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({where})}),
    setAskWhere: (threadId: string, where: string) =>
        request<void>(`/api/claude-map/threads/${encodeURIComponent(threadId)}/where`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({where})}),
    /* arrival alerts: Web Push on this phone, and keys for the phone's automations */
    pushKey: () => request<{publicKey?: string, problem?: string, subscriptions: number}>("/api/push/key"),
    subscribePush: (subscription: PushSubscriptionJSON, label: string) =>
        request<void>("/api/push/subscribe", {method: "POST", body: JSON.stringify({...subscription, label})}),
    unsubscribePush: (endpoint: string) =>
        request<void>("/api/push/unsubscribe", {method: "POST", body: JSON.stringify({endpoint})}),
    hookKeys: () => request<{id: string, label: string, createdAt: string, lastUsedAt?: string}[]>("/api/hooks"),
    makeHookKey: (label: string) => request<{id: string, label: string, token: string}>("/api/hooks", {method: "POST", body: JSON.stringify({label})}),
    revokeHookKey: (id: string) => request<void>(`/api/hooks/${encodeURIComponent(id)}/revoke`, {method: "POST"}),
    markClaudeThreadOpened: (id: string) =>
        request<void>(`/api/claude-map/threads/${encodeURIComponent(id)}/opened`, {method: "POST"}),
    signOut: () => fetch("/auth/logout", {method: "POST", credentials: "same-origin"}),
    listConnections: () => request<Connection[]>("/api/connections"),
    revokeConnection: (id: string) => request<void>(`/api/connections/${encodeURIComponent(id)}/revoke`, {method: "POST"})
};
