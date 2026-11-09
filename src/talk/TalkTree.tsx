import React from "react";
import { Box, Typography } from "@mui/material";
import { keyframes } from "@mui/system";
import { useClaudeColors } from "../theme";

/* The idea tree of a talk, in two views (Jon 2026-11-09): an indented outline (the phone's default) and boxes and lines
   (the laptop's default). Both mark where Jon is, rabbit holes and thin branches; new nodes fade in and a node Claude
   renamed or moved glows for a moment, so he can see it change its mind. */

export type TalkNode = {id: string, parent: string | null, kind: "topic" | "idea" | "example" | "loose_end", text: string, bornSeq: number, glowSeq?: number};
export type TalkRabbitHole = {nodeId: string, minutes: number, why: "deep" | "off_questions", declared: boolean};
export type TreeViewProps = {
    nodes: TalkNode[],
    here: string | null,
    thin: Set<string>,
    rabbitHole: TalkRabbitHole | null,
    /* nodes lit by a tapped need */
    lit: Set<string>,
    onTapNode: (id: string) => void
};

const fadeIn = keyframes`from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; }`;

function useGlow() {
    const c = useClaudeColors();
    return React.useMemo(() => keyframes`0% { background-color: ${c.talk.glow}; } 100% { background-color: transparent; }`, [c]);
}

type Tree = {roots: TalkNode[], children: Map<string, TalkNode[]>};
function treeOf(nodes: TalkNode[]): Tree {
    const children = new Map<string, TalkNode[]>();
    const roots: TalkNode[] = [];
    const ids = new Set(nodes.map(n => n.id));
    for (const n of nodes) {
        if (n.parent && ids.has(n.parent)) children.set(n.parent, [...children.get(n.parent) ?? [], n]);
        else roots.push(n);
    }
    return {roots, children};
}

const kindMark: Record<TalkNode["kind"], string> = {topic: "", idea: "•", example: "e.g.", loose_end: "↩"};

function Marks({node, props}: {node: TalkNode, props: TreeViewProps}) {
    const c = useClaudeColors();
    const pill = {fontSize: 11, lineHeight: "18px", px: 0.75, borderRadius: 9, whiteSpace: "nowrap" as const, ml: 0.75, display: "inline-block"};
    const hole = props.rabbitHole?.nodeId === node.id ? props.rabbitHole : null;
    return <>
        {props.here === node.id && <Box component="span" data-testid="talk-here" sx={{...pill, bgcolor: c.talk.here, color: c.talk.hereText}}>you are here</Box>}
        {hole && <Box component="span" data-testid="talk-rabbit" sx={{...pill, bgcolor: c.talk.rabbit, color: c.talk.rabbitText}}>
            {hole.declared ? "going deep" : hole.why === "deep" ? "rabbit hole" : "off the questions"}, {hole.minutes} min
        </Box>}
        {props.thin.has(node.id) && <Box component="span" data-testid="talk-thin" sx={{...pill, border: `1px dotted ${c.talk.thin}`, color: c.talk.thin}}>say more?</Box>}
    </>;
}

export function OutlineView(props: TreeViewProps) {
    const c = useClaudeColors();
    const glow = useGlow();
    const {roots, children} = React.useMemo(() => treeOf(props.nodes), [props.nodes]);
    const row = (node: TalkNode, depth: number): React.ReactNode => (
        <React.Fragment key={node.id}>
            <Box data-node={node.id} onClick={() => props.onTapNode(node.id)} sx={{
                pl: 1 + depth * 2, pr: 1, py: 0.4, cursor: "pointer", borderRadius: 1,
                borderLeft: depth > 0 ? `1px solid ${c.line}` : "none", ml: depth > 0 ? 1 : 0,
                animation: `${fadeIn} 400ms ease-out`,
                outline: props.lit.has(node.id) ? `2px solid ${c.talk.need}` : "none"
            }}>
                <Box key={`${node.id}-${node.glowSeq ?? "x"}`} component="span" sx={{
                    borderRadius: 1, px: 0.25, animation: node.glowSeq !== undefined ? `${glow} 2.4s ease-out` : undefined
                }}>
                    {kindMark[node.kind] && <Box component="span" sx={{color: c.muted, mr: 0.75, fontSize: 13}}>{kindMark[node.kind]}</Box>}
                    <Typography component="span" sx={{fontWeight: node.kind === "topic" ? 600 : 400, fontSize: node.kind === "topic" ? 15 : 14}}>
                        {node.text}
                    </Typography>
                </Box>
                <Marks node={node} props={props}/>
            </Box>
            {(children.get(node.id) ?? []).map(child => row(child, depth + 1))}
        </React.Fragment>
    );
    return <Box data-testid="talk-outline" sx={{py: 1}}>{roots.map(r => row(r, 0))}</Box>;
}

const boxW = 190, boxH = 58, colGap = 48, rowGap = 12, pad = 16;

/* A plain left-to-right tidy tree: each node sits level with the middle of its children */
function layout(tree: Tree) {
    const pos = new Map<string, {x: number, y: number}>();
    let nextY = pad;
    const place = (node: TalkNode, depth: number): number => {
        const kids = tree.children.get(node.id) ?? [];
        let y: number;
        if (kids.length === 0) {
            y = nextY;
            nextY += boxH + rowGap;
        } else {
            const ys = kids.map(k => place(k, depth + 1));
            y = (ys[0] + ys[ys.length - 1]) / 2;
        }
        pos.set(node.id, {x: pad + depth * (boxW + colGap), y});
        return y;
    };
    tree.roots.forEach(r => {
        place(r, 0);
        nextY += rowGap * 2;
    });
    const width = Math.max(0, ...[...pos.values()].map(p => p.x + boxW)) + pad;
    return {pos, width, height: nextY + pad};
}

export function BoxesView(props: TreeViewProps) {
    const c = useClaudeColors();
    const glow = useGlow();
    const tree = React.useMemo(() => treeOf(props.nodes), [props.nodes]);
    const {pos, width, height} = React.useMemo(() => layout(tree), [tree]);
    return (
        <Box data-testid="talk-boxes" sx={{position: "relative", width, height, minWidth: "100%"}}>
            <svg width={width} height={height} style={{position: "absolute", inset: 0}} aria-hidden>
                {props.nodes.map(n => {
                    const from = n.parent ? pos.get(n.parent) : undefined;
                    const to = pos.get(n.id);
                    if (!from || !to) return null;
                    const x1 = from.x + boxW, y1 = from.y + boxH / 2, x2 = to.x, y2 = to.y + boxH / 2, mid = (x1 + x2) / 2;
                    return <path key={n.id} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" stroke={c.line} strokeWidth={1.5}/>;
                })}
            </svg>
            {props.nodes.map(n => {
                const p = pos.get(n.id);
                if (!p) return null;
                const here = props.here === n.id;
                return (
                    <Box key={n.id} data-node={n.id} onClick={() => props.onTapNode(n.id)} sx={{
                        position: "absolute", left: p.x, top: p.y, width: boxW, height: boxH, boxSizing: "border-box",
                        p: 0.75, borderRadius: 1.5, cursor: "pointer", overflow: "hidden",
                        bgcolor: c.talk.box,
                        border: `${here ? 2 : 1}px ${props.thin.has(n.id) ? "dotted" : "solid"} ${here ? c.talk.here : props.thin.has(n.id) ? c.talk.thin : c.talk.boxEdge}`,
                        outline: props.lit.has(n.id) ? `2px solid ${c.talk.need}` : "none", outlineOffset: 2,
                        animation: `${fadeIn} 400ms ease-out`
                    }}>
                        <Box key={`${n.id}-${n.glowSeq ?? "x"}`} sx={{
                            position: "absolute", inset: 0, pointerEvents: "none",
                            animation: n.glowSeq !== undefined ? `${glow} 2.4s ease-out` : undefined
                        }}/>
                        <Typography sx={{
                            position: "relative", fontSize: 13, lineHeight: 1.25, fontWeight: n.kind === "topic" ? 600 : 400,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
                        }} title={n.text}>
                            {kindMark[n.kind] && <Box component="span" sx={{color: c.muted, mr: 0.5}}>{kindMark[n.kind]}</Box>}
                            {n.text}
                        </Typography>
                        <Box sx={{position: "relative", mt: 0.25, ml: -0.75, whiteSpace: "nowrap"}}><Marks node={n} props={props}/></Box>
                    </Box>
                );
            })}
        </Box>
    );
}
