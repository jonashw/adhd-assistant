import { DurableObject } from "cloudflare:workers";
import { Env } from "./env";

/* The doorbell. Every open tab of the app holds a WebSocket here; after a write the Worker rings, and each tab
   refetches only what the ring names. A ring carries no data, so the usual endpoints stay the one source of truth.
   Hibernatable sockets let the object sleep between rings while the sockets stay open, and a "ping" from a tab is
   answered "pong" without waking it. There is one hub, since the app has one account. */

export type LiveTopic = "maps" | "trail" | "claude" | "monologues";
export type LiveRing = {topic: LiveTopic, mapId?: string, from?: string};

export class LiveHub extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
            return new Response("Expected a WebSocket.", {status: 426});
        }
        const {0: client, 1: server} = new WebSocketPair();
        this.ctx.acceptWebSocket(server);
        return new Response(null, {status: 101, webSocket: client});
    }

    async ring(rings: LiveRing[]): Promise<number> {
        const message = JSON.stringify(rings);
        let heard = 0;
        for (const socket of this.ctx.getWebSockets()) {
            try {
                socket.send(message);
                heard++;
            } catch {
                // a socket that is closing; its tab reconnects and catches up
            }
        }
        return heard;
    }

    async webSocketMessage(): Promise<void> {
        // tabs only listen; "ping" is answered without waking the hub
    }

    async webSocketClose(socket: WebSocket, code: number): Promise<void> {
        try {
            socket.close(code === 1005 ? 1000 : code, "Closing");
        } catch {
            // already closed
        }
    }
}

const hub = (env: Env) => env.LIVE.get(env.LIVE.idFromName("hub"));

/* Hands a tab's WebSocket to the hub. The caller has already checked who is asking. */
export const openLive = (request: Request, env: Env) => hub(env).fetch(request);

/* Rings the doorbell. A failed ring never fails the write: tabs catch up when they come back to the front. */
export async function ring(env: Env, rings: LiveRing[], from?: string): Promise<void> {
    if (rings.length === 0 || !env.LIVE) {
        return;
    }
    try {
        await hub(env).ring(from ? rings.map(r => ({...r, from})) : rings);
    } catch (e) {
        console.warn("couldn't ring the live hub", e);
    }
}

/* What an app write under /api changed, from its path. Reads ring nothing. */
export function ringsFor(method: string, pathname: string): LiveRing[] {
    if (method === "GET") {
        return [];
    }
    const map = /^\/api\/maps\/([^/]+)(\/.*)?$/.exec(pathname);
    if (map) {
        const mapId = decodeURIComponent(map[1]);
        const rest = map[2] ?? "";
        if (rest === "") {
            return [{topic: "maps", mapId}];
        }
        // a photo only shows once the map that points at it is saved, and that save rings
        return rest === "/media" ? [] : [{topic: "trail", mapId}];
    }
    // where Jon is, his spots, and where a to-do can be done all change what Your move shows
    if (pathname.startsWith("/api/where") || /^\/api\/checklist\/[^/]+\/where$/.test(pathname)) {
        return [{topic: "claude"}];
    }
    if (pathname.startsWith("/api/items/") || pathname.startsWith("/api/checklist/")) {
        return [{topic: "trail"}];
    }
    if (pathname.startsWith("/api/claude-map/")) {
        // setting a thread aside also takes its flare down on the map
        return pathname.endsWith("/set-aside") ? [{topic: "claude"}, {topic: "trail"}] : [{topic: "claude"}];
    }
    return [];
}
