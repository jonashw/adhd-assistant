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
    //console.log({groups});

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

export type MindMapGraphDataRecord = MindMapGraphData & {id: string};
export type MindMapGraphData = 
  DirectedGraphData<
    MindMapGraphNode,
    MindMapGraphLink>;

export type MindMapGraphType = {
    nodeType: MindMapGraphNode,
    linkType: MindMapGraphLink
}

export const nodeStatuses = ['captured', 'active', 'waiting', 'someday', 'done', 'dropped'] as const;
export type NodeStatus = typeof nodeStatuses[number];

export type MindMapGraphNode = {
    label: string,
    id: string,
    type: 'HOME' | 'RabbitHole',
    status?: NodeStatus,
    /* ISO date (YYYY-MM-DD) the node was marked done */
    doneAt?: string,
    hidden?: boolean
}

export type MindMapGraphLink = {type: MindMapGraphLinkType};
export type MindMapGraphLinkType = 'RETURNS_TO';
export type PathSegment = {
    node: DirectedGraphNode<MindMapGraphNode>;
    distance: number;
};

/* Matches a trailing "(DONE 8/17/2026)" or ", DONE 8/17/2026" typed into a label */
const doneLabelPattern = /[\s,]*\(?\s*DONE\s+(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*\)?\s*$/i;

const today = () => new Date().toISOString().slice(0, 10);

const updateNode = (graph: MindMapGraphData, nodeId: string, update: (node: MindMapGraphNode) => MindMapGraphNode): MindMapGraphData => ({
    nodes: graph.nodes.map(n => n.id === nodeId ? {...update(n), id: n.id} : n),
    links: graph.links
});

export const MindMap = {
    parentOf: (graph: MindMapGraphData, nodeId: string): string | undefined =>
        graph.links.find(l => l.source === nodeId && l.type === "RETURNS_TO")?.target,
    childrenOf: (graph: MindMapGraphData, nodeId: string): string[] =>
        graph.links.filter(l => l.target === nodeId && l.type === "RETURNS_TO").map(l => l.source),
    /* Hidden, done and dropped nodes are tucked away: they and their children leave the graph */
    isTucked: (node: MindMapGraphNode): boolean =>
        node.type !== 'HOME' && (node.hidden === true || node.status === 'done' || node.status === 'dropped'),
    setStatus: (graph: MindMapGraphData, nodeId: string, status: NodeStatus): MindMapGraphData =>
        updateNode(graph, nodeId, n => ({
            ...n,
            status,
            doneAt: status === 'done' ? (n.status === 'done' && n.doneAt ? n.doneAt : today()) : undefined
        })),
    setHidden: (graph: MindMapGraphData, nodeId: string, hidden: boolean): MindMapGraphData =>
        updateNode(graph, nodeId, n => ({...n, hidden})),
    /* Nodes to draw: everything when revealing hidden, otherwise only nodes with no tucked node on their way home */
    visibleGraph: (graph: MindMapGraphData, revealHidden: boolean): MindMapGraphData => {
        if (revealHidden) {
            return graph;
        }
        const nodeById = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
        const tuckedById: {[id: string]: boolean} = {};
        const isTuckedOrUnder = (id: string, seen: Set<string>): boolean => {
            if (id in tuckedById) {
                return tuckedById[id];
            }
            const node = nodeById[id];
            const parent = MindMap.parentOf(graph, id);
            const result = !!node && (MindMap.isTucked(node)
                || (parent !== undefined && !seen.has(parent) && isTuckedOrUnder(parent, new Set([...seen, id]))));
            tuckedById[id] = result;
            return result;
        };
        const nodes = graph.nodes.filter(n => !isTuckedOrUnder(n.id, new Set()));
        const kept = new Set(nodes.map(n => n.id));
        return {
            nodes,
            links: graph.links.filter(l => kept.has(l.source) && kept.has(l.target))
        };
    },
    /* Moves "(DONE date)" typed into labels into the status field. Returns the same graph when nothing changed. */
    migrateDoneLabels: (graph: MindMapGraphData): MindMapGraphData => {
        let changed = false;
        const nodes = graph.nodes.map(n => {
            const match = n.status === undefined ? doneLabelPattern.exec(n.label) : null;
            if (!match) {
                return n;
            }
            changed = true;
            const [, month, day, year] = match;
            const fullYear = year.length === 2 ? `20${year}` : year;
            return {
                ...n,
                label: n.label.slice(0, match.index).trim(),
                status: 'done' as NodeStatus,
                doneAt: `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            };
        });
        return changed ? {...graph, nodes} : graph;
    },
    reparent: (graph:MindMapGraphData, nodeId: string, newParentNodeId: string): MindMapGraphData => {
        const links = graph.links.map(l => 
            l.source === nodeId && l.type === "RETURNS_TO"
            ? {source: nodeId, target: newParentNodeId, type:l.type}
            : l
        );
        const updatedValue: MindMapGraphData = {
            nodes: [...graph.nodes],
            links
        };
        return updatedValue;
    },
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