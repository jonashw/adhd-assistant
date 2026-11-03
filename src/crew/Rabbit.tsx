import React from "react";
import { Eye, ShutEye } from "./CrewSvg";
import { Fidget, useFidget, usePrefersReducedMotion } from "./useFidget";
import "./rabbit.css";

/* The robot rabbit of the rabbit-hole map. It lives in a burrow: the surface with HOME on it, and three
   tunnels below, each one a tangent deeper. Its string is tied at HOME and runs behind it through every
   hole it has gone down, like breadcrumbs, so the way back is always marked. When it climbs back up,
   the string comes up with it.
   depth: 0 is the surface beside HOME; 1 to 3 are the tunnels. Changing depth plays the jump down or the climb up.
   carrying: it has picked up a piece of work here and holds it in both front paws (its "tied off"). */

export const burrowDepths = 3;

const W = 124, H = 116;
const surface = 24;
const bandH = 30;
const floorOf = (d: number) => d === 0 ? surface : surface + d * bandH - 3;
const shaftX = [0, 36, 66, 96];
const restX = [27, 50, 80, 108];

//the string's whole route from HOME, through every hole, to the deepest tunnel
const route: [number, number][] = [
    [9, surface],
    [shaftX[1], surface], [shaftX[1], floorOf(1)],
    [shaftX[2], floorOf(1)], [shaftX[2], floorOf(2)],
    [shaftX[3], floorOf(2)], [shaftX[3], floorOf(3)],
    [118, floorOf(3)]
];
const segLen = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]));

//how far along the route the rabbit rests at each depth
const restAt = (d: number) => {
    let s = 0;
    for (let i = 0; i < segLen.length; i++) {
        const [a, b] = [route[i], route[i + 1]];
        const onThisFloor = a[1] === floorOf(d) && b[1] === floorOf(d) && restX[d] >= Math.min(a[0], b[0]) && restX[d] <= Math.max(a[0], b[0]);
        if (onThisFloor) {
            return s + Math.abs(restX[d] - a[0]);
        }
        s += segLen[i];
    }
    return s;
};

/* The point at distance s along the route, whether that stretch is level ground, and the route walked so far */
function along(s: number): {x: number, y: number, level: boolean, walked: [number, number][]} {
    const walked: [number, number][] = [route[0]];
    let left = s;
    for (let i = 0; i < segLen.length; i++) {
        const [a, b] = [route[i], route[i + 1]];
        if (left <= segLen[i] || i === segLen.length - 1) {
            const t = segLen[i] === 0 ? 0 : Math.min(1, left / segLen[i]);
            const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
            walked.push([x, y]);
            return {x, y, level: a[1] === b[1], walked};
        }
        left -= segLen[i];
        walked.push(b);
    }
    const last = route[route.length - 1];
    return {x: last[0], y: last[1], level: true, walked};
}

const msPerUnit = 14;

/* Moves the rabbit's place along the route toward the target depth, one frame at a time */
function useTravel(depth: number): {s: number, moving: boolean, facing: 1 | -1} {
    const reduced = usePrefersReducedMotion();
    const target = restAt(Math.max(0, Math.min(burrowDepths, depth)));
    const [s, setS] = React.useState(target);
    const [facing, setFacing] = React.useState<1 | -1>(1);
    const sRef = React.useRef(target);
    React.useEffect(() => {
        const from = sRef.current;
        if (reduced || from === target) {
            sRef.current = target;
            setS(target);
            return;
        }
        setFacing(target > from ? 1 : -1);
        const duration = Math.abs(target - from) * msPerUnit;
        const start = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            sRef.current = from + (target - from) * eased;
            setS(sRef.current);
            if (t < 1) {
                frame = requestAnimationFrame(tick);
            }
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, reduced]);
    return {s, moving: Math.abs(s - target) > 0.01, facing};
}

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 220, weight: 3},
    {name: "is-ear", ms: 700, weight: 2},
    {name: "is-nose", ms: 900, weight: 2},
    {name: "is-thump", ms: 500, weight: 1}
];

export function RabbitBurrow({size = 100, depth = 0, carrying = false}: {size?: number, depth?: number, carrying?: boolean}) {
    const {s, moving, facing} = useTravel(depth);
    const here = along(s);
    const fidget = useFidget(fidgets, [1600, 4500], !moving);
    //on level ground it hops; in a shaft it slides straight down or scrabbles up
    const hop = moving && here.level ? -Math.abs(Math.sin(s / 4)) * 5 : 0;
    const string = here.walked.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const label = `Robot rabbit, ${depth === 0 ? "at the surface by HOME" : `${depth} hole${depth === 1 ? "" : "s"} down`}${carrying ? ", carrying a piece of work" : ""}`;
    return (
        <svg className={["crew", "crew-rabbit", moving && "is-moving", carrying && "is-carrying", fidget].filter(Boolean).join(" ")}
            viewBox={`0 0 ${W} ${H}`} width={size * W / H} height={size} role="img" aria-label={label}>
            <title>{label}</title>
            {/* ground: the surface and three bands below it, each with its tunnel and the shaft down into it */}
            {[1, 2, 3].map(d =>
                <rect key={d} x={0} y={surface + (d - 1) * bandH} width={W} height={d === 3 ? H - surface - 2 * bandH : bandH} className={`burrow-band burrow-band-${d}`}/>)}
            <rect x={0} y={surface - 1.2} width={W} height={2.4} className="burrow-grass"/>
            {[1, 2, 3].map(d => {
                const top = surface + (d - 1) * bandH;
                const left = shaftX[d] - 7;
                const right = d === 3 ? W - 2 : shaftX[d + 1] + 7;
                return <g key={d}>
                    <rect x={left} y={top + 2} width={right - left} height={floorOf(d) - top} rx={7} className="burrow-tunnel"/>
                    <rect x={shaftX[d] - 4} y={floorOf(d - 1) - 1} width={8} height={top + 4 - floorOf(d - 1) + 1} rx={3} className="burrow-tunnel"/>
                </g>;
            })}
            <ellipse cx={shaftX[1]} cy={surface} rx={6} ry={2} className="burrow-hole"/>
            {/* HOME on the surface, where the string is tied */}
            <circle cx={9} cy={surface - 5} r={4.2} className="burrow-home"/>
            <path d={string} className="burrow-string" fill="none"/>
            <g transform={`translate(${here.x} ${here.y + hop})`}>
                <g transform={`scale(${facing * 1.2} 1.2)`}>
                    <RabbitBody carrying={carrying}/>
                </g>
            </g>
        </svg>
    );
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

/* The burrow on a loop: down one hole at a time to the bottom, then all the way back up to HOME */
export function RabbitBurrowLoop({size = 100}: {size?: number}) {
    const reduced = usePrefersReducedMotion();
    const [depth, setDepth] = React.useState(reduced ? burrowDepths : 0);
    const down = React.useRef(true);
    React.useEffect(() => {
        if (reduced) {
            setDepth(burrowDepths);
            return;
        }
        //rest a beat at each depth, longer after the long climb home
        const timer = window.setTimeout(() => {
            if (depth === burrowDepths) down.current = false;
            if (depth === 0) down.current = true;
            setDepth(down.current ? depth + 1 : 0);
        }, depth === 0 ? 2600 : 1800 + (restAt(depth) - restAt(depth - 1)) * msPerUnit);
        return () => window.clearTimeout(timer);
    }, [reduced, depth]);
    return <RabbitBurrow size={size} depth={depth}/>;
}
