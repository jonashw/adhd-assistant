import { useTheme } from "@mui/material/styles";
import { MindMap, MindMapGraphData } from "../MindMap";

/* A still picture of a map's tree: HOME on the left, each level one column to the right.
   Places glide to their new spot when a walkthrough step changes the map. Tucked places (done, dropped,
   or under one) fade instead of vanishing, so you see what a step tucked away. */

const colW = 118;
const rowH = 30;
const r = 7;
const pad = 14;
const maxChars = 15;

type Placed = {id: string, x: number, y: number};

function layout(graph: MindMapGraphData): {placed: Map<string, Placed>, cols: number, rows: number} {
    const home = graph.nodes.find(n => n.type === "HOME");
    const placed = new Map<string, Placed>();
    let row = 0;
    let deepest = 0;
    const visit = (id: string, depth: number, seen: Set<string>) => {
        deepest = Math.max(deepest, depth);
        const kids = MindMap.childrenOf(graph, id).filter(k => !seen.has(k));
        if (kids.length === 0) {
            placed.set(id, {id, x: depth, y: row++});
            return;
        }
        const first = row;
        kids.forEach(k => visit(k, depth + 1, new Set([...seen, k])));
        placed.set(id, {id, x: depth, y: (first + row - 1) / 2});
    };
    if (home) {
        visit(home.id, 0, new Set([home.id]));
    }
    return {placed, cols: deepest + 1, rows: Math.max(row, 1)};
}

const short = (label: string) => label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;

export function TemplatePreview({graph, focus, title}: {graph: MindMapGraphData, focus?: string, title: string}) {
    const theme = useTheme();
    const {placed, cols, rows} = layout(graph);
    const visible = new Set(MindMap.visibleGraph(graph, false).nodes.map(n => n.id));
    const px = (p: Placed) => pad + r + p.x * colW;
    const py = (p: Placed) => pad + p.y * rowH + rowH / 2;
    const width = pad * 2 + (cols - 1) * colW + colW;
    const height = pad * 2 + rows * rowH;
    const ink = theme.palette.text.primary;
    const faint = theme.palette.text.disabled;
    const accent = theme.palette.primary.main;
    const warn = theme.palette.warning.main;
    const ease = "transform 450ms ease, opacity 450ms ease";
    return (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Preview of the ${title} map`}
            style={{display: "block", maxWidth: "100%", minWidth: Math.round(width * 0.8), height: "auto", margin: "0 auto"}}>
            {graph.links.map(l => {
                const a = placed.get(l.source);
                const b = placed.get(l.target);
                if (!a || !b) {
                    return null;
                }
                const shown = visible.has(l.source) && visible.has(l.target);
                if (l.type === "PART_OF") {
                    const x1 = px(b) + r, y1 = py(b), x2 = px(a) - r, y2 = py(a);
                    const mid = (x1 + x2) / 2;
                    return <path key={`${l.source}-${l.target}-${l.type}`} fill="none" stroke={shown ? faint : theme.palette.divider}
                        strokeWidth={1.2} d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                        style={{transition: ease}}/>;
                }
                if (l.type === "BLOCKED_BY" && MindMap.isBlocked(graph, l.source)) {
                    //waits on: a dashed arc from the waiting place to its blocker
                    const x1 = px(a), y1 = py(a) - r, x2 = px(b), y2 = py(b) - r;
                    return <path key={`${l.source}-${l.target}-${l.type}`} fill="none" stroke={warn} strokeDasharray="4 3"
                        strokeWidth={1.4} d={`M${x1} ${y1} C${x1} ${y1 - 24} ${x2} ${y2 - 24} ${x2} ${y2}`}/>;
                }
                return null;
            })}
            {graph.nodes.map(n => {
                const p = placed.get(n.id);
                if (!p) {
                    return null;
                }
                const shown = visible.has(n.id);
                const home = n.type === "HOME";
                const filled = n.status === "active";
                const dashed = n.status === "waiting" || MindMap.isBlocked(graph, n.id);
                const quiet = n.status === "someday";
                const color = home ? ink : quiet ? faint : accent;
                return (
                    <g key={n.id} style={{transform: `translate(${px(p)}px, ${py(p)}px)`, transition: ease, opacity: shown ? 1 : 0.4}}>
                        {focus === n.id && <circle r={r + 5} fill="none" stroke={warn} strokeWidth={2.5}/>}
                        {home
                            ? <image className="line-art" href="/Enso.svg" x={-r * 1.6} y={-r * 1.6} width={r * 3.2} height={r * 3.2}/>
                            : <circle r={r} fill={filled ? color : theme.palette.background.paper} stroke={color}
                                strokeWidth={1.6} strokeDasharray={dashed ? "3 2" : undefined}/>}
                        {n.status === "done" && <path d={`M${-r / 2} 0 l${r / 3} ${r / 3} l${r * 0.6} ${-r * 0.7}`} fill="none" stroke={accent} strokeWidth={1.8}/>}
                        {!home && <text x={r + 5} y={4} fontSize={12} fill={shown ? ink : faint}
                            fontStyle={quiet ? "italic" : undefined}
                            stroke={theme.palette.background.paper} strokeWidth={3} paintOrder="stroke"
                            textDecoration={n.status === "done" ? "line-through" : undefined}
                            fontFamily={theme.typography.fontFamily}>
                            {short(n.label)}{n.small ? " ·5m" : ""}
                        </text>}
                    </g>
                );
            })}
        </svg>
    );
}

/* What the shapes on the preview mean */
export function PreviewLegend() {
    const theme = useTheme();
    const accent = theme.palette.primary.main;
    const items: [string, JSX.Element][] = [
        ["Captured", <circle r={6} fill="none" stroke={accent} strokeWidth={1.6}/>],
        ["Active", <circle r={6} fill={accent} stroke={accent} strokeWidth={1.6}/>],
        ["Waiting or blocked", <circle r={6} fill="none" stroke={accent} strokeWidth={1.6} strokeDasharray="3 2"/>],
        ["Someday", <circle r={6} fill="none" stroke={theme.palette.text.disabled} strokeWidth={1.6}/>],
        ["Tucked away", <circle r={6} fill="none" stroke={accent} strokeWidth={1.6} opacity={0.4}/>]
    ];
    return (
        <span style={{display: "inline-flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: theme.palette.text.secondary}}>
            {items.map(([label, shape]) =>
                <span key={label} style={{display: "inline-flex", alignItems: "center", gap: 4}}>
                    <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden>{shape}</svg>{label}
                </span>)}
            <span>·5m = small</span>
        </span>
    );
}
