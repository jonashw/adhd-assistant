import React from "react";
import { MindMap, MindMapGraphData } from "../MindMap";
import { Head } from "./Jon";
import { Dog } from "./Dog";
import { Squirrel } from "./Squirrel";
import { Spider } from "./Spider";
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
    const tallest = Math.max(3, levels + 1, waypoint === home ? 0 : depthBelow(graph, waypoint));
    const headBase = groundY - 74;
    const levelH = Math.max(34, Math.min(130, (headBase - 70) / tallest));
    const altitude = useTween(levels);
    const headY = headBase - altitude * levelH;
    const hand: [number, number] = carrying ? [youX + (24.5 - 18) * s, groundY - (92 - 62.5) * s] : [youX + (31 - 18) * s, groundY - (92 - 50) * s];
    const headX = youX + (carrying ? 10 : 22) + Math.sin(altitude) * 6;
    const string = `M${hand[0]} ${hand[1]} C${hand[0] + 10} ${(hand[1] + headY) / 2 + 20} ${headX - 10} ${(hand[1] + headY) / 2 - 20} ${headX} ${headY + 13}`;
    const stringAt = (y: number) => {
        //where the string passes a height, close enough for hanging clouds on it
        const k = (hand[1] - y) / Math.max(1, hand[1] - headY - 13);
        return hand[0] + (headX - hand[0]) * k;
    };
    //each level's cloud sits just over where your head is at that level
    const overHead = 34;
    const passed = line.slice(2, -1).map((id, i) => ({id, y: headBase - (i + 1) * levelH - overHead}));
    const lit = levels > 0 ? {id: here, x: headX, y: headY - overHead} : undefined;
    const sightings = (here === home ? [] : MindMap.childrenOf(graph, here)).filter(id => visible.has(id));
    const sightY = (lit ? lit.y : headY) - Math.max(56, levelH * 0.85);

    //the narrower your focus, the darker everything outside the beam from your feet to your head
    const dim = Math.min(0.42, altitude * 0.11);
    const beamTop = Math.max(22, 70 - altitude * 12);
    const beamFoot = spacing * 0.9;
    const uid = React.useId().replace(/:/g, "");
    const pick = (id: string) => (e: React.MouseEvent) => {
        e.stopPropagation();
        onPick?.(id);
    };
    const cloud = (id: string, x: number, y: number, kind: "passed" | "lit" | "sighting") => {
        const k = kind === "lit" ? 1.35 : kind === "passed" ? 1.05 : 1;
        const tip = kind === "lit" ? label(id) : kind === "passed" ? `Come back down to ${label(id)}` : `Float up to ${label(id)}`;
        return (
            <g key={`${kind}-${id}`} className={["trail-cloud-place", `is-${kind}`, onPick && "is-pickable", id === selected && "is-selected"].filter(Boolean).join(" ")}
                transform={`translate(${x} ${y})`} onClick={onPick ? pick(id) : undefined} data-place={id}>
                <title>{tip}</title>
                <path transform={`scale(${k})`} d="M-40 6 q-6 -12 8 -14 q4 -12 18 -9 q8 -10 22 -2 q14 -2 16 10 q10 4 2 15 z" className="trail-cloud"/>
                <text x={0} y={kind === "lit" ? 5 : 4} textAnchor="middle" className="trail-cloud-text">{short(label(id), kind === "lit" ? 16 : 12)}</text>
            </g>
        );
    };
    const step = (by: number) => ring[((ringIndex + by) % ring.length + ring.length) % ring.length];
    const offsets = ring.map((id, i) => ({id, off: ringOffset(i, pos, ring.length)})).filter(w => Math.abs(w.off) <= reach);
    const hidden = ring.length - offsets.filter(w => Math.abs(w.off) <= reach - 0.4).length;
    const ariaLabel = here === home
        ? "Balloon-head at HOME, feet on the ground"
        : `Balloon-head on the ground at ${label(waypoint)}${levels > 0 ? `, head ${levels} level${levels === 1 ? "" : "s"} up at ${label(here)}` : ""}${carrying ? ", holding the work" : ""}`;

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
                <mask id={`${uid}-beam`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
                    <rect x={0} y={0} width={width} height={height} fill="white"/>
                    <path d={`M${youX - beamFoot} ${groundY + 30} L${headX - beamTop} ${headY - 30} Q${headX} ${headY - 60} ${headX + beamTop} ${headY - 30} L${youX + beamFoot} ${groundY + 30} Z`}
                        fill="black" style={{filter: "blur(10px)"}}/>
                    {lit && <circle cx={lit.x} cy={lit.y} r={Math.max(60, levelH * 0.75)} fill="black" style={{filter: "blur(14px)"}}/>}
                </mask>
            </defs>
            <rect x={0} y={0} width={width} height={groundY} fill={`url(#${uid}-sky)`}/>

            {/* one faint line for each level up, so height reads as how deep into the waypoint you are */}
            {Array.from({length: tallest}, (_, i) => i + 1).map(i =>
                <g key={i} className="trail-level">
                    <line x1={0} x2={width} y1={headBase - i * levelH + 14} y2={headBase - i * levelH + 14}/>
                    <text x={8} y={headBase - i * levelH + 10}>{i} up</text>
                </g>)}

            {/* the ground and the path along it */}
            <rect x={0} y={groundY} width={width} height={height - groundY} className="trail-ground"/>
            <rect x={0} y={groundY - 2} width={width} height={4} className="trail-grass"/>
            <path d={`M0 ${groundY + 14} ${Array.from({length: Math.ceil(width / 60) + 1}, (_, i) => `Q${i * 60 + 30} ${groundY + (i % 2 ? 10 : 18)} ${i * 60 + 60} ${groundY + 14}`).join(" ")}`}
                className="trail-path"/>

            {/* the waypoints: HOME and the places right under it, each a sign on a stake */}
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
                            ? <image href="/Enso.svg" x={-22} y={-50} width={44} height={44}/>
                            : <>
                                <line x1={0} y1={-26} x2={0} y2={8} className="trail-stake"/>
                                <rect x={-60} y={-52} width={120} height={28} rx={5} className="trail-sign"/>
                                {n?.status === "active" && <circle cx={-48} cy={-38} r={4} className="trail-active"/>}
                                <text x={n?.status === "active" ? 4 : 0} y={-33} textAnchor="middle" className="trail-sign-text">
                                    {short(label(id), n?.status === "active" ? 15 : 17)}
                                </text>
                            </>}
                        {isHome && <text x={0} y={-58} textAnchor="middle" className="trail-home-text">HOME</text>}
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

            {/* you: the body stays on the ground; the string runs up to your head */}
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
                <path d={string} className="jon-string"/>
                {passed.map(c => cloud(c.id, stringAt(c.y + overHead) + 4, c.y, "passed"))}
                <g className="trail-head">
                    <Head x={headX} y={headY} r={13}/>
                </g>
            </g>

            {dim > 0 && <rect x={0} y={0} width={width} height={height} className="trail-dim" opacity={dim} mask={`url(#${uid}-beam)`} pointerEvents="none"/>}

            {/* the place you're at glows over your head and lights everything around it */}
            {lit && <>
                <circle cx={lit.x} cy={lit.y + 10} r={Math.max(90, levelH * 1.1)} fill={`url(#${uid}-glow)`} className="trail-glow" pointerEvents="none"/>
                {cloud(lit.id, lit.x, lit.y, "lit")}
            </>}

            {/* what the head can see from here: the places one level further, as clouds to float up to */}
            {sightings.map((id, i) => {
                const spread = Math.min(140, (width - 80) / Math.max(1, sightings.length));
                const x = Math.min(width - 60, Math.max(60, headX + (i - (sightings.length - 1) / 2) * spread));
                return cloud(id, x, Math.max(28, sightY - (i % 2) * 14), "sighting");
            })}
        </svg>
    );
}
