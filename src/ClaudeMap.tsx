import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ForceGraph2D, { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import {
    Alert, AppBar, Box, Button, Chip, IconButton, List, ListItemButton, ListItemText, ListSubheader,
    Paper, Stack, Tab, Tabs, Toolbar, Typography
} from "@mui/material";
import { ArrowBack, Close, Description, OpenInNew, Visibility, VisibilityOff } from "@mui/icons-material";
import {
    ArtifactFlag, ClaudeArtifact, ClaudeBadgeKind, ClaudeProject, ClaudeThread, artifactFlag, artifactsOnMap,
    badgeFor, badgeOrder, claudeBadges, claudeStaleHours
} from "./ClaudeMapTypes";
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

type Pill = {text: string, bg: string, fg: string, outline?: string};

/* New is loud, Updated is warm, anything else just says how old it is */
export function artifactPill(artifact: ClaudeArtifact, flag: ArtifactFlag): Pill {
    const age = artifact.updatedAt ? `Updated ${ago(artifact.updatedAt)}` : "Artifact";
    return flag === "new" ? {text: "New", bg: "#7C3AED", fg: "#FFFFFF"}
        : flag === "updated" ? {text: age, bg: "#F3E8FF", fg: "#5B21B6", outline: "#7C3AED"}
        : {text: age, bg: "#F3F4F6", fg: "#4B5563"};
}

const byRecent = (a: ClaudeArtifact, b: ClaudeArtifact) =>
    (b.updatedAt ?? b.firstSeenAt).localeCompare(a.updatedAt ?? a.firstSeenAt);

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

function graphOf(projects: ClaudeProject[], hideDone: boolean): {nodes: MapNode[], links: {source: string, target: string}[]} {
    const nodes: MapNode[] = [{id: "claude", kind: "root", label: "Claude"}];
    const links: {source: string, target: string}[] = [];
    for (const p of projects) {
        const summary = projectSummary(p);
        nodes.push({id: p.id, kind: "project", label: projectLabel(p), badge: summary.badge, badgeText: summary.text, url: p.url, project: p});
        links.push({source: "claude", target: p.id});
        for (const t of p.threads) {
            const badge = badgeFor(t, p);
            if (hideDone && badge === "done") {
                continue;
            }
            nodes.push({id: t.id, kind: "thread", label: t.title, badge, url: t.url, project: p, thread: t});
            links.push({source: p.id, target: t.id});
        }
        // artifacts belong to the project, so they stay when the thread that made them is done or hidden
        for (const a of [...p.artifacts].filter(a => a.inLatest).sort(byRecent).slice(0, artifactsOnMap)) {
            nodes.push({id: `artifact:${a.id}`, kind: "artifact", label: a.title, url: a.url, project: p, artifact: a,
                pill: artifactPill(a, artifactFlag(a, p))});
            links.push({source: p.id, target: `artifact:${a.id}`});
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
    if (node.kind === "artifact") {
        // a page with a folded corner, so artifacts never read as threads
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
        // artifacts: lines on the page, then their pill
        if (node.kind === "artifact") {
            ctx.strokeStyle = claudeStyle.ring;
            ctx.lineWidth = 0.5;
            for (const dy of [-1.5, 0, 1.5]) {
                ctx.beginPath();
                ctx.moveTo(x - r * 0.55, y + dy);
                ctx.lineTo(x + r * 0.45, y + dy);
                ctx.stroke();
            }
        }
        const pill = node.pill;
        if (pill) {
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

/* One named tab for every jump, so repeated opens reuse it instead of piling up new ones */
const open = (url?: string) => {
    if (url) {
        const tab = window.open(url, "adhd-assist-claude");
        if (tab) {
            tab.opener = null;
        }
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
function useStableGraph(projects: ClaudeProject[], hideDone: boolean): GraphData {
    const current = React.useRef<{data: GraphData, structure: string}>();
    return React.useMemo(() => {
        const fresh = graphOf(projects, hideDone);
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
    }, [projects, hideDone]);
}

/* A per-device preference, kept in this browser; falls back to the default when storage is off */
function useRemembered(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
    const [value, setValue] = React.useState<boolean>(() => {
        try {
            const stored = window.localStorage.getItem(key);
            return stored === null ? fallback : stored === "true";
        } catch {
            return fallback;
        }
    });
    const set = (v: boolean) => {
        setValue(v);
        try {
            window.localStorage.setItem(key, String(v));
        } catch {
            // private window: the choice lasts for this visit only
        }
    };
    return [value, set];
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
    const [hideDone, setHideDone] = useRemembered("claudeMap.hideDone", false);
    const [selectedId, setSelectedId] = React.useState<string>();
    const [rect, sizeRef] = useElementSize();
    const graphRef = React.useRef<ForceGraphMethods<NodeObject<MapNode>>>();
    const lastClick = React.useRef<{id: string, at: number}>();

    const visible = React.useMemo(() => (projects ?? []).filter(p => showHidden || !p.hidden), [projects, showHidden]);
    const graphData = useStableGraph(visible, hideDone);
    if (demo) {
        // lets the demo's layout be inspected from the console
        (window as unknown as {claudeMapNodes: unknown}).claudeMapNodes = graphData.nodes;
    }
    // forces are set once each time the graph mounts; a data refresh never restarts the whole layout.
    // (The graph's handle is a new object on every render, so it can't tell mounts apart; this can.)
    const fitted = React.useRef(false);
    const showingGraph = view === "map" && rect.width > 0 && visible.length > 0;
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
    const selected = graphData.nodes.find(n => n.id === selectedId);
    const hiddenCount = (projects ?? []).filter(p => p.hidden).length;

    /* Opening an artifact from the map clears its New or Updated flag */
    const openNode = (url: string | undefined, artifact?: ClaudeArtifact) => {
        open(url);
        if (artifact) {
            const openedAt = new Date().toISOString();
            setProjects(ps => ps?.map(p => ({...p, artifacts: p.artifacts.map(a => a.id === artifact.id ? {...a, openedAt} : a)})));
            if (!demo) {
                ServerApi.markClaudeArtifactOpened(artifact.id).catch(() => reload());
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
            </Toolbar>
        </AppBar>

        <Stack direction="row" alignItems="center" gap={1} sx={{px: 2, py: 0.5, bgcolor: "#fff", borderBottom: `1px solid ${claudeStyle.link}`}}>
            <Chip
                size="small"
                variant={hideDone ? "filled" : "outlined"}
                label={hideDone ? "Done threads hidden" : "Hide done threads"}
                onClick={() => setHideDone(!hideDone)}
                sx={hideDone ? {bgcolor: claudeStyle.ring, color: "#fff"} : {borderColor: claudeStyle.ring, color: claudeStyle.ink}}
            />
        </Stack>

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
                        openNode(n.url, n.artifact);
                    }
                }}
                onBackgroundClick={() => setSelectedId(undefined)}
            />}

            {view === "list" && <List dense sx={{bgcolor: "#fff", pb: 10}}>
                {visible.map(p => <React.Fragment key={p.id}>
                    <ListSubheader sx={{display: "flex", alignItems: "center", gap: 1, bgcolor: claudeStyle.fill}}>
                        <Typography component="span" sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink, flexGrow: 1}}>
                            {projectLabel(p)}
                        </Typography>
                        <Typography component="span" variant="caption">synced {ago(p.lastSyncedAt)}</Typography>
                        <IconButton size="small" title="Open this project in Claude" onClick={() => open(p.url)}><OpenInNew fontSize="small"/></IconButton>
                        <IconButton size="small" title={p.hidden ? "Show this project" : "Hide this project"} onClick={() => toggleHidden(p)}>
                            {p.hidden ? <Visibility fontSize="small"/> : <VisibilityOff fontSize="small"/>}
                        </IconButton>
                    </ListSubheader>
                    {p.threads.filter(t => !(hideDone && badgeFor(t, p) === "done"))
                        .sort((a, b) => byUrgency(badgeFor(a, p), badgeFor(b, p)) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
                        .map(t => <ListItemButton key={t.id} onClick={() => open(t.url)} sx={{gap: 1.5, opacity: t.state === "done" ? 0.6 : 1}}>
                            <BadgeChip kind={badgeFor(t, p)}/>
                            <ListItemText
                                primary={t.title}
                                secondary={t.inLatest ? ago(t.lastActivityAt) : `not seen since ${ago(t.lastSeenAt)}`}
                            />
                        </ListItemButton>)}
                    {p.artifacts.filter(a => a.inLatest).sort(byRecent).map(a => {
                        const flag = artifactFlag(a, p);
                        const pill = artifactPill(a, flag);
                        return <ListItemButton key={a.id} onClick={() => openNode(a.url, a)} sx={{gap: 1.5}}>
                            <Description sx={{color: claudeStyle.ring}}/>
                            <ListItemText primary={a.title} secondary={flag ? undefined : pill.text}/>
                            {flag && <Chip size="small" label={pill.text} sx={{bgcolor: pill.bg, color: pill.fg, fontWeight: 600, border: pill.outline ? `1px solid ${pill.outline}` : undefined}}/>}
                        </ListItemButton>;
                    })}
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
            sx={{position: "fixed", left: 16, right: 16, bottom: 16, p: 2, borderTop: `4px solid ${claudeStyle.ring}`, maxWidth: 560, mx: "auto"}}
        >
            <Stack direction="row" alignItems="flex-start" gap={1}>
                <Box sx={{flexGrow: 1, minWidth: 0}}>
                    <Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink}}>
                        {selected.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {(selected.kind === "thread" || selected.kind === "artifact") && selected.project ? `${projectLabel(selected.project)} · ` : ""}
                        {selected.kind === "artifact"
                            ? (selected.pill?.text === "New" ? "new artifact" : `artifact · ${selected.pill?.text.toLowerCase()}`)
                            : selected.kind === "thread"
                            ? (selected.thread!.inLatest ? `last active ${ago(selected.thread!.lastActivityAt)}` : `not seen since ${ago(selected.thread!.lastSeenAt)}`)
                            : `${selected.project!.threads.length} threads · synced ${ago(selected.project!.lastSyncedAt)}`}
                    </Typography>
                </Box>
                <IconButton size="small" aria-label="Close" onClick={() => setSelectedId(undefined)}><Close fontSize="small"/></IconButton>
            </Stack>
            <Stack direction="row" alignItems="center" gap={1} sx={{mt: 1}}>
                {selected.badge && <BadgeChip kind={selected.badge} text={selected.badgeText}/>}
                {selected.pill && <Chip size="small" label={selected.pill.text} sx={{bgcolor: selected.pill.bg, color: selected.pill.fg, fontWeight: 600}}/>}
                <Box sx={{flexGrow: 1}}/>
                <Button
                    variant="contained"
                    size="small"
                    endIcon={<OpenInNew/>}
                    sx={{bgcolor: claudeStyle.ring, "&:hover": {bgcolor: "#C4623F"}}}
                    onClick={() => openNode(selected.url, selected.artifact)}
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
