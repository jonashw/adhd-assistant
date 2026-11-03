import { Eye } from "../crew/CrewSvg";
import "./rabbit.css";

/* The rabbit hole picture: a robot rabbit pops up through holes in three layers of ground, each one deeper,
   trailing a string behind it like breadcrumbs, so the way back home is always marked.
   It pops through each hole in turn; with reduced motion on, it waits at the deepest hole. */

const holes = [
    {x: 18, y: 22},
    {x: 38, y: 38},
    {x: 58, y: 54}
];

function RabbitHead({x, y, className}: {x: number, y: number, className: string}) {
    return (
        <g className={`rabbit-pop ${className}`} style={{transformOrigin: `${x}px ${y}px`}}>
            <g transform={`translate(${x} ${y}) scale(1.35)`}>
                <g className="rabbit-ears">
                    <rect x={-5.5} y={-19} width={3.6} height={11} rx={1.8} className="rabbit-body" transform="rotate(-12 -3.7 -8)"/>
                    <rect x={-4.7} y={-17} width={1.6} height={7} rx={0.8} className="rabbit-inner" transform="rotate(-12 -3.7 -8)"/>
                    <rect x={1.9} y={-19} width={3.6} height={11} rx={1.8} className="rabbit-body" transform="rotate(12 3.7 -8)"/>
                    <rect x={3.1} y={-17} width={1.6} height={7} rx={0.8} className="rabbit-inner" transform="rotate(12 3.7 -8)"/>
                </g>
                <rect x={-6.5} y={-9.5} width={13} height={10} rx={4.5} className="rabbit-body"/>
                <rect x={-4.5} y={-7} width={9} height={4.2} rx={2} className="rabbit-visor"/>
                <Eye x={-2.2} y={-4.9} r={0.9}/>
                <Eye x={2.2} y={-4.9} r={0.9}/>
                <circle cx={0} cy={-1.6} r={0.9} className="rabbit-nose"/>
            </g>
        </g>
    );
}

export function RabbitHoles({size = 48}: {size?: number}) {
    const w = 72, h = 62;
    //the string: from HOME at the top left, down through each hole, to the deepest one
    const string = `M6 8 C10 8 12 14 ${holes[0].x} ${holes[0].y}
        C${holes[0].x + 4} ${holes[0].y + 8} ${holes[1].x - 12} ${holes[1].y - 6} ${holes[1].x} ${holes[1].y}
        C${holes[1].x + 4} ${holes[1].y + 8} ${holes[2].x - 12} ${holes[2].y - 6} ${holes[2].x} ${holes[2].y}`;
    return (
        <svg className="rabbit-holes" viewBox={`0 0 ${w} ${h}`} width={size * w / h} height={size} role="img"
            aria-label="A robot rabbit popping up through holes, trailing a string back home">
            <title>A robot rabbit popping up through holes, trailing a string back home</title>
            <circle cx={6} cy={8} r={4} className="rabbit-home"/>
            {holes.map((hole, i) =>
                <g key={i}>
                    <rect x={0} y={hole.y} width={w} height={h - hole.y} className={`rabbit-ground rabbit-ground-${i}`}/>
                    <rect x={0} y={hole.y - 0.8} width={w} height={1.6} className="rabbit-grass"/>
                </g>)}
            <path d={string} className="rabbit-string" fill="none"/>
            {holes.map((hole, i) =>
                <g key={i}>
                    <ellipse cx={hole.x} cy={hole.y} rx={9} ry={3} className="rabbit-hole"/>
                    <RabbitHead x={hole.x} y={hole.y} className={`rabbit-at-${i}`}/>
                    {/* the hole's near lip hides the rabbit's lower half */}
                    <path d={`M${hole.x - 9} ${hole.y} A9 3 0 0 0 ${hole.x + 9} ${hole.y} Z`} className={`rabbit-ground rabbit-ground-${i}`}/>
                </g>)}
        </svg>
    );
}
