import { CrewSvg } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";

/* A person thinking out loud: mouth open, one hand up, the question they'd ask themselves floating below in
   speech bubbles. Balloon-head's body with an ordinary head: the balloon grown in for good, skin and all.
   Its own component so the Inkscape art can replace it later. */

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-talk", ms: 1200, weight: 2}
];

export function Speaker({size = 72}: {size?: number}) {
    const fidget = useFidget(fidgets, [1800, 4200]);
    return (
        <CrewSvg width={52} height={96} size={size} label="A person asking themselves a question"
            classes={["crew-jon", "crew-speaker", fidget]}>
            {/* legs and body, the same as Balloon-head's */}
            <path d="M20.5 80v12M27.5 80v12" className="jon-leg"/>
            <rect x={17.5} y={59} width={13} height={22} rx={3} className="jon-jacket"/>
            <line x1={24} y1={61} x2={24} y2={80} className="crew-seam"/>
            {/* one hand at the side, one raised as if to say "hm" */}
            <path d="M18 62 L13 74" className="jon-arm"/>
            <path d="M30 62 L37 55 L39 48" className="jon-arm"/>
            <circle cx={39} cy={47} r={1.9} className="speaker-skin"/>
            <g className="part jon-bob">
                {/* a neck where the knot was, then an ordinary head */}
                <rect x={21.6} y={50} width={4.8} height={9.5} rx={1.6} className="speaker-skin"/>
                <ellipse cx={13.6} cy={39} rx={1.9} ry={2.8} className="speaker-skin"/>
                <ellipse cx={34.4} cy={39} rx={1.9} ry={2.8} className="speaker-skin"/>
                <ellipse cx={24} cy={38} rx={10.4} ry={12.4} className="speaker-skin"/>
                <path d="M13.6 36.5 C13 26 18 24.6 24 24.6 C30.5 24.6 35.4 26.6 34.4 36.5 C33 31 30 29.6 24.5 30.4 C19.5 31 16 31.6 13.6 36.5 Z" className="speaker-hair"/>
                <g className="part eyes">
                    <circle cx={20.2} cy={37} r={1.4} className="speaker-ink"/>
                    <circle cx={27.8} cy={37} r={1.4} className="speaker-ink"/>
                </g>
                <path d="M18.6 33.6 q1.6 -1 3.2 0 M26.2 33.6 q1.6 -1 3.2 0" className="speaker-brow"/>
                {/* the open mouth, mid-question */}
                <ellipse cx={24} cy={44} rx={2.4} ry={2.8} className="part speaker-mouth"/>
            </g>
        </CrewSvg>
    );
}
