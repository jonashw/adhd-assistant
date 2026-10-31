import { CrewSvg, Eye } from "./CrewSvg";
import { Fidget, useFidget } from "./useFidget";

/* The robot sloth. It never moves from HOME: it hangs by all four limbs in a banana curve, sways, blinks slowly and yawns. */
const fidgets: Fidget[] = [
    {name: "is-blink", ms: 900, weight: 3},
    {name: "is-yawn", ms: 2800, weight: 1},
    {name: "is-look", ms: 2600, weight: 1}
];

const limbs = [
    {x: 18, to: [20, 22], far: false},
    {x: 24, to: [25, 25], far: true},
    {x: 40, to: [39, 25], far: true},
    {x: 46, to: [44, 22], far: false}
];

/* bar: draw the branch it hangs from; leave it off when something else (the enso) is the branch */
export function Sloth({size = 24, bar = true}: {size?: number, bar?: boolean}) {
    const fidget = useFidget(fidgets, [4000, 11000]);
    return (
        <CrewSvg width={64} height={48} size={size} label="Robot sloth, hanging at HOME" classes={["crew-sloth", fidget]}>
            {bar && <line x1={2} y1={5} x2={62} y2={5} className="sloth-bar"/>}
            <g className="part sloth-swing">
                {limbs.map(l => (
                    <g key={l.x}>
                        <line x1={l.x} y1={6} x2={l.to[0]} y2={l.to[1]} className={l.far ? "sloth-limb-far" : "sloth-limb"}/>
                        <path d={`M${l.x - 2} 7.5 Q${l.x - 0.5} 1.5 ${l.x + 2} 5 M${l.x + 0.5} 7.5 Q${l.x + 2} 2 ${l.x + 4} 5.5`} className="sloth-claw"/>
                    </g>
                ))}
                <path d="M16 22 Q32 42 48 22" className="sloth-body"/>
                <path d="M21 27 Q32 37.5 43 27" className="crew-seam"/>
                <circle cx={32} cy={31.6} r={1.3} className="crew-led"/>
                <circle cx={25} cy={30} r={0.8} className="crew-rivet"/>
                <circle cx={39} cy={30} r={0.8} className="crew-rivet"/>
                <g className="part sloth-head">
                    <line x1={7.5} y1={19.5} x2={5} y2={14.5} className="crew-antenna"/>
                    <circle cx={4.8} cy={14.1} r={1.4} className="crew-led"/>
                    <circle cx={11} cy={27} r={8.5} className="sloth-fur"/>
                    <ellipse cx={10.8} cy={28.6} rx={6.6} ry={5.6} className="sloth-face"/>
                    <ellipse cx={7.6} cy={28} rx={2.9} ry={1.7} transform="rotate(25 7.6 28)" className="sloth-band"/>
                    <ellipse cx={14} cy={28} rx={2.9} ry={1.7} transform="rotate(-25 14 28)" className="sloth-band"/>
                    <g className="part eyes">
                        <Eye x={8.1} y={27.6} r={0.9}/>
                        <Eye x={13.5} y={27.6} r={0.9}/>
                    </g>
                    <ellipse cx={10.8} cy={30.6} rx={1.4} ry={1} className="crew-ink"/>
                    <path d="M8.8 32.2 Q10.8 33.8 12.8 32.2" className="part sloth-smile crew-line"/>
                    <ellipse cx={10.8} cy={32.9} rx={1.6} ry={1.9} className="part sloth-mouth crew-ink"/>
                </g>
            </g>
        </CrewSvg>
    );
}
