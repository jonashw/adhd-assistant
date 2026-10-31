import { CrewSvg, Eye, ShutEye } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";

/* The robot spider. It does all the string travel: climbing with notes, tugging, and asking "Gusty up there?" */
export type SpiderDoing = "idle" | "climb" | "tug" | "ask" | "curled";

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-tap", ms: 700, weight: 2},
    {name: "is-shuffle", ms: 600, weight: 1},
    {name: "is-preen", ms: 1000, weight: 1}
];

const legs: {d: string, side: "l" | "r", n: number}[] = [
    {d: "M18 22 L10 14 L6 18", side: "l", n: 1},
    {d: "M16.5 26.5 L7 22 L3 28", side: "l", n: 2},
    {d: "M16 31 L7 34 L3 41", side: "l", n: 3},
    {d: "M18 35.5 L11 42 L9 47", side: "l", n: 4},
    {d: "M30 22 L38 14 L42 18", side: "r", n: 1},
    {d: "M31.5 26.5 L41 22 L45 28", side: "r", n: 2},
    {d: "M32 31 L41 34 L45 41", side: "r", n: 3},
    {d: "M30 35.5 L37 42 L39 47", side: "r", n: 4}
];

const tuckedLegs = [
    "M17 25 L12 23 L13 29", "M16.5 31 L11 33 L15 36",
    "M31 25 L36 23 L35 29", "M31.5 31 L37 33 L33 36"
];

export function Spider({size = 24, doing = "idle"}: {size?: number, doing?: SpiderDoing}) {
    const curled = doing === "curled";
    const onString = doing === "climb" || doing === "tug" || doing === "ask";
    const fidget = useFidget(fidgets, [1500, 4500], !curled && doing !== "climb");
    const label = doing === "tug" ? "Robot spider, tugging the string"
        : doing === "ask" ? "Robot spider, asking"
        : doing === "climb" ? "Robot spider, climbing the string"
        : curled ? "Robot spider, curled up"
        : "Robot spider";
    return (
        <CrewSvg width={48} height={48} size={size} label={label} classes={["crew-spider", `doing-${doing}`, fidget]}>
            {onString && <line x1={24} y1={0} x2={24} y2={17} className="part spider-thread"/>}
            <g className="part spider-body">
                {curled
                    ? tuckedLegs.map(d => <path key={d} d={d} className="spider-leg"/>)
                    : legs.map(leg => <path key={leg.d} d={leg.d} className={`part spider-leg leg-${leg.side}${leg.n}`}/>)}
                <g className="part spider-abdomen">
                    <ellipse cx={24} cy={32} rx={curled ? 9 : 10} ry={curled ? 8 : 9} className="spider-shell"/>
                    <path d="M16 31 Q24 36 32 31" className="crew-seam"/>
                    <circle cx={24} cy={37} r={1.3} className="crew-led"/>
                    <circle cx={18.5} cy={28} r={0.8} className="crew-rivet"/>
                    <circle cx={29.5} cy={28} r={0.8} className="crew-rivet"/>
                </g>
                <g className="part spider-head">
                    <ellipse cx={24} cy={22} rx={7} ry={6} className="spider-shell-dark"/>
                    <path d="M21.5 27 L22.5 29.5 M26.5 27 L25.5 29.5" className="spider-fang"/>
                    <g className="part eyes">
                        {curled
                            ? <><ShutEye x={21} y={21} w={3}/><ShutEye x={27} y={21} w={3}/></>
                            : <>
                                <Eye x={21} y={21.5} r={1.7}/>
                                <Eye x={27} y={21.5} r={1.7}/>
                                <Eye x={19.2} y={18.4} r={0.8}/>
                                <Eye x={28.8} y={18.4} r={0.8}/>
                            </>}
                    </g>
                </g>
            </g>
        </CrewSvg>
    );
}
