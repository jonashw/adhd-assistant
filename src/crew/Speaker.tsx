import { CrewSvg } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";
import { PersonHead } from "./PersonHead";

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
                <PersonHead cx={24} mood="talk"/>
            </g>
        </CrewSvg>
    );
}
