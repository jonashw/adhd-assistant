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
    const youX = cx + 100;
    const levels = Math.max(0, line.length - 2);
    const overHead = 40;
    /* zoom: the sky holds the levels you've climbed plus the clouds above you. When it needs more room, you and the
       ground shrink first, so your body always stays in view and the clouds keep their width (and their names stay
       readable). Only then do the levels close up. Clouds only ever move as part of that zoom. */
    const above = here !== home && MindMap.childrenOf(graph, here).some(id => visible.has(id)) ? 1 : 0;
    const rows = Math.max(2, levels + above);
    const z = useTween(Math.max(0.5, Math.min(1, (groundY - overHead - 34 - rows * 104) / 74)), 800);
    const zs = Math.max(0.75, z);
    const s = 1.5 * z;
    const headBase = groundY - 74 * z;
    const levelH = useTween(Math.max(66, Math.min(130, (groundY - 74 * Math.max(0.5, Math.min(1, (groundY - overHead - 34 - rows * 104) / 74)) - overHead - 34) / rows)), 800);
    const aloft = levels > 0;
    //on the ground the arm hangs relaxed with the string in hand and the balloon close by; aloft the arm reaches up
    const handAt = (bx: number, by: number): [number, number] => [youX + (bx - 18) * s, groundY - (92 - by) * s];
    const hand: [number, number] = carrying ? handAt(24.5, 62.5) : aloft ? handAt(31, 50) : handAt(27, 74.5);
    const restX = carrying ? youX + 10 * z : hand[0] + 7 * z;
    const restY = carrying ? headBase : hand[1] - 44 * z;
    const headR = 13 * Math.max(0.7, z);

    /* The clouds over a waypoint keep their places. Each level's clouds spread out over the cloud they belong to
       (the first level over your head on the ground), so picking one never moves the others; dimming hides them. */
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
    //at HOME you lie in the hammock strung across the stone ring, and the balloon settles at its far end
    const resting = here === home;
    const homeX = cx + ringOffset(0, pos, ring.length) * spacing;
    const ringD = Math.min(130, Math.max(70, height * 0.24)) * zs;
    const hammock = hammockOf(ringD);
    const headX = useTween(resting ? cx + hammock.head[0] : litPlace ? litPlace.x : restX, 800);
    const headY = useTween(resting ? groundY + hammock.head[1] : litPlace ? litPlace.y + overHead : restY, 800);
    const altitude = resting ? 0 : Math.max(0, (restY - headY) / levelH);
    //when the clouds above you would leave the top of the sky, the view rises with you and the ground slips down
    const cam = useTween(Math.max(0, 40 - cloudY(levels + 1) - (layout.rows[levels]?.length ? 0 : levelH)), 800);
    const arrival = litPlace ? Math.max(0, Math.min(1, 1 - Math.hypot(headX - litPlace.x, headY - litPlace.y - overHead) / 70)) : 0;

    /* the string hooks a metal pin through the middle of each cloud you passed on the way up, so the way back
       down shows, the way the rabbit's string runs back through every chamber */
    const pins = line.slice(2, -1).map(id => layout.placed.get(id)).filter((c): c is NonNullable<typeof c> => !!c)
        .map(c => ({id: c.id, x: c.x, y: c.y + pinDrop}));
    const string = resting
        ? threadThrough([[homeX + hammock.hand[0], groundY + hammock.hand[1]], [headX, headY + headR]])
        : threadThrough([hand, ...pins.map(p => [p.x, p.y] as [number, number]), [headX, headY + headR]]);
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
        const top = words.length === 1 ? 4 : -3;
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
                <text x={0} y={top} textAnchor="middle" className="trail-cloud-text">
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
            {Array.from({length: rows + 1}, (_, i) => i + 1).map(i =>
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
                            ? <StoneRing d={ringD} resting={resting} carrying={carrying} s={s}/>
                            : <g transform={`scale(${zs})`}>
                                <line x1={0} y1={-26} x2={0} y2={8} className="trail-stake"/>
                                <rect x={-60} y={-52} width={120} height={28} rx={5} className="trail-sign"/>
                                {n?.status === "active" && <circle cx={-48} cy={-38} r={4} className="trail-active"/>}
                                <text x={n?.status === "active" ? 4 : 0} y={-33} textAnchor="middle" className="trail-sign-text">
                                    {short(label(id), n?.status === "active" ? 15 : 17)}
                                </text>
                            </g>}
                        {isHome && <text x={0} y={-ringD - 10} textAnchor="middle" className="trail-home-text">HOME</text>}
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
            <g transform={`translate(${youX - 76 * z} ${groundY - 16 * z})`}><Spider size={16 * z}/></g>
            <g transform={`translate(${youX - 62 * z} ${groundY - 27 * z})`}><Squirrel size={27 * z} doing={resting ? "curled" : "idle"}/></g>
            <g transform={`translate(${youX - 42 * z} ${groundY - 36 * z})`}><Dog size={36 * z} doing={carrying || resting ? "curled" : "idle"}/></g>

            {/* you: the body stays on the ground (or in the hammock, at HOME) */}
            {!resting && <g className="crew-jon">
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
                            {aloft
                                ? <path d="M24 62 L31 51" className="jon-arm"/>
                                : <path d="M24 62 L27 74" className="jon-arm"/>}
                            <circle cx={aloft ? 31 : 27} cy={aloft ? 50.5 : 74.5} r={1.6} className="jon-hand"/>
                        </>}
                </g>
            </g>}

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
                    <line x1={p.x} y1={p.y - 5} x2={p.x} y2={p.y + 6} className="trail-pin"/>
                    <circle cx={p.x} cy={p.y - 5} r={2.4} className="trail-pin-head"/>
                </g>)}
                <g className="trail-head">
                    <Head x={headX} y={headY} r={headR}/>
                </g>
            </g>
            </g>
        </svg>
    );
}

//how far below a cloud's middle its pin sits, under the name
const pinDrop = 19;

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

/* where the hammock hangs in the stone ring, from the ring's foot: its ends, the hand that holds the string, and
   where the balloon settles */
function hammockOf(d: number) {
    const cy = -2 - d / 2;
    return {
        left: [-d * 0.4, cy - d * 0.04] as [number, number],
        right: [d * 0.4, cy - d * 0.04] as [number, number],
        sag: cy + d * 0.2,
        hand: [d * 0.06, cy + d * 0.08] as [number, number],
        head: [d * 0.3, cy - d * 0.06] as [number, number]
    };
}

/* HOME: a ring of standing stone carved as a snake swallowing its tail, with the sloth hanging from the top and a
   hammock slung across the middle, where you rest when you're home */
function StoneRing({d, resting, carrying, s}: {d: number, resting: boolean, carrying: boolean, s: number}) {
    const r = d / 2;
    const t = d * 0.15;
    const cy = -2 - r;
    const mid = r - t / 2;
    const h = hammockOf(d);
    const at = (deg: number, rr = mid): [number, number] => [Math.cos(deg * Math.PI / 180) * rr, cy + Math.sin(deg * Math.PI / 180) * rr];
    //the head sits at the upper left and faces round the ring, jaws closed on the tip of its own tail
    const head = -150;
    const [hx, hy] = at(head);
    //scales carved along the body, all the way round from the neck to the tail
    const scales = Array.from({length: 16}, (_, i) => head + 26 + i * 20.5);
    const sloth = d * 44 / 180;
    return (
        <g className="trail-stone-ring">
            {/* boulders it stands on */}
            <ellipse cx={-r * 0.55} cy={-2} rx={r * 0.32} ry={r * 0.12} className="trail-boulder"/>
            <ellipse cx={r * 0.5} cy={-1} rx={r * 0.28} ry={r * 0.1} className="trail-boulder"/>
            <circle cx={0} cy={cy} r={mid} className="trail-stone" style={{strokeWidth: t}}/>
            <circle cx={0} cy={cy} r={mid + t * 0.3} className="trail-stone-light"/>
            <circle cx={0} cy={cy} r={mid - t * 0.3} className="trail-stone-dark"/>
            {scales.map(a => {
                const [x, y] = at(a);
                return <path key={a} transform={`translate(${x} ${y}) rotate(${a + 90}) scale(${t / 20})`}
                    d="M-3 -6 Q4 0 -3 6" className="trail-carve"/>;
            })}
            {/* the snake's head, biting the tip of its tail */}
            <g transform={`translate(${hx} ${hy}) rotate(${head + 90}) scale(${t / 20})`}>
                <path d="M-12 -11 C0 -15 14 -12 19 -4 L9 -1 L19 2 C15 10 2 14 -12 11 Q-16 0 -12 -11 Z" className="trail-snake-head"/>
                <path d="M-6 -10 Q2 -12 10 -8 M-6 10 Q2 12 10 8" className="trail-carve" style={{strokeWidth: 1.4}}/>
                <circle cx={5} cy={-6} r={2.4} className="trail-snake-eye"/>
                <circle cx={5} cy={6} r={2.4} className="trail-snake-eye"/>
            </g>
            {/* the sloth hooks its claws over the inside of the ring's top */}
            <Sloth size={sloth} bar={false} x={-sloth * 64 / 48 / 2} y={cy - mid + t * 0.25}/>
            {/* the hammock: ropes to the stone, and the cloth sagging between */}
            <path d={`M${h.left[0] - t * 0.4} ${h.left[1] - t * 0.3} L${h.left[0]} ${h.left[1]} M${h.right[0] + t * 0.4} ${h.right[1] - t * 0.3} L${h.right[0]} ${h.right[1]}`} className="trail-rope"/>
            <path d={`M${h.left[0]} ${h.left[1]} Q0 ${h.sag + d * 0.06} ${h.right[0]} ${h.right[1]} Q0 ${h.sag - d * 0.08} ${h.left[0]} ${h.left[1]} Z`} className="trail-hammock"/>
            <path d={`M${h.left[0]} ${h.left[1]} Q0 ${h.sag} ${h.right[0]} ${h.right[1]}`} className="trail-hammock-stripe"/>
            {/* you, lying in it, string in hand */}
            {resting && <g className="crew-jon" transform={`translate(${-d * 0.08} ${h.sag - d * 0.1}) rotate(84) scale(${s * 0.9}) translate(-18 -75)`}>
                <path d="M14.5 80v12M21.5 80v12" className="jon-leg"/>
                <rect x={11.5} y={59} width={13} height={22} rx={3} className="jon-jacket"/>
                <path d="M12 62 L10 72" className="jon-arm"/>
                {carrying && <rect x={15} y={66} width={8} height={6} rx={1} className="jon-work"/>}
            </g>}
            {resting && <circle cx={h.hand[0]} cy={h.hand[1]} r={1.8 * s} className="trail-hand"/>}
        </g>
    );
}
