/* Live updates. After every write the server rings a doorbell (one Durable Object), and each open tab hears the
   ring over a WebSocket and refetches only what the ring names. A ring carries no data, only "this changed", so the
   usual endpoints stay the one source of truth. Tabs in this browser also tell each other directly while the
   socket is down, and every view still refetches when it comes back to the front. */

import React from "react";

/* "talks" uses mapId for the talk's id */
export type LiveTopic = "maps" | "trail" | "claude" | "monologues" | "talks";
/* mapId narrows "maps" and "trail" to one map; without it, every map counts */
export type LiveRing = {topic: LiveTopic, mapId?: string, from?: string};
export type LiveStatus = "off" | "connecting" | "live" | "down";

/* Sent with this tab's writes, so the server's ring for them can be skipped here: this tab already shows them */
export const liveTabId: string = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
export const liveTabHeader = "x-live-tab";

type Listener = (ring: LiveRing) => void;
const listeners = new Set<Listener>();
const statusListeners = new Set<(status: LiveStatus) => void>();
let status: LiveStatus = "off";

/* Rings that arrive while the tab is hidden wait here, and play once it is visible again */
let held: LiveRing[] = [];
const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
const sameRing = (a: LiveRing, b: LiveRing) => a.topic === b.topic && a.mapId === b.mapId;

function deliver(ring: LiveRing) {
    if (ring.from === liveTabId) {
        return;
    }
    if (hidden()) {
        if (!held.some(h => sameRing(h, ring))) {
            held.push(ring);
        }
        return;
    }
    listeners.forEach(listener => listener(ring));
}

/* Calls back for every ring that matches; the topics' views pass their map id to hear only their own map */
export function onRing(topic: LiveTopic, mapId: string | undefined, callback: () => void): () => void {
    const listener: Listener = ring => {
        if (ring.topic === topic && (mapId === undefined || ring.mapId === undefined || ring.mapId === mapId)) {
            callback();
        }
    };
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/* React form of onRing: the newest callback is always the one called */
export function useRing(topic: LiveTopic, mapId: string | undefined, callback: () => void, enabled = true) {
    const latest = React.useRef(callback);
    latest.current = callback;
    React.useEffect(() => {
        if (!enabled) {
            return;
        }
        return onRing(topic, mapId, () => latest.current());
    }, [topic, mapId, enabled]);
}

export function useLiveStatus(): LiveStatus {
    const [current, setCurrent] = React.useState(status);
    React.useEffect(() => {
        setCurrent(status);
        statusListeners.add(setCurrent);
        return () => {
            statusListeners.delete(setCurrent);
        };
    }, []);
    return current;
}

function setStatus(next: LiveStatus) {
    if (next !== status) {
        status = next;
        statusListeners.forEach(listener => listener(next));
    }
}

/* Every topic at once: after a reconnect or a long sleep, nobody knows what was missed */
const everything = (): LiveRing[] => (["maps", "trail", "claude", "monologues", "talks"] as const).map(topic => ({topic}));

/* --- tabs in this browser --- */
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("adhd-assist-live") : undefined;
channel?.addEventListener("message", (e: MessageEvent<LiveRing[]>) => {
    //while the socket is live the server's ring reaches this tab too, so only one of the two is heard
    if (status !== "live" && Array.isArray(e.data)) {
        e.data.forEach(deliver);
    }
});

/* A write from this tab succeeded: the server answers with the rings it sent. If the socket is down, the other
   tabs in this browser may not have heard them, so pass them on directly. */
export function announceFromResponse(response: Response) {
    const header = response.headers.get("x-live-ring");
    if (!header || status === "live" || !channel) {
        return;
    }
    try {
        const rings = JSON.parse(header) as LiveRing[];
        channel.postMessage(rings.map(r => ({...r, from: liveTabId})));
    } catch {
        // not a ring we understand; the other tabs catch up when they come to the front
    }
}

/* --- the socket --- */
const pingEveryMs = 25_000;
const pongWithinMs = 10_000;
const maxBackoffMs = 30_000;
let socket: WebSocket | undefined;
let started = false;
let attempts = 0;
let everConnected = false;
let retryTimer: number | undefined;
let pingTimer: number | undefined;
let pongTimer: number | undefined;

function connect() {
    window.clearTimeout(retryTimer);
    retryTimer = undefined;
    if (socket && socket.readyState <= WebSocket.OPEN) {
        return;
    }
    setStatus("connecting");
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`;
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener("open", () => {
        attempts = 0;
        setStatus("live");
        //anything may have changed while the socket was down; the first time, every view has only just loaded
        if (everConnected) {
            everything().forEach(deliver);
        }
        everConnected = true;
        ping();
    });
    ws.addEventListener("message", e => {
        if (e.data === "pong") {
            window.clearTimeout(pongTimer);
            return;
        }
        try {
            const rings = JSON.parse(String(e.data)) as LiveRing[];
            if (Array.isArray(rings)) {
                rings.forEach(deliver);
            }
        } catch {
            // ignore anything that isn't a ring
        }
    });
    ws.addEventListener("close", () => {
        if (socket !== ws) {
            return;
        }
        socket = undefined;
        window.clearTimeout(pingTimer);
        window.clearTimeout(pongTimer);
        setStatus("down");
        retry();
    });
}

/* Phones and sleeping laptops drop sockets without a word; a ping that gets no answer finds out */
function ping() {
    window.clearTimeout(pingTimer);
    pingTimer = window.setTimeout(() => {
        if (socket?.readyState !== WebSocket.OPEN) {
            return;
        }
        socket.send("ping");
        window.clearTimeout(pongTimer);
        pongTimer = window.setTimeout(() => socket?.close(), pongWithinMs);
        ping();
    }, pingEveryMs);
}

function retry() {
    if (retryTimer !== undefined || hidden()) {
        //a hidden tab reconnects when it comes back
        return;
    }
    const delay = Math.min(maxBackoffMs, 1000 * 2 ** attempts) * (0.75 + Math.random() / 2);
    attempts++;
    retryTimer = window.setTimeout(connect, delay);
}

/* Starts listening for rings. Only for the signed-in site: the local-only one has no server to ring. */
export function startLive() {
    if (started || typeof WebSocket === "undefined") {
        return;
    }
    started = true;
    connect();
    document.addEventListener("visibilitychange", () => {
        if (hidden()) {
            return;
        }
        const waiting = held;
        held = [];
        waiting.forEach(deliver);
        if (!socket) {
            attempts = 0;
            connect();
        } else if (socket.readyState === WebSocket.OPEN) {
            //check right away that the socket survived the sleep
            socket.send("ping");
            window.clearTimeout(pongTimer);
            pongTimer = window.setTimeout(() => socket?.close(), pongWithinMs);
        }
    });
    window.addEventListener("online", () => {
        if (!socket) {
            attempts = 0;
            connect();
        }
    });
}

/* A slow look now and then, in case a ring was lost. Visible tabs only. */
export const safetyPollMs = 5 * 60_000;
