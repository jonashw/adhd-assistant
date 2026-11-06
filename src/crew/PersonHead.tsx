/* An ordinary head: what Balloon-head's balloon becomes when head and body are one (the speaker on the
   "Help me pick" page, and you resting in the hammock at HOME). Kept neutral: a soft chin-length cut that covers
   the ears, no brows to speak of. Drawn on Balloon-head's 96-tall body, centred on cx, with the neck down to
   the jacket at y = 59. */

export function PersonHead({cx = 24, mood = "talk"}: {cx?: number, mood?: "talk" | "rest"}) {
    const x = (d: number) => cx + d;
    return (
        <g className="person-head">
            <rect x={x(-2.4)} y={52} width={4.8} height={7.5} rx={1.6} className="person-skin"/>
            <ellipse cx={cx} cy={42} rx={10} ry={11.6} className="person-skin"/>
            {/* a bob that falls to the jaw, with a fringe swept to one side */}
            <path d={`M${x(-11.4)} 47.5 C${x(-13.4)} 34 ${x(-8.6)} 28.4 ${cx} 28.4 C${x(8.6)} 28.4 ${x(13.4)} 34 ${x(11.4)} 47.5
                L${x(9.4)} 47.5 C${x(10)} 41 ${x(8)} 36.6 ${x(2.6)} 35.4 Q${x(-3.4)} 37.6 ${x(-7.8)} 35.2 C${x(-9.6)} 38.6 ${x(-10)} 42.6 ${x(-9.4)} 47.5 Z`}
                className="person-hair"/>
            {mood === "rest"
                ? <>
                    {/* eyes closed, at ease */}
                    <path d={`M${x(-5.4)} 42 q1.6 1.3 3.2 0 M${x(2.2)} 42 q1.6 1.3 3.2 0`} className="person-line"/>
                    <path d={`M${x(-2.6)} 47.4 q2.6 1.8 5.2 0`} className="person-line"/>
                </>
                : <>
                    <g className="part eyes">
                        <circle cx={x(-3.8)} cy={41.6} r={1.35} className="person-ink"/>
                        <circle cx={x(3.8)} cy={41.6} r={1.35} className="person-ink"/>
                    </g>
                    {/* the open mouth, mid-question */}
                    <ellipse cx={cx} cy={48} rx={2.3} ry={2.6} className="part speaker-mouth"/>
                </>}
        </g>
    );
}
