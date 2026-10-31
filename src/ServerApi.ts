import { MindMapGraphDataRecord } from "./MindMap";

/* A map as the server holds it: the app's graph plus the revision last saved */
export type ServerMap = MindMapGraphDataRecord & {revision: number};

export type ServerStatus =
    | {mode: "server", email: string}
    | {mode: "signed-out"}
    /* no server behind this site (the Netlify build), so maps stay in this browser */
    | {mode: "local"};

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
        headers: {"content-type": "application/json", ...init?.headers}
    });
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
    getMap: (id: string) => request<ServerMap>(`/api/maps/${encodeURIComponent(id)}`),
    saveMap: (graph: MindMapGraphDataRecord, revision: number | null) =>
        request<{revision: number}>(`/api/maps/${encodeURIComponent(graph.id)}`, {
            method: "PUT",
            body: JSON.stringify({revision, nodes: graph.nodes, links: graph.links})
        }),
    deleteMap: (id: string) => request<void>(`/api/maps/${encodeURIComponent(id)}`, {method: "DELETE"}),
    signOut: () => fetch("/auth/logout", {method: "POST", credentials: "same-origin"})
};
