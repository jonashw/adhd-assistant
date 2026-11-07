import React from "react";
import { CrewSvg } from "./CrewSvg";
import { Fidget, useFidget, usePrefersReducedMotion } from "./useFidget";
import { ldaedFaces, LdaedFrame } from "./ldaed.generated";

/* Yanchi, the radio robot. He wears Jon's LDAED (Low-Density Auto-Emotive Display) faces from March 2015:
   a 24 x 16 grid of LEDs, played from Jon's own GIFs, every frame at Jon's own timing.
   The idea and its influences, as Jon gave them (art/ldaed/README.md has the full record):
   - the faces were made for a "primitive futurism" robot with quaint synthesized speech, the kind Stephen Hawking
     used and Jon used in his soundboard app;
   - GERTY from Moon (a robot whose face is a screen showing a feeling) and Jailbot from Superjail!;
   - the round LED dots of the "LED head" balloon in the face workshop (itself a nod to deadmau5's helmet);
   - his name: John von Neumann, whose family called him Jancsi, spelled the way it sounds.
   His job, proposed and not yet wired in: the crew's radio operator, showing what the Claude side needs from you.
   For now he lives on /crew only. Faces change with a pixel dissolve, like an old LED sign. */

export type YanchiFace = keyof typeof ldaedFaces & string;

const COLS = 24;
const ROWS = 16;
/* the screen's grid, in the drawing's units: 3 per LED */
const CELL = 3;
const GRID_X = 24;
const GRID_Y = 36;

const fidgets: Fidget[] = [
    {name: "is-scan", ms: 900, weight: 3},
    {name: "is-tilt", ms: 1400, weight: 2},
    {name: "is-wobble", ms: 900, weight: 2},
    {name: "is-wink", ms: 500, weight: 2}
];

type Lit = Set<number>;

function litOf(frame: LdaedFrame): Lit {
    const lit: Lit = new Set();
    frame.rows.forEach((hex, r) => {
        const bits = parseInt(hex, 16);
        for (let c = 0; c < COLS; c++) {
            if (bits & (1 << (COLS - 1 - c))) lit.add(r * COLS + c);
        }
    });
    return lit;
}

/* one path of round dots: a face costs one element, not 384 */
function dots(cells: Iterable<number>) {
    const r = CELL * 0.4;
    let d = "";
    for (const i of cells) {
        const cx = GRID_X + (i % COLS) * CELL + CELL / 2;
        const cy = GRID_Y + Math.floor(i / COLS) * CELL + CELL / 2;
        d += `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    return d;
}

const allDots = dots(Array.from({length: COLS * ROWS}, (_, i) => i));

/* Plays a face's frames on Jon's timings, dissolving pixel by pixel into each new face */
function useLedFace(face: YanchiFace, still: boolean): Lit {
    const [lit, setLit] = React.useState<Lit>(() => litOf(ldaedFaces[face][0]));
    const shown = React.useRef(lit);
    const show = (next: Lit) => {
        shown.current = next;
        setLit(next);
    };

    React.useEffect(() => {
        const frames = ldaedFaces[face].map(litOf);
        const timers: number[] = [];
        const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
        const loop = (i: number) => {
            show(frames[i]);
            if (!still && frames.length > 1) {
                later(() => loop((i + 1) % frames.length), ldaedFaces[face][i].ms || 200);
            }
        };
        if (still) {
            loop(0);
        } else {
            /* the dissolve: the LEDs that differ flip in a random order over six quick steps */
            const from = shown.current;
            const to = frames[0];
            const differ = [...new Set([...from, ...to])].filter(i => from.has(i) !== to.has(i));
            differ.sort(() => Math.random() - 0.5);
            const steps = 6;
            const current = new Set(from);
            for (let s = 1; s <= steps; s++) {
                later(() => {
                    differ.slice(Math.ceil(differ.length * (s - 1) / steps), Math.ceil(differ.length * s / steps))
                        .forEach(i => current.has(i) ? current.delete(i) : current.add(i));
                    show(new Set(current));
                    if (s === steps) loop(0);
                }, s * 40);
            }
        }
        return () => timers.forEach(t => window.clearTimeout(t));
    }, [face, still]);

    return lit;
}

export function Yanchi({size = 96, face = "relaxing"}: {size?: number, face?: YanchiFace}) {
    const reduced = usePrefersReducedMotion();
    const fidget = useFidget(fidgets, [2500, 7000]);
    const lit = useLedFace(face, reduced);
    const glow = `yanchi-glow-${React.useId().replace(/:/g, "")}`;
    return (
        <CrewSvg width={120} height={178} size={size} label={`Yanchi, the radio robot, looking ${face}`}
            classes={["crew-yanchi", fidget]}>
            <defs>
                <filter id={glow} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="0.7" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            {/* treads */}
            <rect x={18} y={156} width={84} height={20} rx={10} className="crew-ink"/>
            {[30, 50, 70, 90].map(x => <circle key={x} cx={x} cy={166} r={5} className="yanchi-wheel"/>)}
            {/* body: a radio set with a speaker grille and a tuning dial */}
            <rect x={24} y={98} width={72} height={60} rx={9} className="yanchi-case"/>
            <rect x={27} y={101} width={66} height={6} rx={3} className="yanchi-case-hi"/>
            {[116, 123, 130, 137].map(y => <line key={y} x1={36} y1={y} x2={66} y2={y} className="yanchi-grille"/>)}
            <circle cx={81} cy={126} r={8} className="yanchi-dial"/>
            <line x1={81} y1={126} x2={81} y2={119.5} className="yanchi-needle"/>
            <circle cx={81} cy={146} r={2.4} className="yanchi-led"/>
            <rect x={52} y={91} width={16} height={9} className="yanchi-neck"/>
            <g className="part yanchi-head">
                <g className="part yanchi-antenna">
                    <line x1={60} y1={28} x2={60} y2={10} className="yanchi-mast"/>
                    <circle cx={60} cy={7} r={3.4} className="yanchi-led yanchi-tip"/>
                </g>
                <rect x={14} y={27} width={92} height={66} rx={13} className="yanchi-case"/>
                {/* the LED screen: unlit dots behind, lit dots glowing */}
                <rect x={21} y={33} width={78} height={54} rx={7} className="yanchi-screen"/>
                <path d={allDots} className="yanchi-unlit"/>
                <path d={dots(lit)} className="yanchi-lit" filter={`url(#${glow})`}/>
                <rect x={21} y={34} width={78} height={2} className="part yanchi-scan"/>
                {/* the radio operator's headset */}
                <path d="M13 48 Q60 -6 107 48" className="yanchi-band"/>
                <rect x={4} y={44} width={13} height={28} rx={5} className="crew-ink"/>
                <rect x={103} y={44} width={13} height={28} rx={5} className="crew-ink"/>
                <path d="M10 71 Q11 94 34 97" className="yanchi-boom"/>
                <circle cx={36} cy={97} r={3} className="crew-ink"/>
            </g>
        </CrewSvg>
    );
}

