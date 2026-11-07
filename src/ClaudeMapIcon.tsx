/* The Claude map's mark: a spark in the Claude map's colours. Our own drawing, not Anthropic's logo.
   A mark, so it keeps its colours in dark mode too. */
const ring = "#D97757", spark = "#FAF6EF";
export function ClaudeMapIcon({size = 24}: {size?: number}) {
    const rays = Array.from({length: 8}, (_, i) => i * 45);
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Claude map">
            <rect width={24} height={24} rx={6} fill={ring}/>
            {rays.map(a =>
                <rect key={a} x={11} y={4} width={2} height={8} rx={1} fill={spark} transform={`rotate(${a} 12 12)`}/>)}
            <circle cx={12} cy={12} r={2.2} fill={spark}/>
        </svg>
    );
}
