import { dijkstra } from "./Dijkstra";

type Group<TValue> = {
    key: string,
    values: TValue[]
}

function groupBy<TValue>(
    values: TValue[],
    keySelector: (value:TValue) => string
): GroupByResult<TValue> {
    const lookup: {[key: string]: TValue[]}= {};
    for(const value of values){
        const key = keySelector(value);
        const group = lookup[key] || [];
        group.push(value);
        lookup[key] = group;
    }
    const groups: Group<TValue>[] = 
        Object.keys(lookup).map(key => ({
            key,
            values: lookup[key]
        }));
    console.log({groups});

    return new GroupByResult(groups);
}


class GroupByResult<TValue>{
    constructor(public readonly groups: Group<TValue>[]){}
    public toDictionary<TOutValue>(
        projectKey: (group: Group<TValue>) => string,
        projectValue: (group: Group<TValue>) => TOutValue
    ): {[key: string]: TOutValue} {
        const dict: {[key: string]: TOutValue} = {};
        for(const group of this.groups){
            dict[projectKey(group)] = projectValue(group);
        }
        return dict;
    }
}






export type DirectedGraphData<TNode, TLink> = {
  nodes: DirectedGraphNode<TNode>[];
  links: DirectedGraphLink<TLink>[];
}
export type DirectedGraphNode<T> = {id:string} & T;
export type DirectedGraphLink<T> = {source:string, target: string} & T;

export type MindMapNodeType = 'HOME' | 'RabbitHole';

export type MindMapGraphData = 
  DirectedGraphData<
    MindMapGraphNode,
    MindMapGraphLink>;

export type MindMapGraphType = {
    nodeType: MindMapGraphNode,
    linkType: MindMapGraphLink
}

export type MindMapGraphNode = {
    label: string,
    id: string,
    type: 'HOME' | 'RabbitHole'
}

export type MindMapGraphLink = {type: MindMapGraphLinkType};
export type MindMapGraphLinkType = 'RETURNS_TO';
export type PathSegment = {
    node: DirectedGraphNode<MindMapGraphNode>;
    distance: number;
};

export const MindMap = {
    rabbitHole: (graph:MindMapGraphData, origin: string, label: string) => {
        const newNode: MindMapGraphNode = {
            id: crypto.randomUUID(),
            label,
            type: 'RabbitHole'
        };
        const updatedValue: MindMapGraphData = {
            nodes: [...graph.nodes, newNode],
            links: [...graph.links, {
                source: newNode.id,
                target: origin,
                type: 'RETURNS_TO'
            }]
        };
        return [updatedValue,newNode] as [MindMapGraphData,MindMapGraphNode];
    },
    shortestPathBetween: (graph: MindMapGraphData, source: string, target: string): PathSegment[] => {
        const adjacencyList: {[sourceId: string]: {[targetId: string]: number}} = 
            groupBy(graph.links, l => l.source)
            .toDictionary(
                g => g.key,
                g => Object.fromEntries(g.values.map(link => [link.target, 1])));
        const d = dijkstra(adjacencyList, source);
        const nodeById = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
        return (d.shortestPathByTarget[target] ?? []).map(segment => ({
            ...segment,
            node: nodeById[segment.node]
        }));
    },
    clone: (value: MindMapGraphData): MindMapGraphData => 
    ({
        links: value.links.map(link => ({...link})),
        nodes: value.nodes.map(node => ({...node}))
    }),
    remove: (graph: MindMapGraphData, node: MindMapGraphNode): MindMapGraphData => {
        const nodes = graph.nodes.filter(n => n.id !== node.id);
        const nodeById = Object.fromEntries(nodes.map(n => [n.id,n]));
        const danglingSourceNodeIds = 
            graph.links
            .filter(l => l.target === node.id)
            .map(l => nodeById[l.source])
            .filter(n => n)
            .map(n => n.id);
        const danglingTargetNodeIds = 
            graph.links
            .filter(l => l.source === node.id)
            .map(l => nodeById[l.target])
            .filter(n => n)
            .map(n => n.id);
        const remainingLinks = graph.links.filter(l => l.source !== node.id && l.target !== node.id);
        console.log({remainingLinks});
        const links = [
            ...remainingLinks,
            ...danglingSourceNodeIds.flatMap(source => 
                danglingTargetNodeIds.map(target => ({source, target, type:'RETURNS_TO'} as DirectedGraphLink<MindMapGraphLink>)))
        ];
        console.log({graph,links});
        return {nodes, links};
    }
};