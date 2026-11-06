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
    inLatest: boolean,
    /* what the thread last said about itself, if it ever did */
    card?: ClaudeCard,
    /* PRs it opened, newest first */
    prs?: ClaudePr[],
    /* when Jon last opened it from the map */
    openedAt?: string,
    /* topics and keywords it had before, for search */
    pastTopics?: string[]
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

/* What a thread needs from Jon, if anything */
export const claudeAskKinds = ["question", "decision", "approval", "review"] as const;
export type ClaudeAskKind = typeof claudeAskKinds[number];

/* A thread's glance card: the answers to "should I look now?" without opening it */
export type ClaudeCard = {
    /* its latest reply in a line */
    headline?: string,
    ask?: {kind: ClaudeAskKind, text: string},
    progress?: {done: number, total: number, now?: string},
    artifact?: {title: string, url: string},
    topic?: string,
    keywords?: string[],
    /* when the card last changed */
    at: string
};

export const claudePrStates = ["open", "draft", "merged", "closed"] as const;
export type ClaudePrState = typeof claudePrStates[number];
export const claudeCiStates = ["success", "failure", "pending", "none"] as const;
export type ClaudeCiState = typeof claudeCiStates[number];

export type ClaudePr = {
    repo: string,
    number: number,
    title: string,
    state: ClaudePrState,
    ci?: ClaudeCiState,
    url: string
};

/* The card has something Jon hasn't seen since he last opened the thread from the map */
export const isNewSince = (thread: ClaudeThread) =>
    !!thread.card && (!thread.openedAt || thread.card.at > thread.openedAt);

/* An ask only stands while the thread is waiting on Jon */
export const standingAsk = (thread: ClaudeThread) =>
    thread.state === "blocked" || thread.state === "review_ready" ? thread.card?.ask : undefined;

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

/* After this long with no snapshot, a project's working threads read "Not heard lately" */
export const claudeStaleHours = 4;

/* An ask (needs you, ready to review) untouched this long reads "Someday?", so it stops competing with today's */
export const claudeSomedayDays = 7;

export const claudeProjectUrl = (projectId: string) =>
    `https://claude.ai/code/project/${encodeURIComponent(projectId)}`;

export const claudeThreadUrl = (projectId: string, threadId: string) =>
    `${claudeProjectUrl(projectId)}?thread=${encodeURIComponent(threadId)}`;

/* What a badge says and its colour, by state. "stale", "gone" and "someday" are the app's own: no word from the
   project lately, left out of its latest sync, or an ask that has waited over a week. */
export type ClaudeBadgeKind = ClaudeThreadState | "stale" | "gone" | "someday";
export const claudeBadges: Record<ClaudeBadgeKind, {label: string, color: string, text: string}> = {
    blocked: {label: "Needs you", color: "#F59E0B", text: "#1F1300"},
    review_ready: {label: "Ready to review", color: "#16A34A", text: "#FFFFFF"},
    working: {label: "Working", color: "#2563EB", text: "#FFFFFF"},
    failed: {label: "Stuck", color: "#DC2626", text: "#FFFFFF"},
    stopped: {label: "Stopped", color: "#64748B", text: "#FFFFFF"},
    done: {label: "Resolved", color: "#9CA3AF", text: "#FFFFFF"},
    stale: {label: "Not heard lately", color: "#E5E7EB", text: "#374151"},
    gone: {label: "Not seen lately", color: "#E5E7EB", text: "#374151"},
    someday: {label: "Someday?", color: "#FDE9C4", text: "#7C4A03"}
};

/* Badges drawn faded and dashed: the map isn't sure, or the thing can wait */
export const quietBadges: ClaudeBadgeKind[] = ["stale", "gone", "someday"];

/* The badge a thread shows now: its own state, unless the map has lost track of it */
export function badgeFor(thread: ClaudeThread, project: ClaudeProject, now = Date.now()): ClaudeBadgeKind {
    if (!thread.inLatest && thread.state !== "done") {
        return "gone";
    }
    // an ask only changes when Jon acts, so a quiet project doesn't make it stale; it just gets old
    if (thread.state === "blocked" || thread.state === "review_ready") {
        const since = Date.parse(thread.lastActivityAt ?? thread.createdAt ?? "");
        return now - since > claudeSomedayDays * 864e5 ? "someday" : thread.state;
    }
    const quiet = now - Date.parse(project.lastSyncedAt) > claudeStaleHours * 36e5;
    return quiet && thread.state === "working" ? "stale" : thread.state;
}

/* Most urgent first, for lists and for a project's summary */
export const badgeOrder: ClaudeBadgeKind[] = ["blocked", "failed", "review_ready", "working", "stale", "gone", "someday", "stopped", "done"];

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

export const askLabels: Record<ClaudeAskKind, string> = {
    question: "Question",
    decision: "Decision",
    approval: "Go-ahead",
    review: "Review"
};

/* One line for a list row: the ask if there is one, else the headline */
export function glanceLine(thread: ClaudeThread): string | undefined {
    const ask = standingAsk(thread);
    return ask ? `${askLabels[ask.kind]}: ${ask.text}` : thread.card?.headline;
}

/* The event log: what changed in Claude, as the syncs saw it, and the syncs themselves for debugging.
   Times are when the map heard of it, which can trail the change itself until a thread in the project syncs. */
export const claudeEventKinds = [
    "project_new", "project_renamed", "short_name", "thread_new", "thread_renamed", "thread_state",
    "thread_unlisted", "ask", "reply", "pr_new", "pr_state", "pr_ci"
] as const;
export type ClaudeEventKind = typeof claudeEventKinds[number];
export type ClaudeEvent = {
    type: "event",
    id: number,
    at: string,
    kind: ClaudeEventKind,
    projectId: string,
    threadId?: string,
    /* the PR, for pr_* events, as "owner/name#12" */
    pr?: string,
    from?: string,
    to?: string,
    /* the sync that brought it, and the thread that sent that sync */
    sync: string,
    by?: string
};
export type ClaudeSync = {
    type: "sync",
    hash: string,
    at: string,
    projectId: string,
    projectName?: string,
    by?: string,
    /* how many threads it listed; absent means "unchanged" */
    threads?: number,
    prs?: number,
    selfState?: ClaudeThreadState,
    card: boolean,
    applied: boolean
};
export type ClaudeLogEntry = ClaudeEvent | ClaudeSync;
