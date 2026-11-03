import { CrewSvg } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";

/* You, Balloon-head, thinking out loud: mouth open, one hand up, the question you'd ask yourself
   floating below in speech bubbles. Its own component so the Inkscape art can replace it later. */

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-talk", ms: 1200, weight: 2}
];

export function Speaker({size = 72}: {size?: number}) {
    const fidget = useFidget(fidgets, [1800, 4200]);
    return (
        <CrewSvg width={52} height={96} size={size} label="You, Balloon-head, asking yourself a question"
            classes={["crew-jon", "crew-speaker", fidget]}>
            {/* legs and body */}
            <path d="M20.5 80v12M27.5 80v12" className="jon-leg"/>
            <rect x={17.5} y={59} width={13} height={22} rx={3} className="jon-jacket"/>
            <line x1={24} y1={61} x2={24} y2={80} className="crew-seam"/>
            {/* one hand at the side, one raised as if to say "hm" */}
            <path d="M18 62 L13 74" className="jon-arm"/>
            <path d="M30 62 L37 55 L39 48" className="jon-arm"/>
            {/* the string from the hand at the side up to the head */}
            <circle cx={30.5} cy={62.5} r={1.8} className="jon-knot"/>
            <path d="M30.5 61 q5 -4 -4 -9" className="jon-string"/>
            <g className="part jon-bob">
                <path d="M22.6 47.6 L24 45.6 L25.4 47.6 Z" className="jon-balloon-knot"/>
                <ellipse cx={24} cy={33} rx={11.2} ry={13} className="jon-balloon"/>
                <ellipse cx={19.3} cy={27.2} rx={2.2} ry={4.2} transform="rotate(25 19.3 27.2)" className="jon-balloon-shine"/>
                <g className="part eyes">
                    <circle cx={20.1} cy={31} r={1.9} className="jon-face-ink"/>
                    <circle cx={27.9} cy={31} r={1.9} className="jon-face-ink"/>
                </g>
                {/* the open mouth, mid-question */}
                <ellipse cx={24} cy={38.4} rx={2.8} ry={3.2} className="part speaker-mouth"/>
            </g>
        </CrewSvg>
    );
}
