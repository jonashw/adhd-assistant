/* The shapes of the trail, shared by the app and the Worker */

export type VisitKind = "arrive" | "untie" | "tie_off";
export type Visit = {id: number, noteId: string, kind: VisitKind, at: string};
export type SignalKind = "deadline" | "request" | "trouble" | "news";
export type Signal = {
    id: string, noteId: string, kind: SignalKind,
    source: "jon" | "claude" | "jira" | "calendar",
    label: string,
    /* YYYY-MM-DD, for deadlines */
    dueAt?: string,
    raisedAt: string,
    /* the linked item (a Claude thread) that raised it */
    itemId?: string
};

export const linkedItemKinds = ["claude.thread", "claude.project", "github.pr", "url"] as const;
export type LinkedItemKind = typeof linkedItemKinds[number];
export const threadStates = ["working", "waiting", "done", "failed"] as const;
export type ThreadState = typeof threadStates[number];

/* Something outside the map that a place points at. Claude threads also say how they are doing. */
export type LinkedItem = {
    id: string,
    kind: LinkedItemKind,
    url?: string,
    title: string,
    state?: ThreadState,
    stateNote?: string,
    lastHeardAt?: string,
    /* the places on this map it serves; signals land only at the primary one */
    places: {noteId: string, primary: boolean}[]
};

export type TrailData = {
    /* recent visits, oldest first, always including the last tie-off or untie */
    recent: Visit[],
    lastArrivedAt: {[noteId: string]: string},
    signals: Signal[],
    /* items linked to places on this map */
    items: LinkedItem[],
    /* Claude threads that checked in without naming a place yet (on any map) */
    unplaced: LinkedItem[]
};

/* A working thread silent this long reads "check in?" */
export const silentHours = 4;
/* Fresh tracks fade after this many days */
export const freshTracksDays = 3;

export const isSilent = (item: LinkedItem, now: Date): boolean =>
    item.kind === "claude.thread" && item.state === "working" && item.lastHeardAt !== undefined
    && now.getTime() - Date.parse(item.lastHeardAt) >= silentHours * 3600_000;

/* "just now", "12 min ago", "3 h ago", "2 d ago" */
export function age(at: string, now: Date): string {
    const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / 60_000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
}

/* Recognize a pasted link from its address */
export function kindOfUrl(url: string): LinkedItemKind {
    try {
        const u = new URL(url);
        if (u.hostname === "github.com" && /^\/[^/]+\/[^/]+\/pull\/\d+/.test(u.pathname)) return "github.pr";
        if (u.hostname === "claude.ai" || u.hostname.endsWith(".claude.ai")) {
            if (/\/(chat|code)\//.test(u.pathname) && !/\/project\//.test(u.pathname)) return "claude.thread";
            if (u.searchParams.has("thread")) return "claude.thread";
            if (/\/project/.test(u.pathname)) return "claude.project";
        }
    } catch {
        // not a URL; the caller checks that
    }
    return "url";
}
