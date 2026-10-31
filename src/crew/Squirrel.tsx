import { CrewSvg, Eye, ShutEye } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";

/* The robot flying squirrel: bushy tail with a centre stripe, pointed ears. It charts, gliding down to plant a stake. */
export type SquirrelDoing = "idle" | "glide" | "curled";

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-dart", ms: 1500, weight: 2},
    {name: "is-flick", ms: 550, weight: 2},
    {name: "is-ear", ms: 450, weight: 2},
    {name: "is-nibble", ms: 900, weight: 1}
];
const glideFidgets: Fidget[] = [{name: "is-blink", ms: 200}];

export function Squirrel({size = 24, doing = "idle"}: {size?: number, doing?: SquirrelDoing}) {
    const fidget = useFidget(doing === "glide" ? glideFidgets : fidgets, [1200, 4000], doing !== "curled");
    const label = doing === "glide" ? "Robot flying squirrel, gliding"
        : doing === "curled" ? "Robot flying squirrel, curled up"
        : "Robot flying squirrel";
    return (
        <CrewSvg width={48} height={48} size={size} label={label} classes={["crew-squirrel", `doing-${doing}`, fidget]}>
            {doing === "glide" ? <Gliding/> : doing === "curled" ? <Curled/> : <Sitting/>}
        </CrewSvg>
    );
}

function Sitting() {
    return (
        <g className="part sq-all">
            <g className="part sq-tail">
                <path d="M21 41 C8 43 1 34 3 24 C4.5 14 12 7 21 9.5 C15 13.5 13 19.5 17 24 C21.5 28.5 23 35 21 41 Z" className="sq-fur"/>
                <path d="M19 38.5 C9.5 38.5 6 31 7 24 C8 17 12 13 17.5 11.5" className="sq-stripe"/>
            </g>
            <ellipse cx={26} cy={34} rx={9} ry={10} className="sq-fur"/>
            <ellipse cx={29.5} cy={35.5} rx={5} ry={7} className="sq-belly"/>
            <path d="M19 33 Q21 40 27 43" className="crew-seam"/>
            <circle cx={21.5} cy={29.5} r={0.8} className="crew-rivet"/>
            <ellipse cx={22.5} cy={40.5} rx={6} ry={4.5} className="sq-fur-dark"/>
            <rect x={23} y={43} width={10} height={3} rx={1.5} className="crew-metal-dark"/>
            <g className="part sq-paws">
                <rect x={29.5} y={30.5} width={5} height={3.2} rx={1.6} className="crew-metal-dark"/>
            </g>
            <g className="part sq-head">
                <path className="part sq-ear sq-ear-back sq-fur-dark" d="M26.5 16.5 L25.5 7.5 L31 13.5 Z"/>
                <ellipse cx={32} cy={21} rx={8} ry={7} className="sq-fur"/>
                <ellipse cx={38.5} cy={23} rx={3.8} ry={3.1} className="sq-fur"/>
                <ellipse cx={36} cy={25.3} rx={3.2} ry={2} className="sq-belly"/>
                <circle cx={42} cy={22.4} r={1.15} className="crew-ink"/>
                <path d="M38.5 24.5 L45 23.5 M38.5 25.5 L44.5 26.5" className="crew-whisker"/>
                <circle cx={34} cy={19.5} r={3} className="crew-ink"/>
                <g className="part eyes"><Eye x={34.6} y={19.4} r={1.5}/></g>
                <path className="part sq-ear sq-ear-front sq-fur" d="M30.5 15 L32 5.5 L36 14 Z"/>
                <circle cx={32} cy={6} r={1.1} className="crew-led"/>
            </g>
        </g>
    );
}

function Curled() {
    return (
        <g className="part sq-all sq-breathe">
            <ellipse cx={24} cy={36} rx={13} ry={8.5} className="sq-fur-dark"/>
            <ellipse cx={34.5} cy={35} rx={6} ry={5} className="sq-fur"/>
            <ellipse cx={36.5} cy={37} rx={3} ry={2} className="sq-belly"/>
            <path d="M32 31 L32.5 25.5 L36 30.5 Z" className="sq-fur-dark"/>
            <circle cx={32.5} cy={25.8} r={1} className="crew-led"/>
            <ShutEye x={35.5} y={34} w={3}/>
            <circle cx={39.7} cy={36} r={0.9} className="crew-ink"/>
            <path d="M10 37 C6 25 20 19 33 22.5 C41 25 41.5 30 39 32 C34 27 22 27 14 38.5 Z" className="sq-fur"/>
            <path d="M12 35 C11 27 20 23 32 25" className="sq-stripe"/>
        </g>
    );
}

function Gliding() {
    return (
        <g className="part sq-all sq-float">
            <path d="M24 30 C22 37 27 41 24 47" className="sq-glide-tail"/>
            <path d="M8 19 L24 15 L40 19 L37 32 L24 29 L11 32 Z" className="sq-fur"/>
            <path d="M11 22 L24 19 L37 22" className="sq-stripe"/>
            <rect x={5} y={17} width={5} height={3} rx={1.5} className="crew-metal-dark"/>
            <rect x={38} y={17} width={5} height={3} rx={1.5} className="crew-metal-dark"/>
            <rect x={8} y={30.5} width={5} height={3} rx={1.5} className="crew-metal-dark"/>
            <rect x={35} y={30.5} width={5} height={3} rx={1.5} className="crew-metal-dark"/>
            <ellipse cx={24} cy={23} rx={5} ry={7} className="sq-belly"/>
            <path d="M19.5 9 L19 2.5 L23 7 Z M28.5 9 L29 2.5 L25 7 Z" className="sq-fur-dark"/>
            <circle cx={24} cy={11} r={5.5} className="sq-fur"/>
            <circle cx={22} cy={10.5} r={1.8} className="crew-ink"/>
            <circle cx={26} cy={10.5} r={1.8} className="crew-ink"/>
            <g className="part eyes"><Eye x={22} y={10.3} r={0.9}/><Eye x={26} y={10.3} r={0.9}/></g>
            <circle cx={24} cy={14} r={0.9} className="crew-ink"/>
        </g>
    );
}
