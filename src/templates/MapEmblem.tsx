import { Dog, Squirrel } from "../Crew";
import { ClaudeMapIcon } from "../ClaudeMapIcon";
import { Head } from "../crew/Jon";
import { RabbitBody } from "../crew/Rabbit";
import "../crew/crew.css";
import "../crew/rabbit.css";
import "../crew/balloon.css";
import { CrewLead } from "./templates";

/* One character for each starter map, drawn the way the map opens: the rabbit by a single hole for the burrow,
   Balloon-head under a single cloud for the walk, and the crew member who leads the rest. */

function RabbitByHole({size}: {size: number}) {
    return (
        <svg className="crew crew-rabbit" viewBox="-16 -24 40 30" width={size * 40 / 30} height={size} role="img" aria-label="The rabbit by its hole">
            <rect x={-16} y={0} width={40} height={6} className="burrow-band-1"/>
            <rect x={-16} y={-1} width={40} height={2} className="burrow-grass"/>
            <path d="M13 -0.6 Q16.5 -4 20 -0.6 Z" className="burrow-spoil"/>
            <ellipse cx={12} cy={0.6} rx={5.6} ry={2} className="burrow-hole"/>
            <g transform="translate(0 0)"><RabbitBody carrying={false}/></g>
        </svg>
    );
}

function BalloonUnderCloud({size}: {size: number}) {
    return (
        <svg className="crew crew-jon balloon-trail" viewBox="0 0 48 64" width={size * 48 / 64} height={size} role="img" aria-label="Balloon-head under a cloud">
            <g className="trail-cloud-place is-lit">
                {["trail-cloud-edge", "trail-cloud"].map(cls =>
                    <g key={cls} className={cls} style={{strokeWidth: 1.4}}>
                        <rect x={8} y={7} width={32} height={9} rx={4.5}/>
                        <circle cx={17} cy={8.5} r={5}/>
                        <circle cx={26} cy={6.5} r={6.2}/>
                        <circle cx={33} cy={9.5} r={4.2}/>
                    </g>)}
            </g>
            <path d="M14 63v-9M19 63v-9" className="jon-leg"/>
            <rect x={11.5} y={40} width={10} height={15} rx={2.4} className="jon-jacket"/>
            <path d="M12 43 L8 51" className="jon-arm"/>
            <path d="M21 43 L26 36" className="jon-arm"/>
            <path d="M26 36 Q29.5 33.5 30 30.5" className="jon-string"/>
            <Head x={30} y={24} r={6.5}/>
        </svg>
    );
}

export function MapEmblem({crew, size = 56}: {crew: CrewLead, size?: number}) {
    switch (crew) {
        case "tour": return <BalloonUnderCloud size={size}/>;
        case "rabbit": return <RabbitByHole size={size * 0.8}/>;
        case "dog": return <Dog size={size * 0.75}/>;
        case "squirrel": return <Squirrel size={size * 0.75}/>;
        case "spider":
        case "claude": return <ClaudeMapIcon size={size * 0.7}/>;
        case "sloth":
        case "none": return <img src="/Enso.svg" width={size * 0.8} height={size * 0.8} alt="An enso"/>;
        case "review": return <img src="/review.svg" width={size * 0.8} height={size * 0.8} alt="A week on a calendar inside a looping arrow"/>;
    }
}
