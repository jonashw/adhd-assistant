import { CrewSvg } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";
import { Spider } from "./Spider";

/* You, the scout. The head scouts, the body does: tied off, both hands hold the work and the head stays close;
   aloft, one hand holds the string and the head floats up, higher the more string is out. Mindful: hands empty. */
export type JonDoing = "tied" | "aloft" | "mindful";
/* where the spider is on your string, aloft: riding your wrist, climbing, tugging, or up by your head asking */
export type StringSpider = "wrist" | "climb" | "tug" | "ask";

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-look", ms: 1400, weight: 1}
];

/* head height for string out 0..5 */
const headY = (level: number) => 34 - Math.min(5, Math.max(1, level)) * 5;

export function Jon({size = 48, doing = "tied", stringOut = 1, spider}: {
    size?: number,
    doing?: JonDoing,
    /* how many steps of string are out, aloft */
    stringOut?: number,
    /* aloft, the spider travels your string: it rides the wrist of your string hand until it carries something up */
    spider?: StringSpider
}) {
    const fidget = useFidget(fidgets, [2000, 6000]);
    const label = doing === "aloft" ? `You, aloft with ${stringOut} step(s) of string out`
        : doing === "mindful" ? "You, standing at HOME with empty hands"
        : "You, tied off with both hands on the work";
    return (
        <CrewSvg width={40} height={96} size={size} label={label} classes={["crew-jon", `doing-${doing}`, fidget]}>
            {/* legs and body */}
            <path d="M14.5 80v12M21.5 80v12" className="jon-leg"/>
            <rect x={11.5} y={59} width={13} height={22} rx={3} className="jon-jacket"/>
            <line x1={18} y1={61} x2={18} y2={80} className="crew-seam"/>
            {doing === "tied" && <Tied/>}
            {doing === "mindful" && <Mindful/>}
            {doing === "aloft" && <Aloft y={headY(stringOut)} spider={spider}/>}
        </CrewSvg>
    );
}

/* Your head is a balloon: the head scouts, floating on the string the body holds */
function Head({x, y, r}: {x: number, y: number, r: number}) {
    const cy = y - 1.5;
    const ry = r;
    const rx = r * 0.86;
    const bottom = cy + ry;
    return (
        <g className="part jon-head">
            <path d={`M${x - 1.4} ${bottom + 1.6} L${x} ${bottom - 0.4} L${x + 1.4} ${bottom + 1.6} Z`} className="jon-balloon-knot"/>
            <ellipse cx={x} cy={cy} rx={rx} ry={ry} className="jon-balloon"/>
            <ellipse cx={x - rx * 0.42} cy={cy - ry * 0.45} rx={rx * 0.2} ry={ry * 0.32}
                transform={`rotate(25 ${x - rx * 0.42} ${cy - ry * 0.45})`} className="jon-balloon-shine"/>
            <g className="part eyes">
                <circle cx={x - r * 0.3} cy={cy - r * 0.08} r={r * 0.17} className="jon-face-ink"/>
                <circle cx={x + r * 0.3} cy={cy - r * 0.08} r={r * 0.17} className="jon-face-ink"/>
            </g>
            <path d={`M${x - r * 0.38} ${cy + r * 0.3} q${r * 0.38} ${r * 0.36} ${r * 0.76} 0`} className="jon-smile" style={{strokeWidth: Math.max(1.2, r * 0.2)}}/>
        </g>
    );
}

function Tied() {
    return (
        <>
            {/* the knot at the belt, and a short string up to a head held close */}
            <circle cx={24.5} cy={62.5} r={1.8} className="jon-knot"/>
            <path d="M24.5 61 q6 -4 -3 -8" className="jon-string"/>
            <path d="M12 62 L8 70 M24 62 L28 70" className="jon-arm"/>
            <rect x={6} y={68} width={24} height={8} rx={1.2} className="jon-work"/>
            <path d="M10 71h8M10 73.5h12" className="jon-work-lines"/>
            <g className="part jon-bob"><Head x={18} y={44} r={9}/></g>
        </>
    );
}

function Mindful() {
    return (
        <>
            <circle cx={18} cy={63} r={1.8} className="jon-knot"/>
            <path d="M18 61.5 q-5 -4 0 -8" className="jon-string"/>
            <path d="M12 63 L7 76 M24 63 L29 76" className="jon-arm"/>
            <g className="part jon-breathe"><Head x={18} y={44} r={9}/></g>
        </>
    );
}

const spiderSize = 11;

function Aloft({y, spider}: {y: number, spider?: StringSpider}) {
    //spider centred on the string: at the wrist, or just under your head
    const wrist = {x: 31.5, y: 55};
    const high = {x: 32, y: y + 14};
    const at = spider === "tug" || spider === "ask" ? high : wrist;
    return (
        <>
            <path d="M12 62 L7 74" className="jon-arm"/>
            <path d="M24 62 L31 51" className="jon-arm"/>
            {/* the string runs from the hand up to the head; the pair sways like a kite, and the spider rides it */}
            <g className="part jon-kite">
                <path d={`M31 50 C34 ${(50 + y) / 2 + 4} 28 ${(50 + y) / 2 - 4} 32 ${y + 8}`} className="jon-string"/>
                <g className={spider === "tug" ? "part jon-tugged" : undefined}><Head x={32} y={y} r={8}/></g>
                {spider && (
                    <g className={`jon-spider jon-spider-${spider}`}
                        style={{["--climb" as string]: `${high.y - wrist.y}px`}}>
                        <Spider size={spiderSize} doing={spider === "wrist" ? "idle" : spider}
                            x={at.x - spiderSize / 2} y={at.y - spiderSize / 2}/>
                    </g>
                )}
            </g>
        </>
    );
}
