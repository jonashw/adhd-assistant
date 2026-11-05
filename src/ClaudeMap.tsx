import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ForceGraph2D, { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import {
    Alert, AppBar, Box, Button, Chip, IconButton, List, ListItemButton, ListItemText, ListSubheader,
    InputAdornment, ListItemIcon, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, Toolbar, Typography
} from "@mui/material";
import { ArrowBack, Check, Close, OpenInNew, Search, Settings, Visibility, VisibilityOff } from "@mui/icons-material";
import {
    ClaudeBadgeKind, ClaudeProject, ClaudeThread, badgeFor, badgeOrder, claudeBadges, claudeStaleHours, glanceLine, isNewSince
} from "./ClaudeMapTypes";
import { ClaudeThreadGlance, NewDot, PrChip } from "./ClaudeThreadGlance";
import { matchesSearch } from "./claudeSearch";
import { ServerApi } from "./ServerApi";
import { useElementSize } from "./useContainerWidth";
import { demoClaudeMap } from "./claudeMapDemo";

/* The Claude map: Claude keeps it, Jon reads it. One region per Claude project, one node per thread,
   each with a badge for what it needs. Double-click a node (or tap Open) to jump to it in Claude. */

export const claudeStyle = {
    ring: "#D97757",
    fill: "#FAF6EF",
    ink: "#3D2B1F",
    link: "#E3C7B5",
    font: "'Source Serif 4', Georgia, 'Times New Roman', serif"
};

const refreshMs = 30_000;

type MapNode = {
    id: string,
    kind: "root" | "project" | "thread",
    label: string,
    badge?: ClaudeBadgeKind,
    /* the project's summary, like "2 need you" */
    badgeText?: string,
    url?: string,
    project?: ClaudeProject,
    thread?: ClaudeThread
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
        : top === "done" ? "All done"
        : count > 1 ? `${count} ${claudeBadges[top].label.toLowerCase()}` : claudeBadges[top].label;
    return {badge: top, text};
}

const projectLabel = (p: ClaudeProject) => p.shortName ?? p.name;

function graphOf(projects: ClaudeProject[]): {nodes: MapNode[], links: {source: string, target: string}[]} {
    const nodes: MapNode[] = [{id: "claude", kind: "root", label: "Claude"}];
    const links: {source: string, target: string}[] = [];
    for (const p of projects) {
        const summary = projectSummary(p);
        nodes.push({id: p.id, kind: "project", label: projectLabel(p), badge: summary.badge, badgeText: summary.text, url: p.url, project: p});
        links.push({source: "claude", target: p.id});
        for (const t of p.threads) {
            const badge = badgeFor(t, p);
            nodes.push({id: t.id, kind: "thread", label: t.title, badge, url: t.url, project: p, thread: t});
            links.push({source: p.id, target: t.id});
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

const radiusOf = (kind: MapNode["kind"]) => kind === "root" ? 9 : kind === "project" ? 7 : 5;

function drawNode(node: NodeObject<MapNode>, ctx: CanvasRenderingContext2D, selectedId?: string) {
    const x = node.x ?? 0, y = node.y ?? 0;
    const r = radiusOf(node.kind);
    const dimmed = node.badge === "done" && node.kind === "thread";
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
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = node.kind === "root" ? claudeStyle.ring : claudeStyle.fill;
    ctx.fill();
    ctx.lineWidth = node.id === selectedId ? 2.2 : 1.2;
    ctx.strokeStyle = node.id === selectedId ? claudeStyle.ink : claudeStyle.ring;
    if (node.badge === "stale" || node.badge === "gone") {
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

    // label: up to two short lines, so neighbours don't collide
    const fontSize = node.kind === "thread" ? 3.6 : 4.4;
    ctx.textAlign = "center";
    if (node.kind === "root") {
        ctx.font = `600 3.6px ${claudeStyle.font}`;
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label, x, y);
    } else {
        ctx.font = `${node.kind === "thread" ? 500 : 600} ${fontSize}px ${claudeStyle.font}`;
        ctx.fillStyle = claudeStyle.ink;
        ctx.textBaseline = "top";
        const lines = wrap(node.label, node.kind === "project" ? 20 : 18);
        lines.forEach((line, i) => ctx.fillText(line, x, y + r + 1.5 + i * fontSize * 1.1));
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
            if (node.badge === "stale" || node.badge === "gone") {
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
            border: kind === "stale" || kind === "gone" ? "1px dashed #9CA3AF" : undefined
        }}
    />;
}

/* Where "Open in Claude" goes. Kept per device, since the desktop app is only on some of them. */
type OpenIn = "new-tab" | "one-tab" | "desktop";
const openInKey = "claudeMap.openIn";
const openInLabels: Record<OpenIn, string> = {
    "new-tab": "A new browser tab each time",
    "one-tab": "One browser tab, reused",
    "desktop": "The Claude desktop app (experimental)"
};

/* claude.ai's links work in the desktop app as claude://claude.ai/<same path>. Its help page lists chats and
   projects; whether it routes Claude Code project threads is untested, hence "experimental". */
const desktopUrl = (url: string) => url.replace(/^https:\/\/claude\.ai\//, "claude://claude.ai/");

const open = (url: string | undefined, openIn: OpenIn) => {
    if (!url) {
        return;
    }
    if (openIn === "desktop") {
        window.location.href = desktopUrl(url);
        return;
    }
    const tab = window.open(url, openIn === "one-tab" ? "adhd-assist-claude" : "_blank");
    if (tab) {
        tab.opener = null;
    }
};

const readOpenIn = (): OpenIn => {
    try {
        const value = localStorage.getItem(openInKey);
        return value === "one-tab" || value === "desktop" ? value : "new-tab";
    } catch {
        return "new-tab";
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
function useStableGraph(projects: ClaudeProject[]): GraphData {
    const current = React.useRef<{data: GraphData, structure: string}>();
    return React.useMemo(() => {
        const fresh = graphOf(projects);
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
    }, [projects]);
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
    React.useEffect(() => {
        const refocus = () => load();
        load();
        // the demo refreshes faster, so changes are easy to watch
        const timer = window.setInterval(() => load(true), demo ? 8000 : refreshMs);
        window.addEventListener("focus", refocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refocus);
        };
    }, [load, demo]);
    return {projects, error, reload: load, setProjects};
}

export function ClaudeMap() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const demo = params.has("demo");
    const {projects, error, reload, setProjects} = useClaudeMap(demo);
    const [view, setView] = React.useState<"map" | "list">("map");
    const [showHidden, setShowHidden] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string>();
    const [query, setQuery] = React.useState("");
    const [openIn, setOpenInState] = React.useState<OpenIn>(readOpenIn);
    const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
    const setOpenIn = (value: OpenIn) => {
        setOpenInState(value);
        try {
            localStorage.setItem(openInKey, value);
        } catch {
            // private window: the choice lasts until the page closes
        }
    };
    const [rect, sizeRef] = useElementSize();
    const graphRef = React.useRef<ForceGraphMethods<NodeObject<MapNode>>>();
    const lastClick = React.useRef<{id: string, at: number}>();

    const visible = React.useMemo(() => (projects ?? []).filter(p => showHidden || !p.hidden), [projects, showHidden]);
    // a search keeps the matching threads and the projects they belong to, so they still hang off Claude
    const searching = query.trim().length > 0;
    const shown = React.useMemo(() => searching
        ? visible.map(p => ({...p, threads: p.threads.filter(t => matchesSearch(t, p, query))})).filter(p => p.threads.length > 0)
        : visible, [visible, query, searching]);
    const graphData = useStableGraph(shown);
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
        if (thread) {
            const openedAt = new Date().toISOString();
            setProjects(ps => ps?.map(p => ({...p, threads: p.threads.map(t => t.id === thread.id ? {...t, openedAt} : t)})));
            if (!demo) {
                ServerApi.markClaudeThreadOpened(thread.id).catch(() => undefined);
            }
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
                <Typography sx={{flexGrow: 1, fontFamily: claudeStyle.font, fontWeight: 600, fontSize: "1.25rem"}}>
                    Claude map
                </Typography>
                <Tabs
                    value={view}
                    onChange={(_, v) => setView(v)}
                    textColor="inherit"
                    TabIndicatorProps={{style: {backgroundColor: "#fff"}}}
                >
                    <Tab value="map" label="Map"/>
                    <Tab value="list" label="List"/>
                </Tabs>
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
        {searching && shown.length === 0 && <Typography variant="body2" sx={{px: 2, py: 1.5}}>No thread matches that.</Typography>}

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
                nodeLabel={n => n.kind === "thread" ? n.label : ""}
                nodeCanvasObject={(n, ctx) => drawNode(n, ctx, selectedId)}
                nodePointerAreaPaint={(n, color, ctx) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(n.x ?? 0, n.y ?? 0, radiusOf(n.kind) + 3, 0, 2 * Math.PI);
                    ctx.fill();
                }}
                autoPauseRedraw={false}
                cooldownTime={2500}
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
                    if (doubled) {
                        openNode(n.url, n.thread);
                    }
                }}
                onBackgroundClick={() => setSelectedId(undefined)}
            />}

            {view === "list" && <List dense sx={{bgcolor: "#fff", pb: 10}}>
                {shown.map(p => <React.Fragment key={p.id}>
                    <ListSubheader sx={{display: "flex", alignItems: "center", gap: 1, bgcolor: claudeStyle.fill}}>
                        <Typography component="span" sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink, flexGrow: 1}}>
                            {projectLabel(p)}
                        </Typography>
                        <Typography component="span" variant="caption">synced {ago(p.lastSyncedAt)}</Typography>
                        <IconButton size="small" title="Open this project in Claude" onClick={() => openNode(p.url)}><OpenInNew fontSize="small"/></IconButton>
                        <IconButton size="small" title={p.hidden ? "Show this project" : "Hide this project"} onClick={() => toggleHidden(p)}>
                            {p.hidden ? <Visibility fontSize="small"/> : <VisibilityOff fontSize="small"/>}
                        </IconButton>
                    </ListSubheader>
                    {[...p.threads]
                        .sort((a, b) => byUrgency(badgeFor(a, p), badgeFor(b, p)) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
                        .map(t => <ListItemButton key={t.id} onClick={() => openNode(t.url, t)} sx={{gap: 1.5, opacity: t.state === "done" ? 0.6 : 1}}>
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
                </React.Fragment>)}
                {hiddenCount > 0 && <Box sx={{p: 2}}>
                    <Button size="small" onClick={() => setShowHidden(s => !s)}>
                        {showHidden ? "Leave out hidden projects" : `Show ${hiddenCount} hidden project${hiddenCount === 1 ? "" : "s"}`}
                    </Button>
                </Box>}
            </List>}
        </Box>

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
                        {selected.kind === "thread" && selected.project ? `${projectLabel(selected.project)} · ` : ""}
                        {selected.kind === "thread"
                            ? (selected.thread!.inLatest ? `last active ${ago(selected.thread!.lastActivityAt)}` : `not seen since ${ago(selected.thread!.lastSeenAt)}`)
                                + ` · synced ${ago(selected.project!.lastSyncedAt)}`
                            : `${selected.project!.threads.length} threads · synced ${ago(selected.project!.lastSyncedAt)}`}
                    </Typography>
                </Box>
                <IconButton size="small" aria-label="Close" onClick={() => setSelectedId(undefined)}><Close fontSize="small"/></IconButton>
            </Stack>
            {selected.kind === "thread" && selected.thread && <ClaudeThreadGlance thread={selected.thread}/>}
            <Stack direction="row" alignItems="center" gap={1} sx={{mt: 1}}>
                {selected.badge && <BadgeChip kind={selected.badge} text={selected.badgeText}/>}
                <Box sx={{flexGrow: 1}}/>
                <Button
                    variant="contained"
                    size="small"
                    endIcon={<OpenInNew/>}
                    sx={{bgcolor: claudeStyle.ring, "&:hover": {bgcolor: "#C4623F"}}}
                    onClick={() => openNode(selected.url, selected.thread)}
                >
                    Open in Claude
                </Button>
            </Stack>
            {(selected.badge === "stale" || selected.badge === "gone") && <Typography variant="caption" display="block" sx={{mt: 1}}>
                {selected.badge === "stale"
                    ? `No Claude in this project has synced for over ${claudeStaleHours} hours, so this may be out of date.`
                    : "The project's latest sync didn't list this thread."}
            </Typography>}
        </Paper>}
    </Box>;
}
