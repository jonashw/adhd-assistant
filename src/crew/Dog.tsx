import React from "react";
import { CrewSvg, Eye, ShutEye } from "./CrewSvg";
import { Fidget, useFidget, usePrefersReducedMotion } from "./useFidget";

/* The robot golden retriever. It trails Jon a beat behind, settles at his feet on arrival, and curls up when he's Mindful. */
export type DogDoing = "idle" | "trail" | "settle" | "curled";

const fidgets: Fidget[] = [
    {name: "is-blink", ms: 220, weight: 3},
    {name: "is-ear", ms: 600, weight: 2},
    {name: "is-wag", ms: 1100, weight: 2},
    {name: "is-tilt", ms: 1200, weight: 1},
    {name: "is-sniff", ms: 900, weight: 1}
];
const sleepFidgets: Fidget[] = [
    {name: "is-ear", ms: 600, weight: 1},
    {name: "is-dream", ms: 900, weight: 1}
];

const settleMs = 1000;

export function Dog({size = 24, doing = "idle"}: {size?: number, doing?: DogDoing}) {
    //settling plays once: the dog sinks down, then curls up
    const reduced = usePrefersReducedMotion();
    const [settled, setSettled] = React.useState(doing === "curled" || (doing === "settle" && reduced));
    React.useEffect(() => {
        if (doing === "settle" && !reduced) {
            setSettled(false);
            const timer = window.setTimeout(() => setSettled(true), settleMs);
            return () => window.clearTimeout(timer);
        }
        setSettled(doing === "curled" || doing === "settle");
    }, [doing, reduced]);
    const curled = settled;
    const fidget = useFidget(curled ? sleepFidgets : fidgets, curled ? [5000, 12000] : [1800, 5000], doing !== "trail");
    const label = curled ? "Robot dog, curled up" : "Robot dog";
    return (
        <CrewSvg width={64} height={48} size={size} label={label}
            classes={["crew-dog", `doing-${curled ? "curled" : doing}`, fidget]}>
            {curled ? <CurledDog/> : <StandingDog/>}
        </CrewSvg>
    );
}

function Leg({x, near, className}: {x: number, near: boolean, className: string}) {
    return (
        <g className={`part dog-leg ${className}`}>
            <rect x={x} y={30} width={5} height={13} rx={2.5} className={near ? "dog-fur" : "dog-fur-dark"}/>
            <rect x={x - 1} y={42} width={7} height={4} rx={2} className="crew-metal-dark"/>
        </g>
    );
}

function StandingDog() {
    return (
        <g className="part dog-all">
            <path className="part dog-tail dog-fur"
                d="M17 24 C10 22 6 16 3 9 C7 12 10 14 12 15 C9 11 8 8 8 4 C12 10 16 16 19 21 Z"/>
            <Leg x={22} near={false} className="leg-back-far"/>
            <Leg x={42} near={false} className="leg-front-far"/>
            <g className="part dog-body">
                <rect x={13} y={19} width={34} height={15} rx={7.5} className="dog-fur"/>
                <rect x={20} y={29} width={18} height={3} rx={1.5} className="crew-metal"/>
                <line x1={30} y1={20} x2={30} y2={29} className="crew-seam"/>
                <circle cx={16.5} cy={22.5} r={0.9} className="crew-rivet"/>
                <circle cx={43.5} cy={22.5} r={0.9} className="crew-rivet"/>
                <path d="M40 31 C41 35 44 36 46 33 Z" className="dog-fur"/>
            </g>
            <Leg x={17} near={true} className="leg-back-near"/>
            <Leg x={37} near={true} className="leg-front-near"/>
            <g className="part dog-head">
                <rect x={41} y={16} width={6} height={9} rx={2} className="crew-metal-dark"/>
                <circle cx={44} cy={23} r={1.3} className="crew-led"/>
                <line x1={51} y1={8} x2={52} y2={3} className="crew-antenna"/>
                <circle cx={52} cy={2.6} r={1.5} className="crew-led"/>
                <rect x={42} y={7} width={16} height={15} rx={6} className="dog-fur"/>
                <rect x={53} y={14} width={10} height={8} rx={3.5} className="dog-fur"/>
                <rect x={54} y={17.5} width={8} height={4} rx={2} className="crew-metal"/>
                <ellipse cx={61.5} cy={15.5} rx={1.8} ry={1.4} className="crew-ink"/>
                <path d="M55 20.6 Q58 21.9 61 20.6" className="crew-line"/>
                <rect x={46.5} y={10} width={8} height={6} rx={2.5} className="crew-ink"/>
                <g className="part eyes"><Eye x={51} y={13} r={1.6}/></g>
                <path className="part dog-ear dog-fur-dark"
                    d="M45 8 C40 9 39 14 40 20 C41 23.5 44.5 23.5 45.5 20 C46.5 16 46.5 11 45 8 Z"/>
            </g>
        </g>
    );
}

function CurledDog() {
    return (
        <g className="part dog-all">
            <g className="part dog-breathe">
                <ellipse cx={30} cy={37} rx={22} ry={9.5} className="dog-fur"/>
                <path d="M16 33 Q30 28 44 33" className="crew-seam"/>
                <circle cx={20} cy={35} r={0.9} className="crew-rivet"/>
                <circle cx={36} cy={33.5} r={0.9} className="crew-rivet"/>
                <circle cx={28} cy={33} r={1.2} className="crew-led"/>
            </g>
            <path className="part dog-tail dog-fur-dark"
                d="M10 37 C7 47 30 49 46 44 C34 44.5 18 44 13 35 Z"/>
            <g className="part dog-head">
                <line x1={48} y1={27} x2={45.5} y2={22} className="crew-antenna"/>
                <circle cx={45.3} cy={21.6} r={1.4} className="crew-led"/>
                <rect x={40} y={26} width={16} height={13} rx={6} className="dog-fur"/>
                <rect x={51} y={31.5} width={10} height={7.5} rx={3} className="dog-fur"/>
                <rect x={52} y={34.5} width={8} height={3.5} rx={1.75} className="crew-metal"/>
                <ellipse cx={59.6} cy={33} rx={1.6} ry={1.3} className="crew-ink"/>
                <rect x={44.5} y={29} width={7.5} height={5} rx={2} className="crew-ink"/>
                <g className="part eyes"><ShutEye x={48.2} y={31.2} w={4}/></g>
                <path className="part dog-ear dog-fur-dark"
                    d="M42.5 27 C38.5 28 38 33 40 37 C41.5 39 44 38 44.5 34.5 Z"/>
            </g>
            <rect x={45} y={40} width={13} height={4.5} rx={2.2} className="crew-metal-dark"/>
        </g>
    );
}
