import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ForceGraph2D, { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import {
    Alert, AppBar, Box, Button, Chip, IconButton, List, ListItemButton, ListItemText, ListSubheader,
    InputAdornment, ListItem, ListItemIcon, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, Toolbar, Typography
} from "@mui/material";
import { ArrowBack, Check, CheckBox, CheckBoxOutlineBlank, Close, OpenInNew, Search, Settings, Visibility, VisibilityOff } from "@mui/icons-material";
import { Description } from "@mui/icons-material";
import {
    ClaudeArtifact, ClaudeBadgeKind, ClaudeProject, ClaudeThread, artifactFlag, badgeFor, badgeOrder, byLatestChange, claudeBadges,
    claudeSomedayDays, claudeStaleHours, glanceLine, isNewSince, quietBadges
} from "./ClaudeMapTypes";
import { ClaudeThreadGlance, NewDot, PillChip, PrChip } from "./ClaudeThreadGlance";
import { Pill, artifactLinkProps, artifactPill } from "./claudeArtifacts";
import { artifactMatches, matchesSearch } from "./claudeSearch";
import { ServerApi } from "./ServerApi";
import { safetyPollMs, useRing } from "./live";
import { useElementSize } from "./useContainerWidth";
import { demoClaudeMap } from "./claudeMapDemo";
import { ClaudeEventLog } from "./ClaudeEventLog";
import { LiveDot } from "./LiveDot";

/* The Claude map: Claude keeps it, Jon reads it. One region per Claude project, one node per thread,
   each with a badge for what it needs. Double-click a node (or tap Open) to jump to it in Claude. */

export const claudeStyle = {
    ring: "#D97757",
    fill: "#FAF6EF",
    ink: "#3D2B1F",
    link: "#E3C7B5",
    font: "'Source Serif 4', Georgia, 'Times New Roman', serif"
};


type MapNode = {
    id: string,
    kind: "root" | "project" | "thread" | "artifact",
    label: string,
    badge?: ClaudeBadgeKind,
    /* the project's summary, like "2 need you" */
    badgeText?: string,
    url?: string,
    project?: ClaudeProject,
    thread?: ClaudeThread,
    artifact?: ClaudeArtifact,
    /* an artifact's pill, in place of a state badge */
    pill?: Pill
};

export function ago(iso: string | undefined, now = Date.now()): string {
    if (!iso) {
        return "";
    }
    const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

const byUrgency = (a: ClaudeBadgeKind, b: ClaudeBadgeKind) => badgeOrder.indexOf(a) - badgeOrder.indexOf(b);

/* A project's badge: its most urgent thread, counted */
function projectSummary(project: ClaudeProject): {badge: ClaudeBadgeKind, text: string} {
    const badges = project.threads.map(t => badgeFor(t, project));
    const top = [...badges].sort(byUrgency)[0];
    if (!top) {
        return {badge: "done", text: "No threads"};
    }
    const count = badges.filter(b => b === top).length;
    const text = top === "blocked" ? `${count} need${count === 1 ? "s" : ""} you`
        : top === "done" ? "All resolved"
        : count > 1 ? `${count} ${claudeBadges[top].label.toLowerCase()}` : claudeBadges[top].label;
    return {badge: top, text};
}

export const projectLabel = (p: ClaudeProject) => p.shortName ?? p.name;

/* Which threads get a node. A project's badge still counts every thread, hidden or not. */
type ThreadFilter = (thread: ClaudeThread, project: ClaudeProject) => boolean;
const everyThread: ThreadFilter = () => true;

/* How many artifacts hang off one node: a thread's few, a project's a few more. New and updated ones go first. */
const artifactsPerThread = 3;
const artifactsPerProject = 6;

/* Each artifact hangs off the latest thread that made it, while that thread is on the map; otherwise (a resolved
   thread that's hidden, or one nobody claimed) it moves up to its project, so it never drops off the map. */
function artifactNodes(p: ClaudeProject, threadsOnMap: Set<string>): {node: MapNode, parent: string}[] {
    const byParent = new Map<string, ClaudeArtifact[]>();
    for (const a of [...(p.artifacts ?? [])].sort(byLatestChange)) {
        const parent = a.threadIds.find(id => threadsOnMap.has(id)) ?? p.id;
        byParent.set(parent, [...(byParent.get(parent) ?? []), a]);
    }
    return [...byParent].flatMap(([parent, artifacts]) => {
        const flagged = artifacts.filter(a => artifactFlag(a, p));
        const rest = artifacts.filter(a => !artifactFlag(a, p));
        const cap = parent === p.id ? artifactsPerProject : artifactsPerThread;
        return [...flagged, ...rest].slice(0, Math.max(cap, flagged.length)).map(a => ({
            parent,
            node: {id: `artifact:${a.id}`, kind: "artifact" as const, label: a.title, url: a.url, project: p, artifact: a, pill: artifactPill(a, artifactFlag(a, p))}
        }));
    });
}

function graphOf(projects: ClaudeProject[], onMap: ThreadFilter = everyThread, showArtifacts = true): {nodes: MapNode[], links: {source: string, target: string}[]} {
    const nodes: MapNode[] = [{id: "claude", kind: "root", label: "Claude"}];
    const links: {source: string, target: string}[] = [];
    for (const p of projects) {
        const summary = projectSummary(p);
        nodes.push({id: p.id, kind: "project", label: projectLabel(p), badge: summary.badge, badgeText: summary.text, url: p.url, project: p});
        links.push({source: "claude", target: p.id});
        const threadsOnMap = new Set<string>();
        for (const t of p.threads.filter(t => onMap(t, p))) {
            const badge = badgeFor(t, p);
            nodes.push({id: t.id, kind: "thread", label: t.title, badge, url: t.url, project: p, thread: t});
            links.push({source: p.id, target: t.id});
            threadsOnMap.add(t.id);
        }
        if (showArtifacts) {
            for (const {node, parent} of artifactNodes(p, threadsOnMap)) {
                nodes.push(node);
                links.push({source: parent, target: node.id});
            }
        }
    }
    return {nodes, links};
}

/* Keeps nodes (and the labels under them) from piling up. Small maps, so pairwise is fine. */
function collide(radius: number) {
    let nodes: NodeObject<MapNode>[] = [];
    const force = (alpha: number) => {
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                const dx = (b.x ?? 0) - (a.x ?? 0), dy = (b.y ?? 0) - (a.y ?? 0);
                const distance = Math.hypot(dx, dy) || 0.01;
                if (distance < radius * 2) {
                    const push = (radius * 2 - distance) / distance * alpha * 0.5;
                    a.vx = (a.vx ?? 0) - dx * push;
                    a.vy = (a.vy ?? 0) - dy * push;
                    b.vx = (b.vx ?? 0) + dx * push;
                    b.vy = (b.vy ?? 0) + dy * push;
                }
            }
        }
    };
    force.initialize = (n: NodeObject<MapNode>[]) => {
        nodes = n;
    };
    return force;
}

/* Words into at most two lines of about `width` characters; the rest trails off */
function wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
        if (line && (line + " " + word).length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    lines.push(line);
    if (lines.length > 2) {
        return [lines[0], `${lines[1].slice(0, width - 1)}…`];
    }
    return lines.map(l => l.length > width + 4 ? `${l.slice(0, width + 3)}…` : l);
}

const radiusOf = (kind: MapNode["kind"]) => kind === "root" ? 9 : kind === "project" ? 7 : kind === "artifact" ? 4.5 : 5;

function drawNode(node: NodeObject<MapNode>, ctx: CanvasRenderingContext2D, selectedId?: string) {
    const x = node.x ?? 0, y = node.y ?? 0;
    const r = radiusOf(node.kind);
    const dimmed = (node.badge === "done" || node.badge === "someday") && node.kind === "thread";
    ctx.save();
    ctx.globalAlpha = dimmed ? 0.55 : 1;

    // working threads breathe
    if (node.badge === "working") {
        const phase = (Date.now() % 2000) / 2000;
        ctx.beginPath();
        ctx.arc(x, y, r + 1 + phase * 4, 0, 2 * Math.PI);
        ctx.strokeStyle = claudeBadges.working.color;
        ctx.globalAlpha = (1 - phase) * 0.6;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    if (node.kind === "artifact") {
        // a page with a folded corner, so an artifact never reads as a thread
        const fold = r * 0.6;
        ctx.moveTo(x - r, y - r);
        ctx.lineTo(x + r - fold, y - r);
        ctx.lineTo(x + r, y - r + fold);
        ctx.lineTo(x + r, y + r);
        ctx.lineTo(x - r, y + r);
        ctx.closePath();
    } else {
        ctx.arc(x, y, r, 0, 2 * Math.PI);
    }
    ctx.fillStyle = node.kind === "root" ? claudeStyle.ring : claudeStyle.fill;
    ctx.fill();
    ctx.lineWidth = node.id === selectedId ? 2.2 : 1.2;
    ctx.strokeStyle = node.id === selectedId ? claudeStyle.ink : claudeStyle.ring;
    if (node.badge && quietBadges.includes(node.badge)) {
        ctx.setLineDash([1.5, 1.5]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // the badge's colour as a dot in the middle, so it reads even zoomed out
    if (node.badge && node.kind !== "root") {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, 2 * Math.PI);
        ctx.fillStyle = claudeBadges[node.badge].color;
        ctx.fill();
    }

    // something new since Jon last opened it from the map: a small dot on the ring
    if (node.kind === "thread" && node.thread && isNewSince(node.thread)) {
        ctx.beginPath();
        ctx.arc(x + r * 0.75, y - r * 0.75, 1.7, 0, 2 * Math.PI);
        ctx.fillStyle = claudeStyle.ring;
        ctx.fill();
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();
    }

    // an artifact: lines of writing on the page
    if (node.kind === "artifact") {
        ctx.strokeStyle = node.pill?.text === "New" ? "#7C3AED" : claudeStyle.ring;
        ctx.lineWidth = 0.5;
        for (const dy of [-1.5, 0, 1.5]) {
            ctx.beginPath();
            ctx.moveTo(x - r * 0.55, y + dy);
            ctx.lineTo(x + r * 0.45, y + dy);
            ctx.stroke();
        }
    }

    // label: up to two short lines, so neighbours don't collide
    const small = node.kind === "thread" || node.kind === "artifact";
    const fontSize = small ? 3.6 : 4.4;
    ctx.textAlign = "center";
    if (node.kind === "root") {
        ctx.font = `600 3.6px ${claudeStyle.font}`;
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label, x, y);
    } else {
        ctx.font = `${small ? 500 : 600} ${fontSize}px ${claudeStyle.font}`;
        ctx.fillStyle = claudeStyle.ink;
        ctx.textBaseline = "top";
        const lines = wrap(node.label, node.kind === "project" ? 20 : 18);
        lines.forEach((line, i) => ctx.fillText(line, x, y + r + 1.5 + i * fontSize * 1.1));
        // an artifact's pill (New, Updated, or how old) under the label
        if (node.pill) {
            const pill = node.pill;
            const pillFont = fontSize * 0.78;
            ctx.font = `600 ${pillFont}px system-ui, sans-serif`;
            const w = ctx.measureText(pill.text).width + pillFont;
            const h = pillFont * 1.5;
            const top = y + r + 2.5 + lines.length * fontSize * 1.1;
            ctx.fillStyle = pill.bg;
            ctx.beginPath();
            ctx.roundRect(x - w / 2, top, w, h, h / 2);
            ctx.fill();
            if (pill.outline) {
                ctx.strokeStyle = pill.outline;
                ctx.lineWidth = 0.3;
                ctx.stroke();
            }
            ctx.fillStyle = pill.fg;
            ctx.textBaseline = "middle";
            ctx.fillText(pill.text, x, top + h / 2);
        }
        // badge pill under the label
        if (node.badge) {
            const badge = claudeBadges[node.badge];
            const text = node.badgeText ?? badge.label;
            const pillFont = fontSize * 0.78;
            ctx.font = `600 ${pillFont}px system-ui, sans-serif`;
            const w = ctx.measureText(text).width + pillFont;
            const h = pillFont * 1.5;
            const top = y + r + 2.5 + lines.length * fontSize * 1.1;
            ctx.fillStyle = badge.color;
            ctx.beginPath();
            ctx.roundRect(x - w / 2, top, w, h, h / 2);
            ctx.fill();
            if (quietBadges.includes(node.badge)) {
                ctx.setLineDash([0.8, 0.8]);
                ctx.strokeStyle = "#9CA3AF";
                ctx.lineWidth = 0.3;
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.fillStyle = badge.text;
            ctx.textBaseline = "middle";
            ctx.fillText(text, x, top + h / 2);
        }
    }
    ctx.restore();
}

export function BadgeChip({kind, text}: {kind: ClaudeBadgeKind, text?: string}) {
    const badge = claudeBadges[kind];
    return <Chip
        size="small"
        label={text ?? badge.label}
        sx={{
            bgcolor: badge.color, color: badge.text, fontWeight: 600,
            border: quietBadges.includes(kind) ? "1px dashed #9CA3AF" : undefined
        }}
    />;
}

/* "Garden · made in Plan the shed · Updated 3h ago" for an artifact's card */
function artifactCaption(artifact: ClaudeArtifact, project: ClaudeProject): string {
    const flag = artifactFlag(artifact, project);
    return [flag === "new" ? "New artifact" : "Artifact", `updated ${ago(artifact.updatedAt ?? artifact.firstSeenAt)}`].join(" · ");
}

/* An artifact's card names the threads that made it; one on the map can be picked, any can be opened in Claude */
function ArtifactThreads({artifact, project, onSelect, onMap}: {
    artifact: ClaudeArtifact, project: ClaudeProject, onSelect: (threadId: string) => void, onMap: (threadId: string) => boolean
}) {
    const threads = artifact.threadIds.map(id => project.threads.find(t => t.id === id)).filter((t): t is ClaudeThread => !!t);
    if (!threads.length) {
        return <Typography variant="caption" color="text.secondary" display="block" sx={{mt: 1}}>
            No thread has said it made this one yet, so it sits on the project.
        </Typography>;
    }
    return <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center" sx={{mt: 1.25}}>
        <Typography variant="caption" color="text.secondary">Made in</Typography>
        {threads.map(t => <Chip
            key={t.id}
            size="small"
            variant="outlined"
            label={t.title}
            title={onMap(t.id) ? "Show this thread" : "Resolved and off the map: show it from the resolved list"}
            onClick={onMap(t.id) ? () => onSelect(t.id) : undefined}
            sx={{maxWidth: 260, opacity: onMap(t.id) ? 1 : 0.7}}
        />)}
    </Stack>;
}

/* How many of a project's artifacts the list shows before "Show all" */
const listArtifactsAtFirst = 5;

/* Every artifact in the project, newest first, under its threads in the list view */
function ProjectArtifacts({project, all, onAll, onOpen}: {
    project: ClaudeProject, all: boolean, onAll: (all: boolean) => void, onOpen: (a: ClaudeArtifact) => void
}) {
    const artifacts = [...(project.artifacts ?? [])].sort(byLatestChange);
    const listed = all ? artifacts : artifacts.slice(0, listArtifactsAtFirst);
    const threadTitle = (a: ClaudeArtifact) => a.threadIds.map(id => project.threads.find(t => t.id === id)?.title).find(Boolean);
    return <>
        <ListSubheader disableSticky sx={{lineHeight: "28px", bgcolor: "#fff", color: "#5B21B6", fontWeight: 600}}>
            Artifacts ({artifacts.length})
        </ListSubheader>
        {listed.map(a => {
            const flag = artifactFlag(a, project);
            const pill = artifactPill(a, flag);
            return <ListItemButton key={a.id} {...artifactLinkProps(a.url)} onClick={() => onOpen(a)} sx={{gap: 1.5, pl: 3}}>
                <Description sx={{color: flag ? "#7C3AED" : claudeStyle.ring}}/>
                <ListItemText
                    primary={a.title}
                    secondary={[threadTitle(a), flag ? undefined : pill.text].filter(Boolean).join(" · ") || undefined}
                    secondaryTypographyProps={{noWrap: true}}
                    sx={{minWidth: 0}}
                />
                {flag && <PillChip pill={pill}/>}
            </ListItemButton>;
        })}
        {artifacts.length > listArtifactsAtFirst && <Box sx={{pl: 2.5, pb: 1}}>
            <Button size="small" sx={{color: "#5B21B6"}} onClick={() => onAll(!all)}>
                {all ? "Show fewer artifacts" : `Show all ${artifacts.length} artifacts`}
            </Button>
        </Box>}
    </>;
}

/* Where "Open in Claude" goes. Kept per device, since the desktop app is only on some of them. */
/* No "reuse one tab" choice: claude.ai sends Cross-Origin-Opener-Policy: same-origin, which cuts the tab off
   from the page that opened it, so neither its name nor a kept handle can reach it again (tried 2026-11-05). */
export type OpenIn = "new-tab" | "desktop";
const openInKey = "claudeMap.openIn";
const openInLabels: Record<OpenIn, string> = {
    "new-tab": "A new browser tab each time",
    "desktop": "The Claude desktop app"
};

/* claude.ai's links work in the desktop app as claude://claude.ai/<same path>. Its help page lists chats and
   projects; Jon confirmed on 2026-11-05 that it lands on Claude Code project threads too. */
const desktopUrl = (url: string) => url.replace(/^https:\/\/claude\.ai\//, "claude://claude.ai/");

const open = (url: string | undefined, openIn: OpenIn) => {
    if (!url) {
        return;
    }
    if (openIn === "desktop") {
        window.location.href = desktopUrl(url);
        return;
    }
    const tab = window.open(url, "_blank");
    if (tab) {
        tab.opener = null;
    }
};

/* A real link, so the URL shows on hover, can be copied, and cmd- or middle-click makes a tab of its own */
export const linkProps = (url: string | undefined, openIn: OpenIn) => !url ? {} : openIn === "desktop"
    ? {component: "a" as const, href: desktopUrl(url)}
    : {component: "a" as const, href: url, target: "_blank", rel: "noopener noreferrer"};

const readOpenIn = (): OpenIn => {
    try {
        const value = localStorage.getItem(openInKey);
        return value === "desktop" ? value : "new-tab";
    } catch {
        return "new-tab";
    }
};

/* Done threads leave the map unless Jon asks for one back. Both choices are kept per device, like Open in. */
const hideDoneKey = "claudeMap.hideDone";
const showArtifactsKey = "claudeMap.showArtifacts";

const readShowArtifacts = (): boolean => {
    try {
        return localStorage.getItem(showArtifactsKey) !== "false";
    } catch {
        return true;
    }
};
const shownDoneKey = "claudeMap.shownDone";

const readHideDone = (): boolean => {
    try {
        return localStorage.getItem(hideDoneKey) !== "false";
    } catch {
        return true;
    }
};

const readShownDone = (): Set<string> => {
    try {
        const ids = JSON.parse(localStorage.getItem(shownDoneKey) ?? "[]");
        return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
    } catch {
        return new Set();
    }
};

export const keep = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // private window: the choice lasts until the page closes
    }
};

type GraphData = {
    nodes: NodeObject<MapNode>[],
    links: {source: string, target: string}[],
    /* where to hold existing nodes while new ones settle; emptied once applied */
    pins?: Map<string, {x: number, y: number}>
};

const structureOf = (g: {nodes: {id: string}[], links: {source: string, target: string}[]}) =>
    JSON.stringify([g.nodes.map(n => n.id), g.links.map(l => `${l.source}>${l.target}`)]);

/* Keeps the same node objects (and so their positions) across refreshes. A refresh that only changes
   states or titles updates the nodes in place and leaves the layout alone; new nodes start next to
   their parent, so only they and their neighbours move. */
function useStableGraph(projects: ClaudeProject[], onMap: ThreadFilter, showArtifacts: boolean): GraphData {
    const current = React.useRef<{data: GraphData, structure: string}>();
    return React.useMemo(() => {
        const fresh = graphOf(projects, onMap, showArtifacts);
        const structure = structureOf(fresh);
        const previous = current.current;
        const byId = new Map((previous?.data.nodes ?? []).map(n => [n.id, n]));
        if (previous && previous.structure === structure) {
            for (const node of fresh.nodes) {
                Object.assign(byId.get(node.id)!, node);
            }
            return previous.data;
        }
        const parentOf = new Map(fresh.links.map(l => [l.target, l.source]));
        // While new nodes find their place, everything else holds still except their siblings,
        // which make room. The graph's own layout pass clears pins, so they go on at the first tick
        // after it (see onEngineTick) and come off when the layout settles (see onEngineStop).
        const newParents = new Set(fresh.nodes.filter(n => !byId.has(n.id)).map(n => parentOf.get(n.id)));
        const pins = new Map<string, {x: number, y: number}>();
        if (previous) {
            for (const kept of byId.values()) {
                if (!newParents.has(parentOf.get(kept.id)) && kept.x !== undefined && kept.y !== undefined) {
                    pins.set(kept.id, {x: kept.x, y: kept.y});
                }
            }
        }
        const nodes = fresh.nodes.map(node => {
            const kept = byId.get(node.id);
            if (kept) {
                return Object.assign(kept, node);
            }
            const parent = byId.get(parentOf.get(node.id) ?? "");
            return parent?.x !== undefined
                ? {...node, x: parent.x + (Math.random() - 0.5) * 10, y: (parent.y ?? 0) + (Math.random() - 0.5) * 10}
                : node;
        });
        const data: GraphData = {nodes, links: fresh.links.map(l => ({...l})), pins};
        current.current = {data, structure};
        return data;
    }, [projects, onMap, showArtifacts]);
}

function useClaudeMap(demo: boolean) {
    const [projects, setProjects] = React.useState<ClaudeProject[]>();
    const [error, setError] = React.useState<string>();
    const tick = React.useRef(0);
    const load = React.useCallback((advance = false) => {
        if (demo) {
            // like a real refresh, coming back to the window shows the same data; only the timer moves it on
            setProjects(demoClaudeMap(advance ? ++tick.current : tick.current));
            return;
        }
        ServerApi.claudeMap()
            .then(p => {
                setProjects(p);
                setError(undefined);
            })
            .catch((e: Error) => setError(e.message));
    }, [demo]);
    // the server rings whenever a thread syncs, so the map shows it at once
    useRing("claude", undefined, load, !demo);
    React.useEffect(() => {
        const visible = () => document.visibilityState === "visible";
        const refocus = () => visible() && load();
        load();
        // the demo moves on by itself, faster, so changes are easy to watch; the real map only takes a slow
        // safety look while visible, in case a ring was lost
        const timer = window.setInterval(() => demo ? load(true) : refocus(), demo ? 8000 : safetyPollMs);
        window.addEventListener("focus", refocus);
        document.addEventListener("visibilitychange", refocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refocus);
            document.removeEventListener("visibilitychange", refocus);
        };
    }, [load, demo]);
    return {projects, error, reload: load, setProjects};
}

export function ClaudeMap() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const demo = params.has("demo");
    const {projects, error, reload, setProjects} = useClaudeMap(demo);
    const [view, setView] = React.useState<"map" | "list" | "events">("map");
    const [showHidden, setShowHidden] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string>();
    const [query, setQuery] = React.useState("");
    const [openIn, setOpenInState] = React.useState<OpenIn>(readOpenIn);
    const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
    const setOpenIn = (value: OpenIn) => {
        setOpenInState(value);
        keep(openInKey, value);
    };
    const [hideDone, setHideDoneState] = React.useState(readHideDone);
    const setHideDone = (value: boolean) => {
        setHideDoneState(value);
        keep(hideDoneKey, String(value));
    };
    const [showArtifacts, setShowArtifactsState] = React.useState(readShowArtifacts);
    const setShowArtifacts = (value: boolean) => {
        setShowArtifactsState(value);
        keep(showArtifactsKey, String(value));
    };
    /* done threads Jon brought back onto the map, one by one */
    const [shownDone, setShownDoneState] = React.useState(readShownDone);
    const setShownDone = (threadId: string, show: boolean) => setShownDoneState(previous => {
        const next = new Set(previous);
        if (show) {
            next.add(threadId);
        } else {
            next.delete(threadId);
        }
        keep(shownDoneKey, JSON.stringify([...next]));
        return next;
    });
    const [doneListOpen, setDoneListOpen] = React.useState(false);
    const [rect, sizeRef] = useElementSize();
    const graphRef = React.useRef<ForceGraphMethods<NodeObject<MapNode>>>();
    const lastClick = React.useRef<{id: string, at: number}>();

    const visible = React.useMemo(() => (projects ?? []).filter(p => showHidden || !p.hidden), [projects, showHidden]);
    // a search keeps the matching threads and the projects they belong to, so they still hang off Claude
    const searching = query.trim().length > 0;
    // and the artifacts those threads made, or whose title matches
    const shown = React.useMemo(() => searching
        ? visible.map(p => {
            const threads = p.threads.filter(t => matchesSearch(t, p, query));
            const ids = new Set(threads.map(t => t.id));
            const artifacts = p.artifacts?.filter(a => a.threadIds.some(id => ids.has(id)) || artifactMatches(a, query));
            return {...p, threads, artifacts};
        }).filter(p => p.threads.length > 0 || (p.artifacts?.length ?? 0) > 0)
        : visible, [visible, query, searching]);
    /* projects whose artifacts the list view shows in full */
    const [allArtifactsOf, setAllArtifactsOf] = React.useState<Set<string>>(new Set());
    const isHiddenDone = React.useCallback<ThreadFilter>(
        (t, p) => hideDone && badgeFor(t, p) === "done" && !shownDone.has(t.id), [hideDone, shownDone]);
    // a search finds done threads too, so nothing is out of reach
    const onMap = React.useCallback<ThreadFilter>((t, p) => searching || !isHiddenDone(t, p), [searching, isHiddenDone]);
    const graphData = useStableGraph(shown, onMap, showArtifacts);
    /* the done threads left off the map, latest first */
    const hiddenDone = React.useMemo(() => visible
        .flatMap(p => p.threads.filter(t => isHiddenDone(t, p)).map(thread => ({thread, project: p})))
        .sort((a, b) => (b.thread.lastActivityAt ?? b.thread.lastSeenAt).localeCompare(a.thread.lastActivityAt ?? a.thread.lastSeenAt)),
        [visible, isHiddenDone]);
    const lastSynced = visible.map(p => p.lastSyncedAt).sort().at(-1);
    if (demo) {
        // lets the demo's layout be inspected, and a card opened, from the console
        Object.assign(window, {claudeMapNodes: graphData.nodes, claudeMapSelect: setSelectedId});
    }
    // forces are set once each time the graph mounts; a data refresh never restarts the whole layout.
    // (The graph's handle is a new object on every render, so it can't tell mounts apart; this can.)
    const fitted = React.useRef(false);
    const showingGraph = view === "map" && rect.width > 0 && shown.length > 0;
    React.useEffect(() => {
        const graph = graphRef.current;
        if (!showingGraph || !graph) {
            return;
        }
        fitted.current = false;
        graph.d3Force("collide", collide(26));
        graph.d3Force("charge")?.strength(-160);
        graph.d3ReheatSimulation();
    }, [showingGraph]);
    // after a search settles, bring what it found into view
    React.useEffect(() => {
        if (!showingGraph || !fitted.current) {
            return;
        }
        const timer = window.setTimeout(() => graphRef.current?.zoomToFit(400, 60), 700);
        return () => window.clearTimeout(timer);
    }, [query, showingGraph]);
    const selected = graphData.nodes.find(n => n.id === selectedId);
    const hiddenCount = (projects ?? []).filter(p => p.hidden).length;

    /* Jump to Claude; for a thread, what its card says now is no longer new */
    const openNode = (url?: string, thread?: ClaudeThread) => {
        open(url, openIn);
        markOpened(thread);
    };
    /* what its card says now is no longer new */
    const markOpened = (thread?: ClaudeThread) => {
        if (thread) {
            const openedAt = new Date().toISOString();
            setProjects(ps => ps?.map(p => ({...p, threads: p.threads.map(t => t.id === thread.id ? {...t, openedAt} : t)})));
            if (!demo) {
                ServerApi.markClaudeThreadOpened(thread.id).catch(() => undefined);
            }
        }
    };

    /* Opening an artifact from the map clears its New or Updated pill */
    const markArtifactOpened = (artifact: ClaudeArtifact) => {
        const openedAt = new Date().toISOString();
        setProjects(ps => ps?.map(p => ({...p, artifacts: p.artifacts?.map(a => a.id === artifact.id ? {...a, openedAt} : a)})));
        if (!demo) {
            ServerApi.markClaudeArtifactOpened(artifact.id).catch(() => undefined);
        }
    };

    const toggleHidden = (project: ClaudeProject) => {
        const hidden = !project.hidden;
        setProjects(ps => ps?.map(p => p.id === project.id ? {...p, hidden} : p));
        if (!demo) {
            ServerApi.setClaudeProjectHidden(project.id, hidden).catch(() => reload());
        }
    };

    return <Box sx={{display: "flex", flexDirection: "column", height: "100dvh", bgcolor: claudeStyle.fill}}>
        <AppBar position="static" elevation={0} sx={{bgcolor: claudeStyle.ring, color: "#fff"}}>
            <Toolbar sx={{gap: 1}}>
                <IconButton color="inherit" edge="start" aria-label="Back to your maps" onClick={() => navigate("/")}>
                    <ArrowBack/>
                </IconButton>
                {/* three tabs leave no room for the title on a phone */}
                <Typography sx={{flexGrow: 1, fontFamily: claudeStyle.font, fontWeight: 600, fontSize: "1.25rem", display: {xs: "none", sm: "block"}}}>
                    Claude map
                </Typography>
                <Box sx={{flexGrow: 1, display: {xs: "block", sm: "none"}}}/>
                <Tabs
                    value={view}
                    onChange={(_, v) => setView(v)}
                    textColor="inherit"
                    TabIndicatorProps={{style: {backgroundColor: "#fff"}}}
                    // three tabs fit a phone only without the default minimum width
                    sx={{"& .MuiTab-root": {minWidth: {xs: 0, sm: 90}, px: {xs: 1.25, sm: 2}}}}
                >
                    <Tab value="map" label="Map"/>
                    <Tab value="list" label="List"/>
                    <Tab value="events" label="Log"/>
                </Tabs>
                <LiveDot/>
                <IconButton color="inherit" edge="end" aria-label="Settings" onClick={e => setMenuAnchor(e.currentTarget)}>
                    <Settings/>
                </IconButton>
                <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
                    <ListSubheader sx={{lineHeight: "32px"}}>Open in Claude goes to</ListSubheader>
                    {(Object.keys(openInLabels) as OpenIn[]).map(value => <MenuItem
                        key={value}
                        selected={openIn === value}
                        onClick={() => {
                            setOpenIn(value);
                            setMenuAnchor(null);
                        }}
                    >
                        <ListItemIcon>{openIn === value ? <Check fontSize="small"/> : null}</ListItemIcon>
                        {openInLabels[value]}
                    </MenuItem>)}
                    <ListSubheader sx={{lineHeight: "32px"}}>On the map</ListSubheader>
                    <MenuItem onClick={() => setHideDone(!hideDone)}>
                        <ListItemIcon>{hideDone ? <CheckBox fontSize="small"/> : <CheckBoxOutlineBlank fontSize="small"/>}</ListItemIcon>
                        Hide resolved threads
                    </MenuItem>
                    <MenuItem onClick={() => setShowArtifacts(!showArtifacts)}>
                        <ListItemIcon>{showArtifacts ? <CheckBox fontSize="small"/> : <CheckBoxOutlineBlank fontSize="small"/>}</ListItemIcon>
                        Show artifacts
                    </MenuItem>
                </Menu>
            </Toolbar>
        </AppBar>

        {(projects?.length ?? 0) > 0 && <Stack direction="row" alignItems="center" gap={1.5} sx={{px: 2, py: 1, bgcolor: "#fff", borderBottom: `1px solid ${claudeStyle.link}`}}>
            <TextField
                size="small"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search words, topics or a day (monday)"
                sx={{flexGrow: 1}}
                InputProps={{
                    startAdornment: <InputAdornment position="start"><Search fontSize="small"/></InputAdornment>,
                    endAdornment: query ? <InputAdornment position="end">
                        <IconButton size="small" aria-label="Clear the search" onClick={() => setQuery("")}><Close fontSize="small"/></IconButton>
                    </InputAdornment> : undefined
                }}
            />
            {lastSynced && <Typography variant="caption" color="text.secondary" sx={{flexShrink: 0}} title={new Date(lastSynced).toLocaleString()}>
                Synced {ago(lastSynced)}
            </Typography>}
        </Stack>}
        {view !== "events" && searching && shown.length === 0 && <Typography variant="body2" sx={{px: 2, py: 1.5}}>No thread matches that.</Typography>}

        {error && <Alert severity="warning" sx={{borderRadius: 0}}>Couldn't refresh the Claude map. {error}</Alert>}
        {demo && <Alert severity="info" sx={{borderRadius: 0}}>Sample data. Nothing here is real.</Alert>}

        {projects && projects.length === 0 && <Paper elevation={0} sx={{m: 2, p: 2, bgcolor: "#fff"}}>
            <Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, mb: 1}}>No Claude projects yet</Typography>
            <Typography variant="body2">
                A project appears here the first time a Claude in it syncs. To opt a project in, add the Claude map line to its
                project instructions.
            </Typography>
        </Paper>}

        <Box ref={sizeRef} sx={{flexGrow: 1, minHeight: 0, position: "relative", overflow: "auto"}}>
            {showingGraph && <ForceGraph2D<MapNode>
                ref={graphRef}
                width={rect.width}
                height={rect.height}
                graphData={graphData}
                dagMode="radialout"
                dagLevelDistance={60}
                backgroundColor={claudeStyle.fill}
                linkColor={() => claudeStyle.link}
                linkWidth={1.5}
                nodeRelSize={6}
                nodeVal={n => radiusOf(n.kind) ** 2 / 36}
                nodeLabel={n => n.kind === "thread" || n.kind === "artifact" ? n.label : ""}
                nodeCanvasObject={(n, ctx) => drawNode(n, ctx, selectedId)}
                nodePointerAreaPaint={(n, color, ctx) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(n.x ?? 0, n.y ?? 0, radiusOf(n.kind) + 3, 0, 2 * Math.PI);
                    ctx.fill();
                }}
                autoPauseRedraw={false}
                // settle by ticks, not by the clock: a background tab draws no frames, and a clock-based
                // cooldown would end the moment Jon came back, leaving new threads on top of their project
                cooldownTicks={120}
                cooldownTime={Infinity}
                onEngineTick={() => {
                    if (graphData.pins?.size) {
                        graphData.nodes.forEach(n => {
                            const pin = graphData.pins!.get(n.id);
                            if (pin) {
                                n.fx = n.x = pin.x;
                                n.fy = n.y = pin.y;
                            }
                        });
                        graphData.pins.clear();
                    }
                }}
                onEngineStop={() => {
                    graphData.nodes.forEach(n => {
                        n.fx = undefined;
                        n.fy = undefined;
                    });
                    // fit once; after that, leave the view where Jon put it
                    if (!fitted.current) {
                        fitted.current = true;
                        graphRef.current?.zoomToFit(400, 40);
                    }
                }}
                onNodeClick={n => {
                    const now = Date.now();
                    const doubled = lastClick.current?.id === n.id && now - lastClick.current.at < 400;
                    lastClick.current = {id: n.id, at: now};
                    setSelectedId(n.kind === "root" ? undefined : n.id);
                    if (n.kind !== "root") {
                        setDoneListOpen(false);
                    }
                    if (doubled && n.artifact) {
                        open(n.url, "new-tab");
                        markArtifactOpened(n.artifact);
                    } else if (doubled) {
                        openNode(n.url, n.thread);
                    }
                }}
                onBackgroundClick={() => setSelectedId(undefined)}
            />}

            {view === "events" && <ClaudeEventLog projects={projects ?? []} query={query} openIn={openIn} demo={demo}/>}

            {view === "list" && <List dense sx={{bgcolor: "#fff", pb: 10}}>
                {shown.map(p => <React.Fragment key={p.id}>
                    <ListSubheader sx={{display: "flex", alignItems: "center", gap: 1, bgcolor: claudeStyle.fill}}>
                        <Typography component="span" sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink, flexGrow: 1}}>
                            {projectLabel(p)}
                        </Typography>
                        <Typography component="span" variant="caption">synced {ago(p.lastSyncedAt)}</Typography>
                        <IconButton size="small" title="Open this project in Claude" {...linkProps(p.url, openIn)}><OpenInNew fontSize="small"/></IconButton>
                        <IconButton size="small" title={p.hidden ? "Show this project" : "Hide this project"} onClick={() => toggleHidden(p)}>
                            {p.hidden ? <Visibility fontSize="small"/> : <VisibilityOff fontSize="small"/>}
                        </IconButton>
                    </ListSubheader>
                    {[...p.threads]
                        .sort((a, b) => byUrgency(badgeFor(a, p), badgeFor(b, p)) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
                        .map(t => <ListItemButton key={t.id} {...linkProps(t.url, openIn)} onClick={() => markOpened(t)} sx={{gap: 1.5, opacity: t.state === "done" ? 0.6 : 1}}>
                            <BadgeChip kind={badgeFor(t, p)}/>
                            <ListItemText
                                primary={t.title}
                                secondary={[glanceLine(t), t.inLatest ? ago(t.lastActivityAt) : `not seen since ${ago(t.lastSeenAt)}`]
                                    .filter(Boolean).join(" · ")}
                                secondaryTypographyProps={{noWrap: true}}
                                sx={{minWidth: 0}}
                            />
                            {t.prs?.filter(pr => pr.state === "open" || pr.state === "draft").map(pr => <PrChip key={`${pr.repo}#${pr.number}`} pr={pr}/>)}
                            <NewDot thread={t}/>
                        </ListItemButton>)}
                    {(p.artifacts?.length ?? 0) > 0 && <ProjectArtifacts
                        project={p}
                        all={searching || allArtifactsOf.has(p.id)}
                        onAll={all => setAllArtifactsOf(previous => {
                            const next = new Set(previous);
                            if (all) next.add(p.id); else next.delete(p.id);
                            return next;
                        })}
                        onOpen={markArtifactOpened}
                    />}
                </React.Fragment>)}
                {hiddenCount > 0 && <Box sx={{p: 2}}>
                    <Button size="small" onClick={() => setShowHidden(s => !s)}>
                        {showHidden ? "Leave out hidden projects" : `Show ${hiddenCount} hidden project${hiddenCount === 1 ? "" : "s"}`}
                    </Button>
                </Box>}
            </List>}
        </Box>

        {view === "map" && showingGraph && !searching && hiddenDone.length > 0 && !doneListOpen && !selected && <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOff/>}
            onClick={() => setDoneListOpen(true)}
            sx={{
                position: "fixed", left: 16, bottom: 16, bgcolor: "#fff", color: claudeStyle.ink, borderColor: claudeStyle.link,
                "&:hover": {bgcolor: "#fff", borderColor: claudeStyle.ring}
            }}
        >
            {hiddenDone.length} resolved thread{hiddenDone.length === 1 ? "" : "s"} hidden
        </Button>}

        {view === "map" && doneListOpen && <Paper
            elevation={6}
            sx={{
                position: "fixed", left: 16, right: 16, bottom: 16, borderTop: `4px solid ${claudeBadges.done.color}`, maxWidth: 560, mx: "auto",
                maxHeight: "60dvh", display: "flex", flexDirection: "column"
            }}
        >
            <Stack direction="row" alignItems="center" gap={1} sx={{p: 2, pb: 1}}>
                <Box sx={{flexGrow: 1, minWidth: 0}}>
                    <Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink}}>
                        Resolved, off the map
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Latest first. Show one to put it back on the map.
                    </Typography>
                </Box>
                <IconButton size="small" aria-label="Close" onClick={() => setDoneListOpen(false)}><Close fontSize="small"/></IconButton>
            </Stack>
            <List dense sx={{overflowY: "auto", pt: 0}}>
                {hiddenDone.map(({thread: t, project: p}) => <ListItem
                    key={t.id}
                    secondaryAction={<Button size="small" startIcon={<Visibility/>} onClick={() => setShownDone(t.id, true)}>Show on map</Button>}
                    sx={{pr: 18}}
                >
                    <ListItemText
                        primary={t.title}
                        secondary={[projectLabel(p), ago(t.lastActivityAt ?? t.lastSeenAt), t.card?.headline].filter(Boolean).join(" · ")}
                        primaryTypographyProps={{noWrap: true}}
                        secondaryTypographyProps={{noWrap: true}}
                    />
                </ListItem>)}
                {hiddenDone.length === 0 && <Typography variant="body2" sx={{px: 2, pb: 2}}>Every resolved thread is on the map.</Typography>}
            </List>
        </Paper>}

        {view === "map" && selected && selected.kind !== "root" && <Paper
            elevation={6}
            sx={{
                position: "fixed", left: 16, right: 16, bottom: 16, p: 2, borderTop: `4px solid ${claudeStyle.ring}`, maxWidth: 560, mx: "auto",
                maxHeight: "70dvh", overflowY: "auto"
            }}
        >
            <Stack direction="row" alignItems="flex-start" gap={1}>
                <Box sx={{flexGrow: 1, minWidth: 0}}>
                    <Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink}}>
                        {selected.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {(selected.kind === "thread" || selected.kind === "artifact") && selected.project ? `${projectLabel(selected.project)} · ` : ""}
                        {selected.kind === "artifact" && selected.artifact
                            ? artifactCaption(selected.artifact, selected.project!)
                            : selected.kind === "thread"
                            ? (selected.thread!.inLatest ? `last active ${ago(selected.thread!.lastActivityAt)}` : `not seen since ${ago(selected.thread!.lastSeenAt)}`)
                                + ` · synced ${ago(selected.project!.lastSyncedAt)}`
                            : `${selected.project!.threads.length} threads · synced ${ago(selected.project!.lastSyncedAt)}`}
                    </Typography>
                </Box>
                <IconButton size="small" aria-label="Close" onClick={() => setSelectedId(undefined)}><Close fontSize="small"/></IconButton>
            </Stack>
            {selected.kind === "thread" && selected.thread && <ClaudeThreadGlance thread={selected.thread} project={selected.project!} onOpenArtifact={markArtifactOpened}/>}
            {selected.kind === "artifact" && selected.artifact && <ArtifactThreads
                artifact={selected.artifact}
                project={selected.project!}
                onSelect={id => setSelectedId(graphData.nodes.some(n => n.id === id) ? id : undefined)}
                onMap={id => graphData.nodes.some(n => n.id === id)}
            />}
            <Stack direction="row" alignItems="center" gap={1} sx={{mt: 1}}>
                {selected.badge && <BadgeChip kind={selected.badge} text={selected.badgeText}/>}
                {selected.pill && <PillChip pill={selected.pill}/>}
                <Box sx={{flexGrow: 1}}/>
                {hideDone && selected.kind === "thread" && selected.badge === "done" && shownDone.has(selected.id) && <Button
                    size="small"
                    startIcon={<VisibilityOff/>}
                    sx={{color: claudeStyle.ink}}
                    onClick={() => {
                        setShownDone(selected.id, false);
                        setSelectedId(undefined);
                    }}
                >
                    Hide again
                </Button>}
                <Button
                    variant="contained"
                    size="small"
                    endIcon={<OpenInNew/>}
                    sx={{bgcolor: claudeStyle.ring, "&:hover": {bgcolor: "#C4623F"}}}
                    {...(selected.artifact ? artifactLinkProps(selected.artifact.url) : linkProps(selected.url, openIn))}
                    onClick={() => selected.artifact ? markArtifactOpened(selected.artifact) : markOpened(selected.thread)}
                >
                    {selected.artifact ? "Open artifact" : "Open in Claude"}
                </Button>
            </Stack>
            {selected.badge && quietBadges.includes(selected.badge) && <Typography variant="caption" display="block" sx={{mt: 1}}>
                {selected.badge === "stale"
                    ? `No Claude in this project has synced for over ${claudeStaleHours} hours, so this may be out of date.`
                    : selected.badge === "someday"
                    ? `This has waited on you for over ${claudeSomedayDays} days. Pick it up, or resolve it in Claude to clear it.`
                    : "The project's latest sync didn't list this thread."}
            </Typography>}
        </Paper>}
    </Box>;
}
