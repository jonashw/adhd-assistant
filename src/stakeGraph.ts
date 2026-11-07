import { MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { Stake } from "./TrailTypes";

/* Dashed stakes (E7.S3): topics Jon spoke about that autopilot proposes as places. They are drawn dashed beside
   the map's real places and never saved into the map; charting one makes it a real place. */

export const stakePrefix = "stake:";
export const isStakeNodeId = (id: string) => id.startsWith(stakePrefix);
export const stakeNodeId = (stakeId: string) => stakePrefix + stakeId;

/* The stake's chain up to the place it hangs from: outermost stake first */
export function chainOf(stakes: Stake[], stakeId: string): {underNoteId: string, chain: Stake[]} | undefined {
    const byId = new Map(stakes.map(s => [s.id, s]));
    const chain: Stake[] = [];
    let current = byId.get(stakeId);
    while (current) {
        chain.unshift(current);
        if (current.underNoteId) return {underNoteId: current.underNoteId, chain};
        if (!current.underStakeId || chain.length > 50) return undefined;
        current = byId.get(current.underStakeId);
    }
    return undefined;
}

/* Ghost nodes and their PART_OF links for the stakes whose chain reaches a place now drawn */
export function withStakes(graph: MindMapGraphData, stakes: Stake[]): MindMapGraphData {
    const shown = new Set(graph.nodes.map(n => n.id));
    const ghosts: MindMapGraphNode[] = [];
    const links: MindMapGraphData["links"] = [];
    for (const stake of stakes) {
        if (stake.noteId) continue;
        const reach = chainOf(stakes, stake.id);
        if (!reach || !shown.has(reach.underNoteId)) continue;
        ghosts.push({id: stakeNodeId(stake.id), label: stake.topic, type: "RabbitHole"});
        links.push({
            source: stakeNodeId(stake.id),
            target: stake.underStakeId ? stakeNodeId(stake.underStakeId) : stake.underNoteId!,
            type: "PART_OF"
        });
    }
    return ghosts.length === 0 ? graph : {nodes: [...graph.nodes, ...ghosts], links: [...graph.links, ...links]};
}

/* Places Jon spoke about that are already on the map, by place */
export const mentionsAt = (stakes: Stake[], noteId: string) => stakes.filter(s => s.noteId === noteId);

/* Chart a stake: the stakes above it first, so the path exists. Returns the map and the place each stake became. */
export function chartStake(graph: MindMapGraphData, stakes: Stake[], stakeId: string): [MindMapGraphData, {stakeId: string, noteId: string}[]] | undefined {
    const reach = chainOf(stakes, stakeId);
    if (!reach || !graph.nodes.some(n => n.id === reach.underNoteId)) return undefined;
    let next = graph;
    let under = reach.underNoteId;
    const made: {stakeId: string, noteId: string}[] = [];
    for (const stake of reach.chain) {
        const [charted, placeId] = MindMap.chartPath(next, under, [stake.topic]);
        next = charted;
        under = placeId;
        made.push({stakeId: stake.id, noteId: placeId});
    }
    return [next, made];
}

