import { claudeStyle } from "./ClaudeMap";

/* The Claude map's mark: a spark in the Claude map's colours. Our own drawing, not Anthropic's logo. */
export function ClaudeMapIcon({size = 24}: {size?: number}) {
    const rays = Array.from({length: 8}, (_, i) => i * 45);
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Claude map">
            <rect width={24} height={24} rx={6} fill={claudeStyle.ring}/>
            {rays.map(a =>
                <rect key={a} x={11} y={4} width={2} height={8} rx={1} fill={claudeStyle.fill} transform={`rotate(${a} 12 12)`}/>)}
            <circle cx={12} cy={12} r={2.2} fill={claudeStyle.fill}/>
        </svg>
    );
}
