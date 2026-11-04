import React from "react";
import { MindMap, MindMapGraphData } from "../MindMap";
import { Head } from "./Jon";
import { Dog } from "./Dog";
import { Squirrel } from "./Squirrel";
import { Spider } from "./Spider";
import { Sloth } from "./Sloth";
import { usePrefersReducedMotion } from "./useFidget";
import "./crew.css";
import "./balloon.css";

/* Balloon-head's day, drawn from the map. HOME and the places right under it stand on the ground as waypoints
   in a ring, so the last one walks on to the first. Your feet stay on the ground at the waypoint you are working
   under; your head floats up one level for each step deeper into it. Every level above the ground is a cloud: the
   ones you passed sit on the string below you, the place you're at glows just over your head and lights the scene,
   and the places under it float above as clouds to go to next. The rabbit's holes turned upside down. The higher
   you go, the narrower the light: everything outside the beam from your feet to the lit cloud dims. */

const short = (s: string, n: number) => s.length > n ? `${s.slice(0, n - 1)}…` : s;

/* HOME, then the places right under it, in name order. The ring the feet walk. */
function ringOf(graph: MindMapGraphData): string[] {
    const home = graph.nodes.find(n => n.type === "HOME");
    if (!home) {
        return [];
    }
    const label = (id: string) => graph.nodes.find(n => n.id === id)?.label ?? "";
    const roots = MindMap.childrenOf(graph, home.id).sort((a, b) => label(a).localeCompare(label(b), undefined, {sensitivity: "base"}));
    return [home.id, ...roots];
}

/* HOME down to a place, through its parents */
function lineageOf(graph: MindMapGraphData, id: string): string[] {
    const line: string[] = [];
    let at: string | undefined = id;
    while (at !== undefined && !line.includes(at) && graph.nodes.some(n => n.id === at)) {
        line.unshift(at);
        at = MindMap.parentOf(graph, at);
    }
    return line;
}

/* the deepest a place's subtree goes, counting the place as 0 */
function depthBelow(graph: MindMapGraphData, id: string, seen = new Set<string>()): number {
    if (seen.has(id)) {
        return 0;
    }
    seen.add(id);
    const kids = MindMap.childrenOf(graph, id);
    return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(k => depthBelow(graph, k, seen)));
}

/* eases a number toward its target */
function useTween(target: number, ms = 650): number {
    const reduced = usePrefersReducedMotion();
    const [value, setValue] = React.useState(target);
    const from = React.useRef(target);
    const current = React.useRef(target);
    React.useEffect(() => {
        if (reduced) {
            current.current = target;
            setValue(target);
            return;
        }
        from.current = current.current;
        const start = performance.now();
        let frame = 0;
        const step = (t: number) => {
            const k = Math.min(1, (t - start) / ms);
            const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            current.current = from.current + (target - from.current) * eased;
            setValue(current.current);
            if (k < 1) {
                frame = requestAnimationFrame(step);
            }
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [target, ms, reduced]);
    return value;
}

/* where on the ring you are, as a number that keeps counting past the ends, so walking from the last waypoint
   to the first steps forward one place instead of running back along the whole ring */
function useRingPosition(index: number, length: number): number {
    const last = React.useRef(index);
    const target = React.useMemo(() => {
        if (length === 0) {
            return 0;
        }
        const was = last.current;
        let delta = ((index - was) % length + length) % length;
        if (delta > length / 2) {
            delta -= length;
        }
        last.current = was + delta;
        return last.current;
    }, [index, length]);
    return useTween(target);
}

/* the signed distance from the ring position to a waypoint, the short way round */
const ringOffset = (i: number, pos: number, length: number) => {
    let d = ((i - pos) % length + length) % length;
    if (d > length / 2) {
        d -= length;
    }
    return d;
};

export function BalloonTrail({width, height, floor = 0, graph, at, selected, carrying = false, onPick}: {
    width: number,
    height: number,
    /* room kept clear at the bottom, for buttons floating there */
    floor?: number,
    graph: MindMapGraphData,
    /* where you stand; HOME when unset */
    at?: string,
    /* the place picked out in the app, ringed */
    selected?: string,
    /* tied off: both hands on the work */
    carrying?: boolean,
    onPick?: (id: string) => void
}) {
    const ring = React.useMemo(() => ringOf(graph), [graph]);
    const home = ring[0];
    const here = at && graph.nodes.some(n => n.id === at) ? at : home;
    const line = React.useMemo(() => lineageOf(graph, here), [graph, here]);
    const waypoint = line[1] ?? home;
    const ringIndex = Math.max(0, ring.indexOf(waypoint));
    const pos = useRingPosition(ringIndex, ring.length);
    const visible = React.useMemo(() => new Set(MindMap.visibleGraph(graph, false).nodes.map(n => n.id)), [graph]);
    const node = (id: string) => graph.nodes.find(n => n.id === id);
    const label = (id: string) => node(id)?.type === "HOME" ? "HOME" : node(id)?.label ?? "";

    //the ground, and how far apart the waypoints stand
    const groundY = height - floor - 34;
    const spacing = Math.max(210, Math.min(240, width / 4.5));
    const cx = width / 2 - 50;
    const reach = Math.max(1.2, (width / 2 - 20) / spacing + 0.3);

    //you: feet by the waypoint, head up one level per step deeper than it
    const s = 1.5;
    const youX = cx + 100;
    const levels = Math.max(0, line.length - 2);
    const tallest = Math.max(2, levels + 1, waypoint === home ? 0 : depthBelow(graph, waypoint));
    const headBase = groundY - 74;
    const levelH = Math.max(106, Math.min(130, (headBase - 60) / tallest));
    const hand: [number, number] = carrying ? [youX + (24.5 - 18) * s, groundY - (92 - 62.5) * s] : [youX + (31 - 18) * s, groundY - (92 - 50) * s];
    const restX = youX + (carrying ? 10 : 22);

    /* The clouds over a waypoint keep their places. Each level's clouds spread out over the cloud they belong to
       (the first level over your head on the ground), so picking one never moves the others; dimming hides them. */
    const overHead = 40;
    const cloudY = (level: number) => headBase - level * levelH - overHead;
    const layout = React.useMemo(() => {
        type Placed = {id: string, x: number, y: number, w: number, level: number, parent: string};
        const placed = new Map<string, Placed>();
        const rows: Placed[][] = [];
        if (waypoint === home) {
            return {placed, rows};
        }
        let parent = waypoint;
        let parentX = restX;
        for (let level = 1; level <= levels + 1; level++) {
            const kids = MindMap.childrenOf(graph, parent).filter(id => visible.has(id) || line.includes(id));
            if (kids.length === 0) {
                break;
            }
            const gap = Math.min(176, (width - 24) / kids.length);
            const w = Math.max(70, Math.min(160, gap - 10));
            const total = gap * kids.length;
            const left = Math.min(Math.max(12, parentX - total / 2), Math.max(12, width - 12 - total));
            const stagger = gap < 150 ? 16 : 0;
            const row = kids.map((id, i) => ({id, level, parent, w, x: left + gap * (i + 0.5), y: cloudY(level) - (i % 2) * stagger}));
            row.forEach(c => placed.set(c.id, c));
            rows.push(row);
            const next = line[level + 1];
            const onPath = next ? placed.get(next) : undefined;
            if (!onPath) {
                break;
            }
            parent = next;
            parentX = onPath.x;
        }
        return {placed, rows};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graph, waypoint, home, levels, line.join("/"), visible, width, restX, levelH, headBase]);

    //the balloon drifts up and over to sit just under the cloud you're at, which lights as it arrives
    const litPlace = levels > 0 ? layout.placed.get(here) : undefined;
    const headX = useTween(litPlace ? litPlace.x : restX, 800);
    const headY = useTween(litPlace ? litPlace.y + overHead : headBase, 800);
    const altitude = (headBase - headY) / levelH;
    //when the clouds above you would leave the top of the sky, the view rises with you and the ground slips down
    const cam = useTween(Math.max(0, 40 - cloudY(levels + 1) - (layout.rows[levels]?.length ? 0 : levelH)), 800);
    const arrival = litPlace ? Math.max(0, Math.min(1, 1 - Math.hypot(headX - litPlace.x, headY - litPlace.y - overHead) / 70)) : 0;

    /* the string hooks a metal pin through the middle of each cloud you passed on the way up, so the way back
       down shows, the way the rabbit's string runs back through every chamber */
    const pins = line.slice(2, -1).map(id => layout.placed.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
        .map(c => ({id: c.id, x: c.x, y: c.y + pinDrop}));
    const string = threadThrough([hand, ...pins.map(p => [p.x, p.y] as [number, number]), [headX, headY + 13]]);
    const onPath = new Set(line);
    const all = layout.rows.flat();
    const sightings = all.filter(c => c.parent === here);
    const shaded = all.filter(c => !onPath.has(c.id) && c.parent !== here);
    const passedClouds = all.filter(c => onPath.has(c.id) && c.id !== here);

    //the narrower your focus, the darker everything outside the light from your feet, the clouds you passed, the lit cloud and what's above it
    const dim = Math.min(0.46, 0.26 + altitude * 0.06) * Math.min(1, altitude);
    const beamTop = Math.max(22, 70 - altitude * 12);
    const beamFoot = spacing * 0.9;
    const uid = React.useId().replace(/:/g, "");
    const pick = (id: string) => (e: React.MouseEvent) => {
        e.stopPropagation();
        onPick?.(id);
    };
    const cloud = (c: {id: string, x: number, y: number, w: number}, kind: "passed" | "lit" | "sighting" | "shaded") => {
        const tip = kind === "lit" ? label(c.id) : kind === "passed" ? `Come back down to ${label(c.id)}` : `Float up to ${label(c.id)}`;
        const h = 50;
        const per = Math.max(8, Math.floor((c.w - 14) / 6.1));
        const words = wrap(label(c.id), per, 2);
        const lit = kind === "lit" && arrival > 0.5;
        const top = kind === "passed" ? -12 : -6;
        return (
            <g key={c.id} className={["trail-cloud-place", `is-${lit ? "lit" : kind === "lit" ? "sighting" : kind}`, onPick && "is-pickable", c.id === selected && "is-selected"].filter(Boolean).join(" ")}
                transform={`translate(${c.x} ${c.y})`} onClick={onPick ? pick(c.id) : undefined} data-place={c.id}>
                <title>{tip}</title>
                {/* drawn twice, outline then fill, so the bumps read as one cloud */}
                {["trail-cloud-edge", "trail-cloud"].map(cls =>
                    <g key={cls} className={cls}>
                        <rect x={-c.w / 2} y={-h / 2 + 12} width={c.w} height={h - 12} rx={(h - 12) / 2}/>
                        <circle cx={-c.w * 0.22} cy={-h * 0.02} r={h * 0.34}/>
                        <circle cx={c.w * 0.04} cy={-h * 0.14} r={h * 0.42}/>
                        <circle cx={c.w * 0.27} cy={h * 0.04} r={h * 0.3}/>
                    </g>)}
                <text x={0} y={words.length === 1 ? top + 6 : top} textAnchor="middle" className="trail-cloud-text">
                    {words.map((w, i) => <tspan key={i} x={0} dy={i === 0 ? 0 : 13}>{w}</tspan>)}
                </text>
            </g>
        );
    };
    const step = (by: number) => ring[((ringIndex + by) % ring.length + ring.length) % ring.length];
    const offsets = ring.map((id, i) => ({id, off: ringOffset(i, pos, ring.length)})).filter(w => Math.abs(w.off) <= reach);
    const hidden = ring.length - offsets.filter(w => Math.abs(w.off) <= reach - 0.4).length;
    const ariaLabel = here === home
        ? "Balloon-head at HOME, feet on the ground"
        : `Balloon-head on the ground at ${label(waypoint)}${levels > 0 ? `, head ${levels} level${levels === 1 ? "" : "s"} up at ${label(here)}` : ""}${carrying ? ", holding the work" : ""}`;
    const enso = 130;

    return (
        <svg className="crew balloon-trail" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}
            style={{display: "block"}}>
            <title>{ariaLabel}</title>
            <defs>
                <radialGradient id={`${uid}-glow`}>
                    <stop offset="0" className="trail-glow-core"/>
                    <stop offset="0.45" className="trail-glow-mid"/>
                    <stop offset="1" className="trail-glow-edge"/>
                </radialGradient>
                <linearGradient id={`${uid}-sky`} x1={0} y1={0} x2={0} y2={1}>
                    <stop offset="0" className="trail-sky-high"/>
                    <stop offset="1" className="trail-sky-low"/>
                </linearGradient>
                <mask id={`${uid}-beam`} maskUnits="userSpaceOnUse" x={0} y={-cam} width={width} height={height}>
                    <rect x={0} y={-cam} width={width} height={height} fill="white"/>
                    <path d={`M${youX - beamFoot} ${groundY + 30} L${headX - beamTop} ${headY - 30} Q${headX} ${headY - 60} ${headX + beamTop} ${headY - 30} L${youX + beamFoot} ${groundY + 30} Z`}
                        fill="black" style={{filter: "blur(10px)"}}/>
                    {/* the lit cloud shines down the string and up onto the clouds above it */}
                    {passedClouds.map(c => <ellipse key={c.id} cx={c.x} cy={c.y} rx={c.w * 0.62} ry={36} fill="black" style={{filter: "blur(8px)"}}/>)}
                    {litPlace && <ellipse cx={litPlace.x} cy={litPlace.y} rx={litPlace.w * 0.75} ry={48} fill="black" opacity={arrival} style={{filter: "blur(12px)"}}/>}
                    {sightings.map(c => <ellipse key={c.id} cx={c.x} cy={c.y} rx={c.w * 0.62} ry={34} fill="black" opacity={litPlace ? arrival : 1} style={{filter: "blur(8px)"}}/>)}
                </mask>
            </defs>
            <rect x={0} y={0} width={width} height={height} fill={`url(#${uid}-sky)`}/>
            <g transform={`translate(0 ${cam})`}>

            {/* one faint line for each level up, so height reads as how deep into the waypoint you are */}
            {Array.from({length: tallest}, (_, i) => i + 1).map(i =>
                <g key={i} className="trail-level">
                    <line x1={0} x2={width} y1={cloudY(i) + 30} y2={cloudY(i) + 30}/>
                    <text x={8} y={cloudY(i) + 26}>{i} up</text>
                </g>)}

            {/* the ground and the path along it */}
            <rect x={0} y={groundY} width={width} height={height - groundY} className="trail-ground"/>
            <rect x={0} y={groundY - 2} width={width} height={4} className="trail-grass"/>
            <path d={`M0 ${groundY + 14} ${Array.from({length: Math.ceil(width / 60) + 1}, (_, i) => `Q${i * 60 + 30} ${groundY + (i % 2 ? 10 : 18)} ${i * 60 + 60} ${groundY + 14}`).join(" ")}`}
                className="trail-path"/>

            {/* the waypoints: HOME (the enso, with the sloth hanging in it) and the places right under it, each a sign on a stake */}
            {offsets.map(({id, off}) => {
                const x = cx + off * spacing;
                const edge = Math.abs(off) > reach - 0.8 ? Math.max(0, (reach - Math.abs(off)) / 0.8) : 1;
                const n = node(id);
                const isHome = id === home;
                const classes = ["trail-waypoint", id === waypoint && "is-here", id === selected && "is-selected",
                    !visible.has(id) && "is-tucked", n?.status === "someday" && "is-someday", n?.status === "active" && "is-active",
                    onPick && "is-pickable"].filter(Boolean).join(" ");
                return (
                    <g key={id} className={classes} transform={`translate(${x} ${groundY})`} opacity={edge}
                        onClick={onPick ? pick(id) : undefined} data-place={id}>
                        <title>{label(id)}</title>
                        {isHome
                            ? <>
                                <image href="/Enso.svg" x={-enso / 2} y={-enso - 4} width={enso} height={enso}/>
                                {/* laid out like the Mindful picture: claws over the inside of the enso's top */}
                                <Sloth size={enso * 44 / 180} bar={false} x={-enso * 44 / 180 * 64 / 48 / 2} y={-enso - 4 + enso * 28 / 180}/>
                            </>
                            : <>
                                <line x1={0} y1={-26} x2={0} y2={8} className="trail-stake"/>
                                <rect x={-60} y={-52} width={120} height={28} rx={5} className="trail-sign"/>
                                {n?.status === "active" && <circle cx={-48} cy={-38} r={4} className="trail-active"/>}
                                <text x={n?.status === "active" ? 4 : 0} y={-33} textAnchor="middle" className="trail-sign-text">
                                    {short(label(id), n?.status === "active" ? 15 : 17)}
                                </text>
                            </>}
                        {isHome && <text x={0} y={-enso - 10} textAnchor="middle" className="trail-home-text">HOME</text>}
                    </g>
                );
            })}

            {/* the ring goes on past the edges: tap to walk to the next waypoint either way */}
            {ring.length > 1 && <>
                <g className="trail-edge is-pickable" onClick={onPick ? pick(step(-1)) : undefined} transform={`translate(18 ${groundY + 18})`}>
                    <title>{`Walk back to ${label(step(-1))}`}</title>
                    <circle r={13} className="trail-edge-button"/>
                    <path d="M3 -6 L-4 0 L3 6" className="trail-edge-arrow"/>
                </g>
                <g className="trail-edge is-pickable" onClick={onPick ? pick(step(1)) : undefined} transform={`translate(${width - 18} ${groundY + 18})`}>
                    <title>{`Walk on to ${label(step(1))}`}</title>
                    <circle r={13} className="trail-edge-button"/>
                    <path d="M-3 -6 L4 0 L-3 6" className="trail-edge-arrow"/>
                </g>
                {hidden > 0 && <text x={40} y={groundY + 32} className="trail-more">
                    {`${ring.length} waypoints in a ring · ${hidden} off screen`}
                </text>}
            </>}

            {/* the crew trails you along the ground: spider, squirrel, dog, then you */}
            <g transform={`translate(${youX - 76} ${groundY - 16})`}><Spider size={16}/></g>
            <g transform={`translate(${youX - 62} ${groundY - 27})`}><Squirrel size={27} doing="idle"/></g>
            <g transform={`translate(${youX - 42} ${groundY - 36})`}><Dog size={36} doing={carrying ? "curled" : "idle"}/></g>

            {/* you: the body stays on the ground */}
            <g className="crew-jon">
                <g transform={`translate(${youX - 18 * s} ${groundY - 92 * s}) scale(${s})`}>
                    <path d="M14.5 80v12M21.5 80v12" className="jon-leg"/>
                    <rect x={11.5} y={59} width={13} height={22} rx={3} className="jon-jacket"/>
                    {carrying
                        ? <>
                            <circle cx={24.5} cy={62.5} r={1.8} className="jon-knot"/>
                            <path d="M12 62 L8 70 M24 62 L28 70" className="jon-arm"/>
                            <rect x={6} y={68} width={24} height={8} rx={1.2} className="jon-work"/>
                            <path d="M10 71h8M10 73.5h12" className="jon-work-lines"/>
                        </>
                        : <>
                            <path d="M12 62 L7 74" className="jon-arm"/>
                            <path d="M24 62 L31 51" className="jon-arm"/>
                        </>}
                </g>
            </g>

            {/* the other clouds at each level stay where they were, in the shade */}
            {shaded.map(c => cloud(c, "shaded"))}

            {dim > 0 && <rect x={0} y={-cam} width={width} height={height} className="trail-dim" opacity={dim} mask={`url(#${uid}-beam)`} pointerEvents="none"/>}

            {/* the place you're at glows over your head and lights the ground below and the clouds above */}
            {litPlace && <circle cx={litPlace.x} cy={litPlace.y + 6} r={Math.max(100, levelH * 1.2)} fill={`url(#${uid}-glow)`}
                opacity={arrival} className="trail-glow" pointerEvents="none"/>}
            {passedClouds.map(c => cloud(c, "passed"))}
            {litPlace && cloud(litPlace, "lit")}
            {sightings.map(c => cloud(c, "sighting"))}

            {/* the string, hooked round the pin in every cloud on the way up, then your head */}
            <g className="crew-jon">
                <path d={string} className="jon-string"/>
                {pins.map(p => <g key={p.id} pointerEvents="none">
                    <line x1={p.x} y1={p.y - 9} x2={p.x} y2={p.y + 9} className="trail-pin"/>
                    <circle cx={p.x} cy={p.y - 9} r={2.4} className="trail-pin-head"/>
                </g>)}
                <g className="trail-head">
                    <Head x={headX} y={headY} r={13}/>
                </g>
            </g>
            </g>
        </svg>
    );
}

//how far below a cloud's middle its pin sits, under the name
const pinDrop = 12;

/* a smooth line through points, bending round each one the way a string bends round a pin */
function threadThrough(points: [number, number][]): string {
    if (points.length < 2) {
        return "";
    }
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
        const t = 0.18;
        d += ` C${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t} ${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]} ${p2[1]}`;
    }
    return d;
}

/* a name on at most a few lines, cut short with an ellipsis if it still doesn't fit */
function wrap(text: string, per: number, lines: number): string[] {
    const out: string[] = [];
    let rest = text.trim();
    while (rest.length > 0 && out.length < lines) {
        if (rest.length <= per) {
            out.push(rest);
            rest = "";
            break;
        }
        const cut = rest.lastIndexOf(" ", per);
        const at = cut > per / 3 ? cut : per;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
    }
    if (rest.length > 0) {
        out[out.length - 1] = short(`${out[out.length - 1]} ${rest}`, per);
    }
    return out;
}
