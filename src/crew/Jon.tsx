import { CrewSvg } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";
import { Spider } from "./Spider";
import { art } from "./art.generated";

/* You, the scout. The head scouts, the body does: tied off, both hands hold the work and the head stays close;
   aloft, one hand holds the string and the head floats up, higher the more string is out. Mindful: hands empty. */
export type JonDoing = "tied" | "aloft" | "mindful"
    /* both hands at the knot, the work set down at your feet, head still close */
    | "untying"
    /* both hands at one side of the belt, wiggling the knot tight; the work still at your feet */
    | "tying"
    /* crouching for the work at your feet and rising with it in both hands (plays once) */
    | "pickup"
    /* the reverse: crouching to lay the work down at your feet (plays once) */
    | "setdown"
    /* standing with empty hands, the work at your feet */
    | "standing"
    /* walking, empty hands swinging, head close */
    | "walk";
/* how your head moves aloft: bobbing and waving as it floats up, turning to look as it scouts,
   swaying hard as it drifts, or swinging as you pull the string in hand over hand */
export type JonMotion = "float" | "scout" | "drift" | "reel";
/* where the spider is on your string, aloft: riding your wrist, climbing, tugging, or up by your head asking */
export type StringSpider = "wrist" | "climb" | "tug" | "ask";

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-look", ms: 1400, weight: 1}
];

/* head height for string out 0..5 */
const headY = (level: number) => 34 - Math.min(5, Math.max(1, level)) * 5;

export function Jon({size = 48, doing = "tied", stringOut = 1, spider, motion}: {
    size?: number,
    doing?: JonDoing,
    motion?: JonMotion,
    /* how many steps of string are out, aloft */
    stringOut?: number,
    /* aloft, the spider travels your string: it rides the wrist of your string hand until it carries something up */
    spider?: StringSpider
}) {
    const fidget = useFidget(fidgets, [2000, 6000]);
    const label = doing === "aloft" ? `You, aloft with ${stringOut} step(s) of string out`
        : doing === "mindful" ? "You, standing at HOME with empty hands"
        : doing === "untying" ? "You, untying the knot at your belt"
        : doing === "tying" ? "You, tying the string off at your belt"
        : doing === "pickup" ? "You, picking up the work"
        : doing === "setdown" ? "You, setting the work down"
        : doing === "standing" ? "You, standing by the work"
        : doing === "walk" ? "You, walking"
        : "You, tied off with both hands on the work";
    const legs = doing === "walk"
        ? <><path d="M14.5 80v12" className="part jon-leg jon-leg-a"/><path d="M21.5 80v12" className="part jon-leg jon-leg-b"/></>
        : <path d="M14.5 80v12M21.5 80v12" className="part jon-leg jon-legs"/>;
    return (
        <CrewSvg width={40} height={96} size={size} label={label}
            classes={["crew-jon", `doing-${doing}`, motion && `motion-${motion}`, doing === "aloft" && spider && `spider-${spider}`, fidget]}>
            {/* the work, set down at your feet (aloft, it's what you set down) */}
            {(doing === "untying" || doing === "tying" || doing === "standing" || doing === "aloft") && <Work x={20} y={84}/>}
            {legs}
            {/* everything above the hips crouches together when you pick the work up or set it down */}
            <g className="part jon-upper">
                <rect x={11.5} y={59} width={13} height={22} rx={3} className="jon-jacket"/>
                <line x1={18} y1={61} x2={18} y2={80} className="crew-seam"/>
                {doing === "tied" && <Tied/>}
                {doing === "mindful" && <Mindful/>}
                {doing === "aloft" && <Aloft y={headY(stringOut)} spider={spider}/>}
                {(doing === "untying" || doing === "tying") && <AtTheKnot side={doing === "tying" ? "left" : "right"}/>}
                {(doing === "pickup" || doing === "setdown") && <Lift/>}
                {doing === "standing" && <Mindful bob/>}
                {doing === "walk" && <Walk/>}
            </g>
            {(doing === "pickup" || doing === "setdown") && <g className="part jon-lifted"><Work y={68}/></g>}
        </CrewSvg>
    );
}

/* the work: a box held in both hands, or lying on the ground */
function Work({x = 6, y}: {x?: number, y: number}) {
    return (
        <>
            <rect x={x} y={y} width={24} height={8} rx={1.2} className="jon-work"/>
            <path d={`M${x + 4} ${y + 3}h8M${x + 4} ${y + 5.5}h12`} className="jon-work-lines"/>
        </>
    );
}

/* the head held close on a short string from the knot at your belt */
function CloseHead({className = "jon-bob"}: {className?: string}) {
    return (
        <>
            <circle cx={24.5} cy={62.5} r={1.8} className="jon-knot"/>
            <path d="M24.5 61 q6 -4 -3 -8" className="jon-string"/>
            <g className={`part ${className}`}><Head x={18} y={44} r={9}/></g>
        </>
    );
}

/* both hands at the belt: at the knot to untie it, or round to one side, working it tight */
function AtTheKnot({side}: {side: "left" | "right"}) {
    return (
        <>
            <CloseHead/>
            <g className="part jon-fiddle">
                {/* elbows out, so the arms read against the jacket; the hands meet at the knot */}
                {side === "right"
                    ? <>
                        <path d="M12 62 L5 67 L21 64.5" className="jon-arm"/>
                        <path d="M24 62 L30 66 L26.5 64.5" className="jon-arm"/>
                        <circle cx={22} cy={64.5} r={1.6} className="jon-hand"/>
                        <circle cx={26.5} cy={64.5} r={1.6} className="jon-hand"/>
                    </>
                    : <>
                        <path d="M12 62 L6 64 L10 69" className="jon-arm"/>
                        <path d="M24 62 L28 70 L13.5 69" className="jon-arm"/>
                        <circle cx={10} cy={69} r={1.6} className="jon-hand"/>
                        <circle cx={13.5} cy={69} r={1.6} className="jon-hand"/>
                    </>}
            </g>
        </>
    );
}

/* reaching down: the arms swing down to the work while the body crouches (CSS plays the move) */
function Lift() {
    return (
        <>
            <CloseHead className="jon-hold"/>
            <path d="M12 62 L8 70 M24 62 L28 70" className="part jon-arm jon-reach"/>
        </>
    );
}

function Walk() {
    return (
        <>
            <CloseHead/>
            <path d="M12 62 L9 74" className="part jon-arm jon-swing-a"/>
            <path d="M24 62 L27 74" className="part jon-arm jon-swing-b"/>
        </>
    );
}

/* Your head is a balloon: the head scouts, floating on the string the body holds.
   Drawn from Jon's own art: art/you/balloon.svg, wearing art/you/face.svg (see art/README.md). */
const balloonFace = (() => {
    const box = art.balloon.anchors.face;
    const [fx, fy, fw, fh] = art.face.viewBox;
    const scale = Math.min(box.width / fw, box.height / fh);
    //centre the face's frame on the balloon's face box
    return `translate(${box.x + box.width / 2} ${box.y + box.height / 2}) scale(${scale}) translate(${-(fx + fw / 2)} ${-(fy + fh / 2)})`;
})();
const faceMarkup = Object.values(art.face.layers).join("");

export function Head({x, y, r}: {x: number, y: number, r: number}) {
    //the balloon's art is drawn with its centre at 0,0 and a radius of 10
    return (
        <g className="part jon-head">
            <g transform={`translate(${x} ${y - 1.5}) scale(${r / 10})`}>
                <g dangerouslySetInnerHTML={{__html: art.balloon.art}}/>
                <g transform={balloonFace} dangerouslySetInnerHTML={{__html: faceMarkup}}/>
            </g>
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

function Mindful({bob}: {bob?: boolean}) {
    if (bob) {
        //standing by the work, still tied at the belt
        return (
            <>
                <CloseHead/>
                <path d="M12 63 L7 76 M24 63 L29 76" className="jon-arm"/>
            </>
        );
    }
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
            <path d="M12 62 L7 74" className="part jon-arm jon-arm-free"/>
            <path d="M24 62 L31 51" className="part jon-arm jon-arm-string"/>
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
