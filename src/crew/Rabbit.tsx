import React from "react";
import { Eye, ShutEye } from "./CrewSvg";
import { Fidget, useFidget, usePrefersReducedMotion } from "./useFidget";
import { MindMap, MindMapGraphData, MindMapGraphNode } from "../MindMap";
import { parseNote } from "../NoteBody";
import { burrowDemoGraph } from "./burrowDemo";
import "./rabbit.css";

/* The robot rabbit of the rabbit-hole map, and its burrow, drawn from the map itself.
   The surface, with the sky above it, is HOME. Every place is a chamber one layer below its parent,
   and every child is its own hole in the floor of its parent's chamber, so a wide map makes a wide burrow
   and a deep tangent makes a deep one.
   The rabbit's string is tied at HOME and runs down through each chamber on the way to wherever the rabbit
   is: the same path as the app's breadcrumbs. Sending it somewhere else takes it up to the place both share,
   then down another hole; the string reels in and pays out as it goes.
   Done chambers are backfilled, someday ones fade, an active one has a lantern lit.
   carrying: it has picked up a piece of work here and holds it in both front paws (its "tied off"). */

const colW = 36;
const bandH = 30;
const sky = 22;
const pad = 8;
const chamberW = 30;
const chamberH = 15;

type Chamber = {node: MindMapGraphNode, x: number, depth: number, floor: number, parent?: string};
type Burrow = {chambers: Map<string, Chamber>, rootId: string, width: number, height: number, depth: number, signature: string};

const floorOf = (depth: number) => depth === 0 ? sky : sky + depth * bandH - 4;

function dig(graph: MindMapGraphData): Burrow {
    const root = graph.nodes.find(n => n.type === "HOME") ?? graph.nodes[0];
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const chambers = new Map<string, Chamber>();
    let leaf = 0;
    let deepest = 0;
    const visit = (id: string, depth: number, parent: string | undefined, seen: Set<string>): number => {
        deepest = Math.max(deepest, depth);
        const kids = MindMap.childrenOf(graph, id).filter(k => !seen.has(k) && byId.has(k));
        let x: number;
        if (kids.length === 0) {
            x = pad + colW / 2 + 14 + leaf++ * colW;
        } else {
            const xs = kids.map(k => visit(k, depth + 1, id, new Set([...seen, k])));
            x = (xs[0] + xs[xs.length - 1]) / 2;
        }
        chambers.set(id, {node: byId.get(id)!, x, depth, floor: floorOf(depth), parent});
        return x;
    };
    if (root) {
        visit(root.id, 0, undefined, new Set([root.id]));
        //HOME sits at the left of the surface, where the string is tied
        chambers.get(root.id)!.x = pad + 4;
    }
    const width = pad * 2 + 14 + Math.max(leaf, 1) * colW;
    const height = floorOf(deepest) + 10 + pad;
    const signature = [...chambers.values()].map(c => `${c.node.id}@${c.x},${c.depth}`).join("|");
    return {chambers, rootId: root?.id ?? "", width, height, depth: deepest, signature};
}

type Pt = [number, number];

/* Where a child's hole opens in its parent's floor: under the child, but inside the parent's chamber */
function holeX(b: Burrow, child: Chamber): number {
    const parent = child.parent ? b.chambers.get(child.parent) : undefined;
    if (!parent || parent.depth === 0) {
        return child.x;
    }
    return parent.x + Math.max(-chamberW / 2 + 4, Math.min(chamberW / 2 - 4, child.x - parent.x));
}

/* A shaft: a gently winding tunnel from the parent's floor (or the surface) to the top of the child's chamber */
function shaftPath(b: Burrow, c: Chamber): string {
    const parent = b.chambers.get(c.parent!)!;
    const x0 = holeX(b, c), y0 = parent.depth === 0 ? sky + 1.5 : parent.floor;
    const x1 = c.x, y1 = c.floor - chamberH + 3;
    const h = y1 - y0;
    const lean = x1 === x0 ? 4 : 0;
    return `M${x0} ${y0} C${x0 + lean} ${y0 + h / 3} ${x1 - lean} ${y0 + h * 2 / 3} ${x1} ${y1}`;
}

/* A chamber: a wide, low hollow with a flat floor and a lopsided roof, like a dug-out den */
function chamberPath(c: Chamber): string {
    const l = c.x - chamberW / 2, r = c.x + chamberW / 2;
    const f = c.floor + 2, t = c.floor - chamberH + 2;
    return `M${l + 3} ${f} L${r - 2} ${f} Q${r + 1} ${f} ${r} ${f - 4} Q${r - 2} ${t + 1} ${c.x + 4} ${t} Q${c.x - 6} ${t - 0.5} ${l + 2} ${t + 4} Q${l - 1} ${f - 3} ${l + 3} ${f} Z`;
}

/* The chamber ids from HOME down to a place */
function lineage(b: Burrow, id: string): string[] {
    const line: string[] = [];
    let at: string | undefined = id;
    while (at !== undefined && b.chambers.has(at) && !line.includes(at)) {
        line.unshift(at);
        at = b.chambers.get(at)!.parent;
    }
    return line;
}

const restPoint = (c: Chamber): Pt => [c.depth === 0 ? c.x + 12 : c.x, c.floor];

/* The points walked going down from a parent's rest spot into a child's */
function downStep(b: Burrow, child: Chamber): Pt[] {
    const parent = b.chambers.get(child.parent!)!;
    const hx = holeX(b, child);
    return [[hx, parent.floor], [child.x, child.floor]];
}

/* The whole string from HOME to a place's rest spot */
function stringTo(b: Burrow, id: string): Pt[] {
    const line = lineage(b, id);
    const pts: Pt[] = [[b.chambers.get(line[0])!.x, sky]];
    line.slice(1).forEach(cid => pts.push(...downStep(b, b.chambers.get(cid)!)));
    return pts;
}

/* The way from one place to another: up to the place they share, then down. Returns the shared
   ancestor's string and the walk, with how far along the walk the turn at the shared ancestor comes. */
function routeBetween(b: Burrow, from: string, to: string): {shared: Pt[], walk: Pt[], turn: number} {
    const a = lineage(b, from), z = lineage(b, to);
    let i = 0;
    while (i < a.length && i < z.length && a[i] === z[i]) i++;
    const lca = a[i - 1] ?? b.rootId;
    const shared = stringTo(b, lca);
    const up: Pt[] = [restPoint(b.chambers.get(from)!)];
    for (let k = a.length - 1; k >= i; k--) {
        const step = downStep(b, b.chambers.get(a[k])!);
        up.push(step[0]);
    }
    up.push(restPoint(b.chambers.get(lca)!));
    const down: Pt[] = [];
    for (let k = i; k < z.length; k++) {
        down.push(...downStep(b, b.chambers.get(z[k])!));
    }
    down.push(restPoint(b.chambers.get(to)!));
    const walk = [...up, ...down];
    return {shared, walk, turn: lengthOf(up)};
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/* The part of a polyline from its start to distance s, ending at the exact point there */
function cut(pts: Pt[], s: number): Pt[] {
    const out: Pt[] = [pts[0]];
    let left = s;
    for (let i = 1; i < pts.length; i++) {
        const d = dist(pts[i - 1], pts[i]);
        if (left <= d) {
            const t = d === 0 ? 0 : left / d;
            out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
            return out;
        }
        left -= d;
        out.push(pts[i]);
    }
    return out;
}

/* The part of a polyline between distances a and b */
function sub(pts: Pt[], a: number, b: number): Pt[] {
    const upToB = cut(pts, b);
    const upToA = cut(pts, a);
    return [upToA[upToA.length - 1], ...upToB.slice(upToA.length)];
}

const msPerUnit = 12;

type Pose = {x: number, y: number, string: Pt[], moving: boolean, facing: 1 | -1, level: boolean};

/* Walks the rabbit to the place `at`, a frame at a time; when the burrow itself changes shape, it just appears there */
function useWalk(b: Burrow, at: string): Pose {
    const reduced = usePrefersReducedMotion();
    const target = b.chambers.has(at) ? at : b.rootId;
    const [state, setState] = React.useState<{from: string, to: string, s: number, signature: string}>(
        {from: target, to: target, s: 0, signature: b.signature});
    const current = React.useRef(state);
    current.current = state;
    React.useEffect(() => {
        const was = current.current;
        if (reduced || was.signature !== b.signature || !b.chambers.has(was.to)) {
            setState({from: target, to: target, s: 0, signature: b.signature});
            return;
        }
        if (was.to === target && was.from === target) {
            return;
        }
        //start from wherever it last arrived
        const from = was.to;
        const {walk} = routeBetween(b, from, target);
        const total = lengthOf(walk);
        const start = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / Math.max(1, total * msPerUnit));
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            setState({from, to: target, s: eased * total, signature: b.signature});
            if (t < 1) {
                frame = requestAnimationFrame(tick);
            } else {
                setState({from: target, to: target, s: 0, signature: b.signature});
            }
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, b.signature, reduced]);

    const {shared, walk, turn} = routeBetween(b, state.from, state.to);
    const walked = cut(walk, state.s);
    const [x, y] = walked[walked.length - 1];
    const prev = walked.length > 1 ? walked[walked.length - 2] : walked[0];
    //going up, the string runs from the shared place back down to the rabbit; going down, it follows the walk
    const tail = state.s < turn ? sub(walk, state.s, turn).reverse() : sub(walk, turn, state.s);
    const string = [...shared, ...tail];
    const moving = state.from !== state.to;
    const total = lengthOf(walk);
    const ahead = cut(walk, Math.min(total, state.s + 0.5));
    const next = ahead[ahead.length - 1];
    const dx = next[0] - x || x - prev[0];
    return {x, y, string, moving, facing: dx < 0 ? -1 : 1, level: Math.abs(next[1] - y) < 0.01 && Math.abs(prev[1] - y) < 0.01};
}

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 220, weight: 3},
    {name: "is-ear", ms: 700, weight: 2},
    {name: "is-nose", ms: 900, weight: 2},
    {name: "is-thump", ms: 500, weight: 1}
];

const short = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

export function RabbitBurrow({size = 120, fit, graph, at, selected, carrying = false, labels = true, onPick}: {
    size?: number,
    /* fill this box instead of using size, but never shrink below a readable scale (the box scrolls then) */
    fit?: {width: number, height: number, minScale?: number},
    graph: MindMapGraphData,
    /* the place the rabbit is at; HOME when unset */
    at?: string,
    /* the place picked out in the app, ringed */
    selected?: string,
    carrying?: boolean,
    labels?: boolean,
    /* tap a chamber to send the rabbit there */
    onPick?: (id: string) => void
}) {
    const b = React.useMemo(() => dig(graph), [graph]);
    const uid = React.useId().replace(/:/g, "");
    const pose = useWalk(b, at ?? b.rootId);
    const fidget = useFidget(fidgets, [1600, 4500], !pose.moving);
    const visible = new Set(MindMap.visibleGraph(graph, false).nodes.map(n => n.id));
    const hop = pose.moving && pose.level ? -Math.abs(Math.sin(pose.x / 3)) * 4 : 0;
    const d = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const here = b.chambers.get(at ?? b.rootId);
    const label = `Robot rabbit ${here && here.depth > 0 ? `at ${here.node.label}, ${here.depth} hole${here.depth === 1 ? "" : "s"} down` : "at the surface by HOME"}${carrying ? ", carrying a piece of work" : ""}`;
    const chambers = [...b.chambers.values()].filter(c => c.depth > 0);
    const scale = fit
        ? Math.max(Math.min(fit.width / b.width, fit.height / b.height), fit.minScale ?? 0)
        : size / b.height;
    return (
        <svg className={["crew", "crew-rabbit", pose.moving && "is-moving", carrying && "is-carrying", fidget].filter(Boolean).join(" ")}
            viewBox={`0 0 ${b.width} ${b.height}`} width={b.width * scale} height={b.height * scale} role="img" aria-label={label}
            style={fit
                ? {display: "block", margin: "0 auto", flexShrink: 0}
                : {display: "block", margin: "0 auto", maxWidth: "100%", height: "auto"}}>
            <title>{label}</title>
            <rect x={0} y={0} width={b.width} height={sky} className="burrow-sky"/>
            {Array.from({length: Math.max(1, b.depth)}, (_, i) =>
                <rect key={i} x={0} y={sky + i * bandH} width={b.width} height={i === b.depth - 1 ? b.height - sky - i * bandH : bandH}
                    className={`burrow-band burrow-band-${Math.min(i, 4) + 1}`}/>)}
            <rect x={0} y={sky - 1.2} width={b.width} height={2.4} className="burrow-grass"/>
            {/* shafts first, so the chambers sit over their ends */}
            {chambers.map(c => {
                const tucked = !visible.has(c.node.id);
                return <path key={`shaft-${c.node.id}`} d={shaftPath(b, c)}
                    className={tucked ? "burrow-shaft is-filled" : "burrow-shaft"} fill="none"/>;
            })}
            {chambers.map(c => {
                const tucked = !visible.has(c.node.id);
                const status = c.node.status;
                return <g key={c.node.id} data-place={c.node.id} className={["burrow-chamber", selected === c.node.id && "is-selected", tucked && "is-filled", status === "someday" && "is-someday", onPick && "is-pickable"].filter(Boolean).join(" ")}
                    onClick={onPick ? () => onPick(c.node.id) : undefined}>
                    <title>{c.node.label}{status ? ` (${status})` : ""}</title>
                    <path d={chamberPath(c)} className="burrow-tunnel"/>
                    {!tucked && <FloorThings x={c.x} floor={c.floor} body={c.node.body}/>}
                    {status === "active" && !tucked && <g className="burrow-lantern">
                        <line x1={c.x + 8} y1={c.floor - chamberH + 2} x2={c.x + 8} y2={c.floor - chamberH + 6} className="burrow-lantern-cord"/>
                        <rect x={c.x + 6.6} y={c.floor - chamberH + 5.6} width={2.8} height={3.8} rx={0.8} className="burrow-lantern-case"/>
                        <circle cx={c.x + 8} cy={c.floor - chamberH + 7.5} r={1.1} className="burrow-lantern-light"/>
                    </g>}
                    {labels && <text x={c.x} y={c.floor + 7} textAnchor="middle" className="burrow-label">{short(c.node.label, 11)}</text>}
                </g>;
            })}
            {/* light: lit lanterns glow warm, and the rabbit's eyes throw a little cool light, only inside the tunnels */}
            <defs>
                <radialGradient id={`${uid}-warm`}>
                    <stop offset="0%" stopColor="#ffd27a" stopOpacity={0.85}/>
                    <stop offset="60%" stopColor="#ffb347" stopOpacity={0.25}/>
                    <stop offset="100%" stopColor="#ffb347" stopOpacity={0}/>
                </radialGradient>
                <radialGradient id={`${uid}-cool`}>
                    <stop offset="0%" stopColor="#9ff3ff" stopOpacity={0.5}/>
                    <stop offset="100%" stopColor="#9ff3ff" stopOpacity={0}/>
                </radialGradient>
                <mask id={`${uid}-tunnels`} maskUnits="userSpaceOnUse" x={0} y={0} width={b.width} height={b.height}>
                    {chambers.map(c => <path key={c.node.id} d={chamberPath(c)} fill="#fff"/>)}
                    {chambers.map(c => <path key={`m-${c.node.id}`} d={shaftPath(b, c)} stroke="#fff" strokeWidth={6} fill="none"/>)}
                </mask>
            </defs>
            <g mask={`url(#${uid}-tunnels)`} style={{pointerEvents: "none"}}>
                {chambers.filter(c => c.node.status === "active" && visible.has(c.node.id)).map(c =>
                    <circle key={`glow-${c.node.id}`} cx={c.x + 8} cy={c.floor - chamberH + 7.5} r={22} fill={`url(#${uid}-warm)`} className="burrow-glow"/>)}
                {pose.y > sky + 1 && <circle cx={pose.x + pose.facing * 6} cy={pose.y - 11} r={12} fill={`url(#${uid}-cool)`}/>}
            </g>
            {/* surface holes for the places right under HOME */}
            {chambers.filter(c => c.depth === 1).map(c => <g key={`hole-${c.node.id}`}>
                <path d={`M${c.x + 4} ${sky - 0.6} Q${c.x + 8} ${sky - 3.2} ${c.x + 12} ${sky - 0.6} Z`} className="burrow-spoil"/>
                <path d={`M${c.x - 4} ${sky - 0.8} L${c.x + 4} ${sky - 0.8} L${c.x + 3} ${sky + 1.6} L${c.x - 3} ${sky + 1.6} Z`} className="burrow-hole"/>
            </g>)}
            <circle cx={b.chambers.get(b.rootId)?.x ?? pad} cy={sky - 5} r={4.2} className="burrow-home"/>
            <path d={d(pose.string)} className="burrow-string" fill="none"/>
            <g transform={`translate(${pose.x} ${pose.y + hop})`} style={{pointerEvents: "none"}}>
                <g transform={`scale(${pose.facing} 1)`}>
                    <RabbitBody carrying={carrying}/>
                </g>
            </g>
        </svg>
    );
}

const loop = ["sink", "wrench", "garage", "photos", "bikes", "HOME", "sam", "HOME"];

/* The demo burrow on a loop: down a tangent, across, all the way home, and off to another place */
export function RabbitBurrowLoop({size = 100, labels = false}: {size?: number, labels?: boolean}) {
    const reduced = usePrefersReducedMotion();
    const [i, setI] = React.useState(reduced ? 4 : 0);
    React.useEffect(() => {
        if (reduced) {
            return;
        }
        const timer = window.setTimeout(() => setI(n => (n + 1) % loop.length), loop[i] === "HOME" ? 3200 : 2600);
        return () => window.clearTimeout(timer);
    }, [i, reduced]);
    return <RabbitBurrow size={size} graph={burrowDemoGraph} at={loop[i]} labels={labels}/>;
}

/* What a place's note holds, set out on its chamber floor: a photo in a frame, a checklist on a clipboard,
   a page of writing. One of each kind, left of the middle so the rabbit has room. */
function FloorThings({x, floor, body}: {x: number, floor: number, body?: string}) {
    const kinds = new Set(parseNote(body).map(b => b.kind));
    const things: React.ReactNode[] = [];
    let at = x - 10;
    if (kinds.has("image")) {
        things.push(<g key="image" transform={`translate(${at} ${floor})`} className="burrow-thing">
            <title>Photo</title>
            <rect x={-2.4} y={-4.6} width={4.8} height={4} rx={0.4} className="thing-frame"/>
            <path d="M-1.8 -1.1 L-0.6 -2.6 L0.4 -1.6 L1.1 -2.2 L1.8 -1.1 Z" className="thing-picture"/>
        </g>);
        at += 5.6;
    }
    if (kinds.has("check")) {
        things.push(<g key="check" transform={`translate(${at} ${floor})`} className="burrow-thing">
            <title>Checklist</title>
            <rect x={-2} y={-5.2} width={4} height={5} rx={0.4} className="thing-board"/>
            <path d="M-1.3 -3.8 l0.5 0.5 l0.9 -0.9 M-1.3 -1.9 l0.5 0.5 l0.9 -0.9" className="thing-tick"/>
        </g>);
        at += 5;
    }
    if (kinds.has("text")) {
        things.push(<g key="text" transform={`translate(${at} ${floor})`} className="burrow-thing">
            <title>Notes</title>
            <path d="M-2.2 -0.2 L-1.6 -4.4 L2 -4 L1.6 0.2 Z" className="thing-page"/>
            <path d="M-1.2 -3.3 L1.2 -3 M-1.3 -2.3 L1.1 -2 M-1.4 -1.3 L0.6 -1.1" className="thing-lines"/>
        </g>);
    }
    return <>{things}</>;
}

/* A sitting robot rabbit, facing right, its feet at 0,0 */
function RabbitBody({carrying}: {carrying: boolean}) {
    return (
        <g className="part rabbit-all">
            <circle cx={-6.5} cy={-4.5} r={2.4} className="rabbit-tail"/>
            <ellipse cx={-1.5} cy={-5} rx={6.2} ry={5} className="rabbit-metal"/>
            <rect x={-6} y={-1.6} width={6} height={1.6} rx={0.8} className="rabbit-metal-dark"/>
            <g className="part rabbit-ears">
                <rect x={2.1} y={-21} width={2.6} height={9} rx={1.3} className="rabbit-metal" transform="rotate(-18 3.4 -12)"/>
                <rect x={2.7} y={-19.6} width={1.2} height={6} rx={0.6} className="rabbit-ear-inner" transform="rotate(-18 3.4 -12)"/>
                <rect x={4.4} y={-21} width={2.6} height={9} rx={1.3} className="rabbit-metal part rabbit-ear-near" transform="rotate(4 5.7 -12)"/>
            </g>
            <g className="part rabbit-head">
                <rect x={0.5} y={-14} width={9.5} height={7.4} rx={3.4} className="rabbit-metal"/>
                <rect x={4.6} y={-12.6} width={4.6} height={3} rx={1.5} className="rabbit-visor"/>
                <g className="rabbit-eye-open"><Eye x={6.9} y={-11.1} r={0.75}/></g>
                <g className="rabbit-eye-shut"><ShutEye x={6.9} y={-11.1} w={2}/></g>
                <circle cx={10} cy={-9} r={0.8} className="part rabbit-nose"/>
            </g>
            {carrying
                ? <g className="part rabbit-work">
                    <rect x={4} y={-8.5} width={6.5} height={5.5} rx={0.8} className="rabbit-box"/>
                    <path d="M4 -6.5 H10.5" className="rabbit-box-tape"/>
                    <rect x={3} y={-6.2} width={2.4} height={1.6} rx={0.8} className="rabbit-metal"/>
                    <rect x={9.2} y={-6.2} width={2.4} height={1.6} rx={0.8} className="rabbit-metal"/>
                </g>
                : <rect x={3.5} y={-3.2} width={2} height={3.2} rx={1} className="rabbit-metal"/>}
            <rect x={-0.5} y={-1.4} width={7} height={1.6} rx={0.8} className="part rabbit-foot rabbit-metal-dark"/>
        </g>
    );
}
