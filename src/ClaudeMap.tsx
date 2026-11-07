import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ForceGraph2D, { ForceGraphMethods, NodeObject } from "react-force-graph-2d";
import {
    Alert, AppBar, Box, Button, Chip, IconButton, List, ListItemButton, ListItemText, ListSubheader,
    InputAdornment, ListItem, ListItemIcon, Menu, MenuItem, Paper, Stack, Tab, Tabs, TextField, Toolbar, Tooltip, Typography
} from "@mui/material";
import { ArrowBack, Check, CheckBox, CheckBoxOutlineBlank, Close, ExpandLess, ExpandMore, MoreHoriz, OpenInNew, Search, Settings, Visibility, VisibilityOff } from "@mui/icons-material";
import { Description } from "@mui/icons-material";
import {
    ClaudeArtifact, ClaudeBadgeKind, ClaudeProject, ClaudeThread, ClaudeTodo, InterestAnswer, artifactFlag, badgeFor, badgeOrder, byLatestChange, claudeBadges,
    claudeSomedayDays, claudeStaleHours, glanceLine, isNewSince, quietBadges
} from "./ClaudeMapTypes";
import { ClaudeThreadGlance, NewDot, PillChip, PrChip } from "./ClaudeThreadGlance";
import { Pill, artifactLinkProps, artifactPill, pillColor } from "./claudeArtifacts";
import { artifactMatches, matchesSearch } from "./claudeSearch";
import { ServerApi } from "./ServerApi";
import { safetyPollMs, useRing } from "./live";
import { useElementSize } from "./useContainerWidth";
import { demoClaudeMap } from "./claudeMapDemo";
import { ClaudeEventLog } from "./ClaudeEventLog";
import { LiveDot } from "./LiveDot";
import { ProjectForYou, forYou, isQuiet, needsJon, lastMoved, quietDays } from "./ClaudeProjectFocus";
import { MoveItem, YourMoveSections } from "./YourMove";
import { SpotsEditor, WhereLocation, useWhere } from "./WhereYouAre";
import { ArrivalAlerts } from "./ArrivalAlerts";
import { Spot } from "./spots";
import { branchBox, fitIntoBand, View } from "./focusCamera";
import { BalloonIcon, BreakPlace, BreakVeil, readBreak, saveBreak } from "./TakeABreak";
import { ClaudeTokens, useClaudeColors, useColorMode, ColorChoice } from "./theme";

/* The Claude map: Claude keeps it, Jon reads it. One region per Claude project, one node per thread,
   each with a badge for what it needs. Double-click a node (or tap Open) to jump to it in Claude. */

/* The map's colours are theme tokens (palette.claude, in theme.ts) so they follow light and dark */
export const claudeStyle = {
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

function drawNode(node: NodeObject<MapNode>, ctx: CanvasRenderingContext2D, c: ClaudeTokens, selectedId?: string) {
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
        ctx.strokeStyle = c.badges.working.color;
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
    ctx.fillStyle = node.kind === "root" ? c.ring : c.fill;
    ctx.fill();
    ctx.lineWidth = node.id === selectedId ? 2.2 : 1.2;
    ctx.strokeStyle = node.id === selectedId ? c.ink : c.ring;
    if (node.badge && quietBadges.includes(node.badge)) {
        ctx.setLineDash([1.5, 1.5]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // the badge's colour as a dot in the middle, so it reads even zoomed out
    if (node.badge && node.kind !== "root") {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, 2 * Math.PI);
        ctx.fillStyle = c.badges[node.badge].color;
        ctx.fill();
    }

    // something new since Jon last opened it from the map: a small dot on the ring
    if (node.kind === "thread" && node.thread && isNewSince(node.thread)) {
        ctx.beginPath();
        ctx.arc(x + r * 0.75, y - r * 0.75, 1.7, 0, 2 * Math.PI);
        ctx.fillStyle = c.ring;
        ctx.fill();
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = c.halo;
        ctx.stroke();
    }

    // an artifact: lines of writing on the page
    if (node.kind === "artifact") {
        ctx.strokeStyle = node.pill?.text === "New" ? c.artifact : c.ring;
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
        ctx.fillStyle = c.ink;
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
            ctx.fillStyle = pillColor(c, pill.bg);
            ctx.beginPath();
            ctx.roundRect(x - w / 2, top, w, h, h / 2);
            ctx.fill();
            if (pill.outline) {
                ctx.strokeStyle = pillColor(c, pill.outline);
                ctx.lineWidth = 0.3;
                ctx.stroke();
            }
            ctx.fillStyle = pillColor(c, pill.fg);
            ctx.textBaseline = "middle";
            ctx.fillText(pill.text, x, top + h / 2);
        }
        // badge pill under the label
        if (node.badge) {
            const badge = c.badges[node.badge];
            const text = node.badgeText ?? claudeBadges[node.badge].label;
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
    const badge = useClaudeColors().badges[kind];
    return <Chip
        size="small"
        label={text ?? claudeBadges[kind].label}
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
        <ListSubheader disableSticky sx={{lineHeight: "28px", bgcolor: "claude.surface", color: "claude.artifactText", fontWeight: 600}}>
            Artifacts ({artifacts.length})
        </ListSubheader>
        {listed.map(a => {
            const flag = artifactFlag(a, project);
            const pill = artifactPill(a, flag);
            return <ListItemButton key={a.id} {...artifactLinkProps(a.url)} onClick={() => onOpen(a)} sx={{gap: 1.5, pl: 3}}>
                <Description sx={{color: flag ? "claude.artifact" : "claude.ring"}}/>
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
            <Button size="small" sx={{color: "claude.artifactText"}} onClick={() => onAll(!all)}>
                {all ? "Show fewer artifacts" : `Show all ${artifacts.length} artifacts`}
            </Button>
        </Box>}
    </>;
}

/* Your move: what each project needs from Jon, and nothing he's done with. A project's asks and to-dos come first, then
   its stuck threads; the threads still working fold into one line. Resolved threads are left out (a search finds them).
   Projects that have gone quiet fold away at the bottom by themselves, and Hide sits in each project's ⋯ menu. */
type WhereProps = {
    spots: Spot[], here?: Spot, hereUntil?: string,
    onPick: (spot: Spot | undefined) => void, onEditSpots: () => void, onWhere: (item: MoveItem, where: string) => void,
    location: WhereLocation,
    onArrivalAlerts: () => void
};

function YourMoveList({projects, searching, openIn, onOpenThread, onOpenArtifact, onToggleHidden, onInterest, onSetAside, hiddenCount, showHidden, onShowHidden, where}: {
    where: WhereProps,
    onInterest: (todo: ClaudeTodo, answer: InterestAnswer | undefined) => void,
    onSetAside: (t: ClaudeThread, until: string | null) => void,
    projects: ClaudeProject[],
    searching: boolean,
    openIn: OpenIn,
    onOpenThread: (t?: ClaudeThread) => void,
    onOpenArtifact: (a: ClaudeArtifact) => void,
    onToggleHidden: (p: ClaudeProject) => void,
    hiddenCount: number,
    showHidden: boolean,
    onShowHidden: (show: boolean) => void
}) {
    const now = Date.now();
    const [unfolded, setUnfolded] = React.useState<Set<string>>(new Set());
    const [quietOpen, setQuietOpen] = React.useState(false);
    const [allArtifactsOf, setAllArtifactsOf] = React.useState<Set<string>>(new Set());
    const [menu, setMenu] = React.useState<{anchor: HTMLElement, project: ClaudeProject}>();
    const toggle = (set: Set<string>, id: string) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    };
    const needs = (p: ClaudeProject) => needsJon(forYou(p, now)).length + p.threads.filter(t => badgeFor(t, p, now) === "failed").length;
    // the project holding the highest-Leverage thing you can do now comes first
    const top = (p: ClaudeProject) => Math.max(0, ...forYou(p, now).filter(i => i.ready).map(i => i.leverage));
    const ordered = [...projects].sort((a, b) => Number(needs(b) > 0) - Number(needs(a) > 0) || top(b) - top(a) || lastMoved(b).localeCompare(lastMoved(a)));
    const active = searching ? ordered : ordered.filter(p => !isQuiet(p, now));
    const quiet = searching ? [] : ordered.filter(p => isQuiet(p, now));

    const threadRow = (t: ClaudeThread, p: ClaudeProject, indent = false) => <ListItemButton
        key={t.id} {...linkProps(t.url, openIn)} onClick={() => onOpenThread(t)} sx={{gap: 1.5, pl: indent ? 4 : 2}}
    >
        <BadgeChip kind={badgeFor(t, p, now)}/>
        <ListItemText
            primary={t.title}
            secondary={[glanceLine(t), t.inLatest ? ago(t.lastActivityAt) : `not seen since ${ago(t.lastSeenAt)}`].filter(Boolean).join(" · ")}
            secondaryTypographyProps={{noWrap: true}}
            sx={{minWidth: 0}}
        />
        {t.prs?.filter(pr => pr.state === "open" || pr.state === "draft").map(pr => <PrChip key={`${pr.repo}#${pr.number}`} pr={pr}/>)}
        <NewDot thread={t}/>
    </ListItemButton>;

    const projectBlock = (p: ClaudeProject) => {
        const asking = new Set(forYou(p, now).map(i => i.thread.id));
        const stuck = p.threads.filter(t => badgeFor(t, p, now) === "failed");
        const rest = p.threads
            .filter(t => !asking.has(t.id) && !stuck.includes(t) && (searching || t.state !== "done"))
            .sort((a, b) => byUrgency(badgeFor(a, p, now), badgeFor(b, p, now)) || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
        const open = searching || unfolded.has(p.id);
        const artifacts = p.artifacts?.length ?? 0;
        // one line for the folded threads, counted by badge in badge order: "2 working · 1 not heard lately"
        const counts = new Map<ClaudeBadgeKind, number>();
        rest.forEach(t => counts.set(badgeFor(t, p, now), (counts.get(badgeFor(t, p, now)) ?? 0) + 1));
        const foldWords = [
            ...[...counts].map(([kind, n]) => `${n} ${claudeBadges[kind].label.toLowerCase()}`),
            artifacts > 0 && `${artifacts} artifact${artifacts === 1 ? "" : "s"}`
        ].filter(Boolean).join(" · ");
        return <React.Fragment key={p.id}>
            <ListSubheader sx={{display: "flex", alignItems: "center", gap: 1, bgcolor: "claude.fill"}}>
                <Typography component="span" sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: "claude.ink", flexGrow: 1}}>
                    {projectLabel(p)}
                </Typography>
                <Typography component="span" variant="caption">synced {ago(p.lastSyncedAt)}</Typography>
                <IconButton size="small" title="Open this project in Claude" {...linkProps(p.url, openIn)}><OpenInNew fontSize="small"/></IconButton>
                <IconButton size="small" aria-label={`More for ${projectLabel(p)}`} onClick={e => setMenu({anchor: e.currentTarget, project: p})}>
                    <MoreHoriz fontSize="small"/>
                </IconButton>
            </ListSubheader>
            {stuck.map(t => threadRow(t, p))}
            {foldWords && !searching && <ListItemButton onClick={() => setUnfolded(u => toggle(u, p.id))} sx={{py: 0.25}}>
                <ListItemIcon sx={{minWidth: 28}}>{open ? <ExpandLess fontSize="small"/> : <ExpandMore fontSize="small"/>}</ListItemIcon>
                <ListItemText secondary={foldWords}/>
            </ListItemButton>}
            {open && rest.map(t => threadRow(t, p, !searching))}
            {open && artifacts > 0 && <ProjectArtifacts
                project={p}
                all={searching || allArtifactsOf.has(p.id)}
                onAll={() => setAllArtifactsOf(a => toggle(a, p.id))}
                onOpen={onOpenArtifact}
            />}
        </React.Fragment>;
    };

    return <List dense data-testid="your-move" sx={{bgcolor: "claude.surface", pb: "45dvh"}}>
        <YourMoveSections
            projects={active}
            threadLinkProps={t => linkProps(t.url, openIn)}
            openThread={t => {
                const link = linkProps(t.url, openIn) as {href?: string, target?: string};
                if (link.href) window.open(link.href, link.target ?? "_self", "noopener");
            }}
            onOpenThread={onOpenThread}
            onInterest={onInterest}
            onSetAside={onSetAside}
            projectName={projectLabel}
            {...where}
        />
        <ListSubheader sx={{bgcolor: "claude.surface", lineHeight: "32px", fontWeight: 600, color: "claude.ink", mt: 2, borderTop: 1, borderColor: "claude.link"}}>
            Projects
        </ListSubheader>
        {active.map(projectBlock)}
        {quiet.length > 0 && <>
            <ListItemButton onClick={() => setQuietOpen(o => !o)} sx={{bgcolor: "claude.fill", mt: 1}}>
                <ListItemIcon sx={{minWidth: 28}}>{quietOpen ? <ExpandLess fontSize="small"/> : <ExpandMore fontSize="small"/>}</ListItemIcon>
                <ListItemText
                    primary={`Quiet for ${quietDays} days: ${quiet.map(projectLabel).join(", ")}`}
                    secondary="Nothing in these waits on you. They come back up when a thread moves."
                />
            </ListItemButton>
            {quietOpen && quiet.map(projectBlock)}
        </>}
        {hiddenCount > 0 && <Box sx={{p: 2}}>
            <Button size="small" onClick={() => onShowHidden(!showHidden)}>
                {showHidden ? "Leave out hidden projects" : `Show ${hiddenCount} hidden project${hiddenCount === 1 ? "" : "s"}`}
            </Button>
        </Box>}
        <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(undefined)}>
            {menu && <MenuItem onClick={() => {
                onToggleHidden(menu.project);
                setMenu(undefined);
            }}>
                <ListItemIcon>{menu.project.hidden ? <Visibility fontSize="small"/> : <VisibilityOff fontSize="small"/>}</ListItemIcon>
                {menu.project.hidden ? "Show this project again" : "Hide this project"}
            </MenuItem>}
        </Menu>
    </List>;
}

const colorChoiceLabels: Record<ColorChoice, string> = {
    system: "Match this device",
    light: "Light",
    dark: "Dark"
};

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
    const where = useWhere(demo);
    const [editingSpots, setEditingSpots] = React.useState(false);
    const [alertsOpen, setAlertsOpen] = React.useState(false);
    const colors = useClaudeColors();
    const colorMode = useColorMode();
    /* a break Jon took and didn't come back from yet, even if the app closed meanwhile */
    const [onBreak, setOnBreak] = React.useState<BreakPlace | undefined>(readBreak);
    const [view, setView] = React.useState<"map" | "list" | "events">(() =>
        onBreak && ["map", "list", "events"].includes(onBreak.tab) ? onBreak.tab as "map" | "list" | "events"
        // an arrival notification opens straight to Your move
        : params.get("view") === "list" ? "list" : "map");
    const [showHidden, setShowHidden] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<string | undefined>(() => onBreak?.selectedId);
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

    /* Clicking a project: the camera glides so the project's branch fits between the top of the map and the top of its
       card. Only the camera moves; no node does. Closing the card glides back to the view Jon had before. */
    const cardRef = React.useRef<HTMLDivElement>(null);
    const [cardHeight, setCardHeight] = React.useState(0);
    const savedView = React.useRef<View>();
    const lastTickAt = React.useRef(0);
    const focusedProjectId = selected?.kind === "project" && view === "map" ? selected.id : undefined;
    // the card mounts when its node's data arrives, which can be after the selection (a card reopened on load)
    const cardShown = !!selected;
    React.useEffect(() => {
        const card = cardRef.current;
        if (!card) {
            setCardHeight(0);
            return;
        }
        const observer = new ResizeObserver(() => setCardHeight(card.getBoundingClientRect().height));
        observer.observe(card);
        return () => observer.disconnect();
    }, [selectedId, view, cardShown]);
    /* bumped when the first layout settles, so a card reopened on load (after a break) can fit its branch then */
    const [settled, setSettled] = React.useState(0);
    React.useEffect(() => {
        const graph = graphRef.current;
        const box = (sizeRef as React.RefObject<HTMLDivElement>).current;
        const card = cardRef.current;
        if (!graph || !box) {
            return;
        }
        if (!focusedProjectId) {
            // card closed (or something else selected): back to where Jon was
            if (savedView.current && !selectedId) {
                const {k, x, y} = savedView.current;
                graph.centerAt(x, y, 400);
                graph.zoom(k, 400);
            }
            if (!selectedId) {
                savedView.current = undefined;
            }
            return;
        }
        // the first layout is still finding its shape: wait for it rather than freeze it half-made
        if (!card || cardHeight === 0 || !fitted.current) {
            return;
        }
        const branch = graphData.nodes.filter(n => n.id === focusedProjectId || (n.kind !== "project" && n.kind !== "root" && n.project?.id === focusedProjectId));
        const bounds = branchBox(branch);
        if (!bounds) {
            return;
        }
        if (!savedView.current) {
            const centre = graph.centerAt() as unknown as {x: number, y: number};
            savedView.current = {k: graph.zoom() as unknown as number, x: centre.x, y: centre.y};
        }
        // still settling: hold every node where it is, so the fit stays true (the engine lets go when it stops)
        if (Date.now() - lastTickAt.current < 200) {
            graphData.nodes.forEach(n => {
                n.fx = n.x;
                n.fy = n.y;
            });
        }
        const boxRect = box.getBoundingClientRect();
        const target = fitIntoBand(bounds, {width: boxRect.width, height: boxRect.height},
            {top: 0, bottom: card.getBoundingClientRect().top - boxRect.top});
        graph.centerAt(target.x, target.y, 400);
        graph.zoom(target.k, 400);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusedProjectId, selectedId, cardHeight, settled]);
    const hiddenCount = (projects ?? []).filter(p => p.hidden).length;

    const takeBreak = () => {
        const place: BreakPlace = {
            tab: view,
            selectedId: view === "map" ? selectedId : undefined
        };
        saveBreak(place);
        setOnBreak(place);
    };
    const backFromBreak = () => {
        saveBreak(undefined);
        setOnBreak(undefined);
    };

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

    /* Jon's thumb on Claude's interest guess for a to-do: shown at once, kept on the server for later guesses to learn */
    const answerInterest = (todo: ClaudeTodo, answer: InterestAnswer | undefined) => {
        setProjects(ps => ps?.map(p => ({...p, threads: p.threads.map(t => !t.todos?.some(x => x.id === todo.id) ? t : {
            ...t, todos: t.todos.map(x => x.id !== todo.id || !x.interest ? x : {...x, interest: {...x.interest, answer}})
        })})));
        if (!demo) {
            ServerApi.setChecklistInterest(todo.id, answer).catch(() => reload());
        }
    };

    const setAside = (thread: ClaudeThread, until: string | null) => {
        setProjects(ps => ps?.map(p => ({...p, threads: p.threads.map(t => t.id !== thread.id ? t
            : {...t, setAsideUntil: until ?? undefined, setAsideBy: until ? "jon" as const : undefined})})));
        if (!demo) {
            ServerApi.setClaudeThreadAside(thread.id, until).catch(() => reload());
        }
    };

    /* Jon corrects where a to-do or an ask can be done: shown at once, and it sticks over Claude's guess */
    const setItemWhere = (item: MoveItem, where: string) => {
        setProjects(ps => ps?.map(p => ({...p, threads: p.threads.map(t => {
            if (item.todo) {
                return !t.todos?.some(x => x.id === item.todo!.id) ? t
                    : {...t, todos: t.todos.map(x => x.id === item.todo!.id ? {...x, where, whereBy: "jon" as const} : x)};
            }
            return t.id !== item.thread.id || !t.card?.ask ? t : {...t, card: {...t.card, ask: {...t.card.ask, where, whereBy: "jon" as const}}};
        })})));
        if (!demo) {
            (item.todo ? ServerApi.setTodoWhere(item.todo.id, where) : ServerApi.setAskWhere(item.thread.id, where)).catch(() => reload());
        }
    };

    const toggleHidden = (project: ClaudeProject) => {
        const hidden = !project.hidden;
        setProjects(ps => ps?.map(p => p.id === project.id ? {...p, hidden} : p));
        if (!demo) {
            ServerApi.setClaudeProjectHidden(project.id, hidden).catch(() => reload());
        }
    };

    return <Box sx={{display: "flex", flexDirection: "column", height: "100dvh", bgcolor: "claude.fill"}}>
        <AppBar position="static" elevation={0} sx={{bgcolor: "claude.bar", color: "claude.barText", borderBottom: theme => theme.palette.mode === "dark" ? `1px solid ${theme.palette.divider}` : "none"}}>
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
                    TabIndicatorProps={{style: {backgroundColor: colors.barIndicator}}}
                    // three tabs fit a phone only without the default minimum width
                    sx={{"& .MuiTab-root": {minWidth: {xs: 0, sm: 90}, px: {xs: 1.25, sm: 2}}}}
                >
                    <Tab value="map" label="Map"/>
                    <Tab value="list" label="Your move"/>
                    <Tab value="events" label="Log"/>
                </Tabs>
                <LiveDot/>
                <Tooltip title="Take a break">
                    <IconButton color="inherit" aria-label="Take a break" onClick={takeBreak}>
                        <BalloonIcon/>
                    </IconButton>
                </Tooltip>
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
                    <ListSubheader sx={{lineHeight: "32px"}}>Light or dark</ListSubheader>
                    {(Object.keys(colorChoiceLabels) as ColorChoice[]).map(value => <MenuItem
                        key={value}
                        selected={colorMode.choice === value}
                        onClick={() => colorMode.setChoice(value)}
                    >
                        <ListItemIcon>{colorMode.choice === value ? <Check fontSize="small"/> : null}</ListItemIcon>
                        {colorChoiceLabels[value]}
                    </MenuItem>)}
                </Menu>
            </Toolbar>
        </AppBar>

        {(projects?.length ?? 0) > 0 && <Stack direction="row" alignItems="center" gap={1.5} sx={{px: 2, py: 1, bgcolor: "claude.surface", borderBottom: 1, borderColor: "claude.link"}}>
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

        {projects && projects.length === 0 && <Paper elevation={0} sx={{m: 2, p: 2, bgcolor: "claude.surface"}}>
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
                backgroundColor={colors.fill}
                linkColor={() => colors.link}
                linkWidth={1.5}
                nodeRelSize={6}
                nodeVal={n => radiusOf(n.kind) ** 2 / 36}
                nodeLabel={n => n.kind === "thread" || n.kind === "artifact" ? n.label : ""}
                nodeCanvasObject={(n, ctx) => drawNode(n, ctx, colors, selectedId)}
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
                    lastTickAt.current = Date.now();
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
                    // (with a project's card already open, fit its branch instead)
                    if (!fitted.current) {
                        fitted.current = true;
                        if (focusedProjectId) {
                            setSettled(n => n + 1);
                        } else {
                            graphRef.current?.zoomToFit(400, 40);
                        }
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

            {view === "list" && <YourMoveList
                projects={shown}
                searching={searching}
                openIn={openIn}
                onOpenThread={markOpened}
                onOpenArtifact={markArtifactOpened}
                onToggleHidden={toggleHidden}
                onInterest={answerInterest}
                onSetAside={setAside}
                where={{
                    spots: where.spots, here: where.here, hereUntil: where.until, onPick: where.pick,
                    onEditSpots: () => setEditingSpots(true), onWhere: setItemWhere, location: where.location,
                    onArrivalAlerts: () => setAlertsOpen(true)
                }}
                hiddenCount={hiddenCount}
                showHidden={showHidden}
                onShowHidden={setShowHidden}
            />}
        </Box>

        {view === "map" && showingGraph && !searching && hiddenDone.length > 0 && !doneListOpen && !selected && <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOff/>}
            onClick={() => setDoneListOpen(true)}
            sx={{
                position: "fixed", left: 16, bottom: 16, bgcolor: "claude.surface", color: "claude.ink", borderColor: "claude.link",
                "&:hover": {bgcolor: "claude.surface", borderColor: "claude.ring"}
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
                    <Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: "claude.ink"}}>
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
            ref={cardRef}
            elevation={6}
            sx={{
                position: "fixed", left: 16, right: 16, bottom: 16, p: 2, borderTop: 4, borderTopColor: "claude.ring", maxWidth: 560, mx: "auto",
                maxHeight: "70dvh", overflowY: "auto"
            }}
        >
            <Stack direction="row" alignItems="flex-start" gap={1}>
                <Box sx={{flexGrow: 1, minWidth: 0}}>
                    <Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: "claude.ink"}}>
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
            {selected.kind === "project" && selected.project && <ProjectForYou
                key={selected.id}
                project={selected.project}
                threadLinkProps={t => linkProps(t.url, openIn)}
                onOpenThread={markOpened}
                onInterest={answerInterest}
            />}
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
                    sx={{color: "claude.ink"}}
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
                    sx={{bgcolor: "claude.ring", "&:hover": {bgcolor: "claude.ringHover"}}}
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

        {onBreak && <BreakVeil onBack={backFromBreak}/>}
        <SpotsEditor open={editingSpots} spots={where.spots} onClose={() => setEditingSpots(false)} onSave={where.save} location={where.location}/>
        <ArrivalAlerts open={alertsOpen} onClose={() => setAlertsOpen(false)} spots={where.spots} demo={demo}/>
    </Box>;
}
