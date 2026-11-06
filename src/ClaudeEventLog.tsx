import React from "react";
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText,
    ListSubheader, Stack, Typography
} from "@mui/material";
import { BugReport } from "@mui/icons-material";
import { ClaudeEvent, ClaudeLogEntry, ClaudeProject, ClaudeSync, ClaudeThreadState, askLabels, claudeAskKinds, claudeBadges, claudeThreadUrl } from "./ClaudeMapTypes";
import { OpenIn, claudeStyle, keep, linkProps, projectLabel } from "./ClaudeMap";
import { ServerApi } from "./ServerApi";

/* The Claude event log: what changed in Claude, newest first, as the syncs saw it. With "Syncs" on, every sync
   shows too, and tapping one shows exactly what Claude sent, so it doubles as a debugging tool.
   A change is timed by the sync that brought it, which can trail the change itself. */

const refreshMs = 30_000;
const showSyncsKey = "claudeMap.showSyncs";

const readShowSyncs = () => {
    try {
        return localStorage.getItem(showSyncsKey) === "true";
    } catch {
        return false;
    }
};

const stateLabel = (state?: string) => state ? claudeBadges[state as ClaudeThreadState]?.label ?? state : "";

const askText = (value?: string) => {
    if (!value) {
        return "";
    }
    const kind = claudeAskKinds.find(k => value.startsWith(`${k}: `));
    return kind ? `${askLabels[kind]}: ${value.slice(kind.length + 2)}` : value;
};

const prNumber = (pr?: string) => pr ? `#${pr.split("#").at(-1)}` : "PR";

/* One line for an event, in plain words */
function describeEvent(e: ClaudeEvent): string {
    switch (e.kind) {
        case "project_new": return `Project first seen: ${e.to}`;
        case "project_renamed": return `Project renamed: ${e.from} → ${e.to}`;
        case "short_name": return e.to
            ? `Map label ${e.from ? `changed from ${e.from} ` : "set "}to ${e.to}`
            : `Map label ${e.from} dropped; the map shows the project's name`;
        case "thread_new": return `New thread: ${e.to}`;
        case "thread_renamed": return `Thread renamed: ${e.from} → ${e.to}`;
        case "thread_state": return e.from ? `${stateLabel(e.from)} → ${stateLabel(e.to)}` : `Started as ${stateLabel(e.to)}`;
        case "thread_unlisted": return `Left out of the latest list: ${e.to}`;
        case "ask": return e.to ? `Asks you: ${askText(e.to)}` : "Ask cleared";
        case "reply": return `Replied: ${e.to}`;
        case "pr_new": return `PR ${prNumber(e.pr)} opened: ${e.to}`;
        case "pr_state": return `PR ${prNumber(e.pr)}: ${e.from} → ${e.to}`;
        case "pr_ci": return `PR ${prNumber(e.pr)} checks: ${e.to}`;
    }
}

const kindLabels: Record<ClaudeEvent["kind"], string> = {
    project_new: "Project", project_renamed: "Rename", short_name: "Label", thread_new: "New",
    thread_renamed: "Rename", thread_state: "State", thread_unlisted: "Unlisted", ask: "Ask", reply: "Reply",
    pr_new: "PR", pr_state: "PR", pr_ci: "Checks"
};

function describeSync(s: ClaudeSync): string {
    const parts = [s.threads === undefined ? "list unchanged" : `${s.threads} threads`];
    if (s.prs !== undefined) parts.push(`${s.prs} PRs`);
    if (s.card) parts.push("card");
    if (s.selfState) parts.push(`says it's ${stateLabel(s.selfState)}`);
    if (!s.applied) parts.push("NOT APPLIED");
    return `Sync: ${parts.join(", ")}`;
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, {weekday: "long", month: "short", day: "numeric"});
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"});

type Props = {projects: ClaudeProject[], query: string, openIn: OpenIn, demo: boolean};

export function ClaudeEventLog({projects, query, openIn, demo}: Props) {
    const [entries, setEntries] = React.useState<ClaudeLogEntry[]>();
    const [older, setOlder] = React.useState<ClaudeLogEntry[]>([]);
    const [noMore, setNoMore] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const [showSyncs, setShowSyncsState] = React.useState(readShowSyncs);
    const [openSync, setOpenSync] = React.useState<string>();
    const setShowSyncs = (value: boolean) => {
        setShowSyncsState(value);
        keep(showSyncsKey, String(value));
    };

    const load = React.useCallback(() => {
        (demo ? Promise.resolve(demoLog(projects)) : ServerApi.claudeLog())
            .then(e => {
                setEntries(e);
                setError(undefined);
            })
            .catch((e: Error) => setError(e.message));
    }, [demo, projects]);
    React.useEffect(() => {
        load();
        const timer = window.setInterval(load, refreshMs);
        return () => window.clearInterval(timer);
    }, [load]);

    const loadOlder = () => {
        const last = [...(entries ?? []), ...older].at(-1);
        if (!last || demo) {
            setNoMore(true);
            return;
        }
        ServerApi.claudeLog(last.at)
            .then(e => {
                setOlder(o => [...o, ...e]);
                setNoMore(e.length === 0);
            })
            .catch((e: Error) => setError(e.message));
    };

    const projectsById = React.useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
    const threadsById = React.useMemo(() => new Map(projects.flatMap(p => p.threads.map(t => [t.id, t]))), [projects]);
    const titleOf = (id?: string) => id ? threadsById.get(id)?.title : undefined;

    const all = React.useMemo(() => {
        // a refresh and a page of older entries can overlap; keep each entry once
        const seen = new Set<string>();
        return [...(entries ?? []), ...older].filter(e => {
            const key = e.type === "event" ? `e${e.id}` : `s${e.hash}${e.at}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [entries, older]);

    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = all.filter(e => showSyncs || e.type === "event").filter(e => {
        if (!words.length) return true;
        const project = projectsById.get(e.projectId);
        const text = [
            e.type === "event" ? describeEvent(e) : describeSync(e),
            project && projectLabel(project), project?.name,
            titleOf(e.type === "event" ? e.threadId : e.by), titleOf(e.by), dayOf(e.at)
        ].filter(Boolean).join(" ").toLowerCase();
        return words.every(w => text.includes(w));
    });

    let lastDay = "";
    return <Box sx={{bgcolor: "#fff", minHeight: "100%", pb: 10}}>
        <Stack direction="row" alignItems="center" gap={1} sx={{px: 2, py: 1}}>
            <Typography variant="caption" color="text.secondary" sx={{flexGrow: 1}}>
                Newest first. Each change is timed by the sync that brought it, so it can trail the change itself.
            </Typography>
            <Chip
                size="small"
                icon={<BugReport/>}
                label="Syncs"
                variant={showSyncs ? "filled" : "outlined"}
                onClick={() => setShowSyncs(!showSyncs)}
                title="Show every sync too, and what Claude sent in it"
            />
        </Stack>
        {error && <Alert severity="warning" sx={{borderRadius: 0}}>Couldn't load the event log. {error}</Alert>}
        {entries && shown.length === 0 && <Typography variant="body2" sx={{px: 2, py: 1.5}}>
            {words.length ? "Nothing in the log matches that." : "Nothing has happened yet. Changes show up here from the next sync on."}
        </Typography>}
        <List dense disablePadding>
            {shown.map(e => {
                const day = dayOf(e.at);
                const header = day !== lastDay ? <ListSubheader sx={{bgcolor: claudeStyle.fill, fontFamily: claudeStyle.font, color: claudeStyle.ink}}>{day}</ListSubheader> : null;
                lastDay = day;
                const project = projectsById.get(e.projectId);
                const where = project ? projectLabel(project) : (e.type === "sync" ? e.projectName : undefined) ?? e.projectId;
                if (e.type === "sync") {
                    const by = titleOf(e.by);
                    return <React.Fragment key={`s${e.hash}${e.at}`}>
                        {header}
                        <ListItemButton onClick={() => setOpenSync(e.hash)} sx={{gap: 1.5, opacity: 0.75}}>
                            <Typography variant="caption" sx={{width: 64, flexShrink: 0, color: "text.secondary"}}>{timeOf(e.at)}</Typography>
                            <Chip size="small" label="Sync" variant="outlined" sx={{width: 72, flexShrink: 0}}/>
                            <ListItemText
                                primary={describeSync(e)}
                                secondary={[where, by && `from ${by}`].filter(Boolean).join(" · ")}
                                primaryTypographyProps={{noWrap: true, sx: {fontFamily: "monospace", fontSize: "0.8rem"}}}
                                secondaryTypographyProps={{noWrap: true}}
                                sx={{minWidth: 0}}
                            />
                        </ListItemButton>
                    </React.Fragment>;
                }
                const thread = titleOf(e.threadId);
                const url = e.threadId ? claudeThreadUrl(e.projectId, e.threadId) : project?.url;
                const color = e.kind === "thread_state" && e.to ? claudeBadges[e.to as ClaudeThreadState] : undefined;
                return <React.Fragment key={`e${e.id}`}>
                    {header}
                    <ListItemButton {...linkProps(url, openIn)} sx={{gap: 1.5}}>
                        <Typography variant="caption" sx={{width: 64, flexShrink: 0, color: "text.secondary"}}>{timeOf(e.at)}</Typography>
                        <Chip
                            size="small"
                            label={kindLabels[e.kind]}
                            sx={{width: 72, flexShrink: 0, ...(color ? {bgcolor: color.color, color: color.text} : {})}}
                        />
                        <ListItemText
                            primary={describeEvent(e)}
                            secondary={[where, e.kind !== "thread_new" && e.kind !== "thread_renamed" && thread].filter(Boolean).join(" · ")}
                            secondaryTypographyProps={{noWrap: true}}
                            sx={{minWidth: 0}}
                        />
                    </ListItemButton>
                </React.Fragment>;
            })}
        </List>
        {entries && all.length > 0 && !noMore && <Box sx={{p: 2}}>
            <Button size="small" onClick={loadOlder}>Load older</Button>
        </Box>}
        <SyncDialog hash={openSync} demo={demo} onClose={() => setOpenSync(undefined)}/>
    </Box>;
}

/* One sync exactly as Claude sent it */
function SyncDialog({hash, demo, onClose}: {hash?: string, demo: boolean, onClose: () => void}) {
    const [body, setBody] = React.useState<string>();
    React.useEffect(() => {
        setBody(undefined);
        if (!hash) return;
        (demo ? Promise.resolve({hash, payload: "Sample data: no real sync behind this."}) : ServerApi.claudeSync(hash))
            .then(s => setBody(JSON.stringify(s, null, 2)))
            .catch((e: Error) => setBody(`Couldn't load it. ${e.message}`));
    }, [hash, demo]);
    return <Dialog open={!!hash} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle sx={{fontFamily: claudeStyle.font}}>What Claude sent</DialogTitle>
        <DialogContent dividers>
            <Box component="pre" sx={{m: 0, fontSize: "0.75rem", whiteSpace: "pre-wrap", wordBreak: "break-word"}}>{body ?? "Loading…"}</Box>
        </DialogContent>
        <DialogActions>
            <Button disabled={!body} onClick={() => navigator.clipboard?.writeText(body ?? "").catch(() => undefined)}>Copy</Button>
            <Button onClick={onClose}>Close</Button>
        </DialogActions>
    </Dialog>;
}

/* Sample events for /claude?demo, made from the demo map */
function demoLog(projects: ClaudeProject[]): ClaudeLogEntry[] {
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
    const entries: ClaudeLogEntry[] = [];
    let id = 1;
    projects.forEach((p, pi) => {
        const sync = `demo${pi}`.padEnd(64, "0");
        p.threads.forEach((t, ti) => {
            const minutes = 5 + pi * 40 + ti * 13;
            entries.push({type: "event", id: id++, at: at(minutes), kind: "thread_state", projectId: p.id, threadId: t.id, from: t.state === "working" ? "blocked" : "working", to: t.state, sync});
            if (t.card?.ask) {
                entries.push({type: "event", id: id++, at: at(minutes), kind: "ask", projectId: p.id, threadId: t.id, to: `${t.card.ask.kind}: ${t.card.ask.text}`, sync});
            }
            entries.push({type: "sync", hash: sync, at: at(minutes), projectId: p.id, by: t.id, threads: p.threads.length, card: true, applied: true});
        });
        entries.push({type: "event", id: id++, at: at(30 + pi * 40), kind: "thread_renamed", projectId: p.id, threadId: p.threads[0]?.id, from: "Old working title", to: p.threads[0]?.title, sync});
    });
    entries.push({type: "event", id: id++, at: at(400), kind: "project_renamed", projectId: projects[0]?.id ?? "", from: "Yard", to: projects[0]?.name, sync: "".padEnd(64, "0")});
    return entries.sort((a, b) => b.at.localeCompare(a.at));
}
