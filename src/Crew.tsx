import React from "react";
/* The robot crew. Each crew member is its own component in src/crew, drawn as SVG in code and moved with CSS,
   so any one of them can be swapped for a Rive or Lottie file later without touching the screens that use them. */
import { Dog, DogDoing } from "./crew/Dog";
import { Spider, SpiderDoing } from "./crew/Spider";
import { Squirrel, SquirrelDoing } from "./crew/Squirrel";
import { Sloth } from "./crew/Sloth";
import { Jon, JonDoing, JonMotion, StringSpider } from "./crew/Jon";
import { RabbitBurrow, RabbitBurrowLoop } from "./crew/Rabbit";
import { Yanchi, YanchiFace } from "./crew/Yanchi";

export { Dog, Spider, Squirrel, Sloth, Jon, RabbitBurrow, RabbitBurrowLoop, Yanchi };
export type { DogDoing, SpiderDoing, SquirrelDoing, JonDoing, JonMotion, StringSpider, YanchiFace };

/* what the crew is up to around you: resting by you while you work, standing by while you're aloft,
   joining the tug, getting up, or following you as you walk */
export type CrewMode = "rest" | "standby" | "tug" | "rouse" | "walk";

type Who = "dog" | "spider" | "squirrel" | "sloth";

/* One crew member by name, at a given height in px */
export function CrewIcon({who, size = 24}: {who: Who, size?: number}) {
    switch (who) {
        case "dog": return <Dog size={size}/>;
        case "spider": return <Spider size={size}/>;
        case "squirrel": return <Squirrel size={size}/>;
        case "sloth": return <Sloth size={size}/>;
    }
}

/* Mindful: the dog curled up, the squirrel curled on the dog, the spider curled on the squirrel */
export function CrewAtRest({size = 48}: {size?: number}) {
    const u = size / 48;
    return (
        <span style={{position: "relative", display: "inline-block", width: 64 * u, height: 48 * u}} data-testid="crew-at-rest">
            <span style={{position: "absolute", left: 0, top: 0}}><Dog size={size} doing="curled"/></span>
            <span style={{position: "absolute", left: 13 * u, top: -2 * u}}><Squirrel size={34 * u} doing="curled"/></span>
            <span style={{position: "absolute", left: 22 * u, top: 0.5 * u}}><Spider size={16 * u} doing="curled"/></span>
        </span>
    );
}

/* You and the crew on the ground, travel reading left to right: spider, squirrel, dog, then you.
   Tied off, the dog has settled at your feet; aloft, the spider rides your wrist.
   Facing left (walking home), the whole line turns round, so you lead to the left. */
export function YouScene({size = 56, aloft, stringOut = 0, spider, doing, motion, crew, facing = "right"}: {
    size?: number,
    aloft: boolean,
    stringOut?: number,
    /* aloft, where the spider is on your string (it rides your wrist unless told otherwise) */
    spider?: StringSpider,
    /* what you're doing, when it's more than tied off or aloft (the demo's moves between states) */
    doing?: JonDoing,
    motion?: JonMotion,
    crew?: CrewMode,
    facing?: "left" | "right"
}) {
    const you: JonDoing = doing ?? (aloft ? "aloft" : "tied");
    const mode: CrewMode = crew ?? (aloft ? "standby" : "rest");
    //aloft, the spider rides your wrist; on the ground it walks with the others
    const spiderOnString = you === "aloft";
    return (
        <span style={{
            display: "inline-flex", alignItems: "flex-end", gap: size * 0.02, lineHeight: 0,
            transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)", transition: "transform 700ms ease-in-out"
        }} data-testid="you-scene" data-facing={facing}>
            {!spiderOnString && <Spider size={size * 0.2} doing={mode === "walk" ? "walk" : "idle"}/>}
            <Squirrel size={size * 0.3} doing={mode === "tug" ? "jump" : mode === "walk" ? "hop" : "idle"}/>
            <span style={{marginRight: mode === "tug" ? -size * 0.1 : 0, lineHeight: 0}}>
                <Dog size={size * 0.4} doing={
                    mode === "rest" ? "curled"
                    : mode === "tug" ? "pull"
                    : mode === "rouse" ? "rouse"
                    : mode === "walk" ? "trail"
                    : "idle"}/>
            </span>
            <Jon size={size} doing={you} motion={motion} stringOut={stringOut} spider={spiderOnString ? spider ?? "wrist" : undefined}/>
        </span>
    );
}

/* Mindful: you at HOME with empty hands, the dog curled against your leg, the squirrel on the dog, the spider on the squirrel */
export function MindfulScene({size = 80}: {size?: number}) {
    //tap them and they all wiggle
    const [poked, setPoked] = React.useState(false);
    React.useEffect(() => {
        if (!poked) return;
        const timer = window.setTimeout(() => setPoked(false), 1800);
        return () => window.clearTimeout(timer);
    }, [poked]);
    return (
        <span
            className={poked ? "crew-poked" : undefined}
            onClick={() => setPoked(true)}
            style={{display: "inline-flex", alignItems: "flex-end", lineHeight: 0, cursor: "pointer"}}
            data-testid="mindful-scene">
            <span style={{marginRight: -size * 0.12}}><CrewAtRest size={size * 0.42}/></span>
            <Jon size={size} doing="mindful"/>
        </span>
    );
}

/* Where your head floats for each level of string out, in your drawing's own units (it is 96 tall):
   level 0 is tied off, head held close; levels 1..5 are string out, matching Jon's headY */
const levelHeadY = (level: number) => level === 0 ? 42.5 : 32.5 - Math.min(5, level) * 5;
const levels = [0, 1, 2, 3, 4, 5];

/* The stage: the ground the crew walks on, you at the head of the line, the graduations beside you that read
   how far up your head is, and a cloud round your head when it has gone up into one (the rabbit hole).
   It is as wide as the crew in line; give it a width ("100%") to stretch the ground further left. */
export function YouStage({height = 96, width, aloft, stringOut = 0, inClouds = false, spider, doing, motion, crew, facing, cloud, walking}: {
    spider?: StringSpider,
    doing?: JonDoing,
    motion?: JonMotion,
    crew?: CrewMode,
    facing?: "left" | "right",
    /* "rolling": the cloud is still sliding in round your head (drifting into the clouds) */
    cloud?: "rolling",
    /* the ground moves under you; walking "to" a place, its work lies on the ground ahead and comes closer */
    walking?: "to" | "home",
    height?: number,
    width?: number | string,
    aloft: boolean,
    stringOut?: number,
    /* head in the clouds: long enough or far enough up that the spider would tug */
    inClouds?: boolean
}) {
    const ground = 4;
    const jonSize = height - ground - 2;
    const u = jonSize / 96;
    const gaugeWidth = 18;
    const gap = 6;
    const level = aloft ? Math.max(1, Math.min(5, stringOut)) : 0;
    const top = height - ground - jonSize;
    const yOf = (l: number) => top + levelHeadY(l) * u;
    //your head, in px from the stage's right edge and top: aloft it rides at x 32 of your 40-wide drawing, tied at 18
    const headRight = gaugeWidth + gap + (40 - (aloft ? 32 : 18)) * u;
    const headTop = yOf(level);
    const cloudW = 34 * u * 1.6;
    const label = aloft
        ? `Your head is ${level} of 5 levels up${inClouds ? ", in the clouds" : ""}`
        : "Tied off: your head is held close";
    return (
        <span
            style={{position: "relative", display: "inline-block", width, height, lineHeight: 0, paddingRight: gaugeWidth + gap + (walking === "to" ? 30 * u : 0), paddingLeft: 4, boxSizing: "border-box"}}
            data-testid="you-stage"
            data-level={level}
            data-in-clouds={inClouds || undefined}
        >
            {/* the ground; walking, it slides by under you */}
            <span
                className={walking ? `crew-ground crew-ground-${walking}` : undefined}
                style={{position: "absolute", left: 0, right: 0, bottom: ground - 2, height: 2, background: "#a9b4bf", borderRadius: 1}}/>
            {/* walking to a place: its work lies on the ground ahead, coming closer */}
            {walking === "to" && <svg aria-hidden="true" viewBox="0 0 24 8" width={24 * u} height={8 * u}
                className="crew-work-ahead"
                style={{position: "absolute", right: gaugeWidth + gap, bottom: ground}}>
                <rect x={0.6} y={0.6} width={22.8} height={6.8} rx={1.2} fill="#f7e1cc" stroke="#9a5216" strokeWidth={1.2}/>
                <path d="M4 3h8M4 5.5h12" fill="none" stroke="#9a5216" strokeWidth={0.7} opacity={0.6}/>
            </svg>}
            {/* you and the crew, travel reading left to right */}
            <span style={width
                ? {position: "absolute", right: gaugeWidth + gap, top}
                : {display: "inline-block", marginTop: top}}>
                <YouScene size={jonSize} aloft={aloft} stringOut={stringOut} spider={spider}
                    doing={doing} motion={motion} crew={crew} facing={facing}/>
            </span>
            {/* head in the clouds */}
            {inClouds && <svg
                aria-hidden="true"
                viewBox="0 0 40 18"
                width={cloudW}
                height={cloudW * 18 / 40}
                style={{position: "absolute", right: headRight - cloudW / 2, top: headTop - cloudW * 18 / 40 * 0.45, pointerEvents: "none"}}
                className={cloud === "rolling" ? "crew-cloud-rolling" : undefined}
                data-testid="you-cloud"
            >
                <g fill="#e3e7ec" opacity={0.95}>
                    <ellipse cx={20} cy={8} rx={14} ry={7}/>
                    <ellipse cx={10} cy={12} rx={9} ry={5}/>
                    <ellipse cx={30} cy={12} rx={9} ry={5}/>
                </g>
            </svg>}
            {/* the graduations: one mark per level, the one your head is at drawn bold */}
            <svg
                role="img"
                aria-label={label}
                width={gaugeWidth}
                height={height}
                style={{position: "absolute", right: 0, top: 0}}
                data-testid="you-gauge"
            >
                <title>{label}</title>
                <line x1={gaugeWidth - 4} y1={yOf(5) - 3} x2={gaugeWidth - 4} y2={yOf(0) + 3} stroke="#d9d4c7" strokeWidth={1}/>
                {levels.map(l => l === level
                    ? <line key={l} x1={2} y1={yOf(l)} x2={gaugeWidth} y2={yOf(l)} stroke="#2b5e94" strokeWidth={2.5} strokeLinecap="round"/>
                    : <line key={l} x1={gaugeWidth - 9} y1={yOf(l)} x2={gaugeWidth} y2={yOf(l)} stroke="#a9b4bf" strokeWidth={1.2}/>)}
            </svg>
        </span>
    );
}
