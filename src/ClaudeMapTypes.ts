/* The Claude map's shapes, shared by the app and the Worker. Claude keeps this map from what the
   platform says about each project's threads; the app only reads it. */

/* The states the platform itself keeps for a thread in a project */
export const claudeThreadStates = ["working", "blocked", "review_ready", "done", "failed", "stopped"] as const;
export type ClaudeThreadState = typeof claudeThreadStates[number];

export type ClaudeThread = {
    id: string,
    title: string,
    state: ClaudeThreadState,
    url: string,
    createdAt?: string,
    lastActivityAt?: string,
    /* the last snapshot that listed it */
    lastSeenAt: string,
    /* false when the project's latest snapshot didn't list it: it is shown as not seen since lastSeenAt */
    inLatest: boolean
};

/* Something a project's threads published. Claude lists these per project, so they belong to the project. */
export type ClaudeArtifact = {
    id: string,
    title: string,
    url: string,
    updatedAt?: string,
    firstSeenAt: string,
    /* when Jon last opened it from the map */
    openedAt?: string,
    /* the platform's latest list for the project still had it */
    inLatest: boolean
};

export type ClaudeProject = {
    id: string,
    name: string,
    shortName?: string,
    url: string,
    hidden: boolean,
    firstSeenAt: string,
    lastSyncedAt: string,
    threads: ClaudeThread[],
    artifacts: ClaudeArtifact[]
};

/* After this long with no snapshot, a project's open threads read "Not heard lately" */
export const claudeStaleHours = 4;

export const claudeProjectUrl = (projectId: string) =>
    `https://claude.ai/code/project/${encodeURIComponent(projectId)}`;

export const claudeThreadUrl = (projectId: string, threadId: string) =>
    `${claudeProjectUrl(projectId)}?thread=${encodeURIComponent(threadId)}`;

/* What a badge says and its colour, by state. "stale" is the app's own: no word from the project lately. */
export type ClaudeBadgeKind = ClaudeThreadState | "stale" | "gone";
export const claudeBadges: Record<ClaudeBadgeKind, {label: string, color: string, text: string}> = {
    blocked: {label: "Needs you", color: "#F59E0B", text: "#1F1300"},
    review_ready: {label: "Ready to review", color: "#16A34A", text: "#FFFFFF"},
    working: {label: "Working", color: "#2563EB", text: "#FFFFFF"},
    failed: {label: "Stuck", color: "#DC2626", text: "#FFFFFF"},
    stopped: {label: "Stopped", color: "#64748B", text: "#FFFFFF"},
    done: {label: "Done", color: "#9CA3AF", text: "#FFFFFF"},
    stale: {label: "Not heard lately", color: "#E5E7EB", text: "#374151"},
    gone: {label: "Not seen lately", color: "#E5E7EB", text: "#374151"}
};

/* The badge a thread shows now: its own state, unless the map has lost track of it */
export function badgeFor(thread: ClaudeThread, project: ClaudeProject, now = Date.now()): ClaudeBadgeKind {
    if (!thread.inLatest && thread.state !== "done") {
        return "gone";
    }
    const quiet = now - Date.parse(project.lastSyncedAt) > claudeStaleHours * 36e5;
    return quiet && thread.state !== "done" ? "stale" : thread.state;
}

/* Most urgent first, for lists and for a project's summary */
export const badgeOrder: ClaudeBadgeKind[] = ["blocked", "failed", "review_ready", "working", "stale", "gone", "stopped", "done"];

/* "new": appeared after the project joined the map and Jon hasn't opened it.
   "updated": changed since Jon last opened it. Otherwise nothing to flag. */
export type ArtifactFlag = "new" | "updated" | undefined;
export function artifactFlag(artifact: ClaudeArtifact, project: ClaudeProject): ArtifactFlag {
    // everything already there when the project first synced isn't news
    const joined = new Date(Date.parse(project.firstSeenAt) + 5 * 60000).toISOString();
    if (!artifact.openedAt && artifact.firstSeenAt > joined) {
        return "new";
    }
    const since = artifact.openedAt ?? joined;
    return artifact.updatedAt && artifact.updatedAt > since ? "updated" : undefined;
}

/* How many artifacts a project shows on the map; the list view shows them all */
export const artifactsOnMap = 6;
