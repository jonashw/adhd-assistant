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
    hidden?: boolean,
    /* the node this one was seen from when it was made; never changes, even when the node moves */
    origin?: string
}

export type MindMapGraphLink = {type: MindMapGraphLinkType, label?: string};
/* PART_OF points from a node to its one parent; the others are ties across the tree */
export const linkTypes = ['PART_OF', 'BLOCKED_BY', 'ALSO_IN', 'LABELLED'] as const;
export type MindMapGraphLinkType = typeof linkTypes[number];
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
        graph.links.find(l => l.source === nodeId && l.type === "PART_OF")?.target,
    childrenOf: (graph: MindMapGraphData, nodeId: string): string[] =>
        graph.links.filter(l => l.target === nodeId && l.type === "PART_OF").map(l => l.source),
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
    /* Brings any older or imported graph up to the current model:
       RETURNS_TO becomes PART_OF, a second parent becomes an ALSO_IN link, a node with no parent goes under HOME,
       and "(DONE date)" labels become a status. Returns the same graph when nothing changed. */
    normalize: <T extends MindMapGraphData>(graph: T): T => {
        let changed = false;
        const home = graph.nodes.find(n => n.type === 'HOME');
        const nodeIds = new Set(graph.nodes.map(n => n.id));
        const hasParent = new Set<string>();
        const links: DirectedGraphLink<MindMapGraphLink>[] = [];
        for (const link of graph.links) {
            const type = (link.type as string) === 'RETURNS_TO' ? 'PART_OF' : link.type;
            if (!nodeIds.has(link.source) || !nodeIds.has(link.target) || !linkTypes.includes(type)) {
                changed = true;
                continue;
            }
            if (type === 'PART_OF' && (hasParent.has(link.source) || link.source === home?.id)) {
                changed = true;
                links.push({source: link.source, target: link.target, type: 'ALSO_IN'});
                continue;
            }
            if (type === 'PART_OF') {
                hasParent.add(link.source);
            }
            if (type !== link.type) {
                changed = true;
            }
            links.push({...link, type});
        }
        //a PART_OF that closes a loop is demoted, so walking up always reaches HOME
        for (const link of links) {
            if (link.type === 'PART_OF' && MindMap.isDescendantOf({nodes: graph.nodes, links}, link.target, link.source)) {
                link.type = 'ALSO_IN';
                hasParent.delete(link.source);
                changed = true;
            }
        }
        if (home) {
            for (const node of graph.nodes) {
                if (node.id !== home.id && !hasParent.has(node.id)) {
                    links.push({source: node.id, target: home.id, type: 'PART_OF'});
                    changed = true;
                }
            }
        }
        const withLinks = changed ? {...graph, links} : graph;
        const migrated = MindMap.migrateDoneLabels(withLinks);
        return (migrated === withLinks ? withLinks : {...withLinks, nodes: migrated.nodes}) as T;
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
    isDescendantOf: (graph: MindMapGraphData, nodeId: string, ancestorId: string): boolean => {
        const seen = new Set<string>();
        let current: string | undefined = nodeId;
        while (current !== undefined && !seen.has(current)) {
            if (current === ancestorId) {
                return true;
            }
            seen.add(current);
            current = MindMap.parentOf(graph, current);
        }
        return false;
    },
    /* Moves a node under a new parent. Its origin stays as it was. Moving a node under itself or its own descendant does nothing. */
    reparent: (graph:MindMapGraphData, nodeId: string, newParentNodeId: string): MindMapGraphData => {
        if (MindMap.isDescendantOf(graph, newParentNodeId, nodeId)) {
            return graph;
        }
        const links = [
            ...graph.links.filter(l => !(l.source === nodeId && l.type === "PART_OF")),
            {source: nodeId, target: newParentNodeId, type: 'PART_OF' as MindMapGraphLinkType}
        ];
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
            type: 'RabbitHole',
            origin
        };
        const updatedValue: MindMapGraphData = {
            nodes: [...graph.nodes, newNode],
            links: [...graph.links, {
                source: newNode.id,
                target: origin,
                type: 'PART_OF'
            }]
        };
        return [updatedValue,newNode] as [MindMapGraphData,MindMapGraphNode];
    },
    shortestPathBetween: (graph: MindMapGraphData, source: string, target: string): PathSegment[] => {
        const adjacencyList: {[sourceId: string]: {[targetId: string]: number}} = 
            groupBy(graph.links.filter(l => l.type === 'PART_OF'), l => l.source)
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
    /* Removes a node; its children move up to its parent. Links to or from it go with it. */
    remove: (graph: MindMapGraphData, node: MindMapGraphNode): MindMapGraphData => {
        const nodes = graph.nodes.filter(n => n.id !== node.id);
        const parent = MindMap.parentOf(graph, node.id);
        const children = MindMap.childrenOf(graph, node.id);
        const remainingLinks = graph.links.filter(l => l.source !== node.id && l.target !== node.id);
        const links = [
            ...remainingLinks,
            ...(parent === undefined ? [] : children.map(source => ({source, target: parent, type: 'PART_OF'} as DirectedGraphLink<MindMapGraphLink>)))
        ];
        return {nodes, links};

    }
};