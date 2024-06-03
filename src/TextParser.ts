import { DirectedGraphData, MindMapGraphData, MindMapGraphLink, MindMapGraphNode } from "./MindMap";

type LinkType = "RETURNS_TO"|"HOME"|undefined;

export default {
    parse(code: string): MindMapGraphData {
        const lines = 
            code
            .split(/->/)
            .map(p => 
                p.split(' -')//optional relationship data
                .map(str => str.trim())
            );
        const nodes: {[id:string]: MindMapGraphNode} = {};//DirectedGraphNode<MindMapGraphNode>
        const links: MindMapGraphLink[] = [];//DirectedGraphLink<MindMapGraphLink>
        let prevNode: MindMapGraphNode | undefined;
        let openLinkType: LinkType = undefined;

        for(const lineTokens of lines){
            const [label,nextLinkType] = lineTokens;
            const node: MindMapGraphNode = {
                id: crypto.randomUUID(),
                label,
                type: "RabbitHole"
            };
            nodes[node.id] = node;
            if(!prevNode){
                prevNode = node;
            } else if(openLinkType){
                links.push({
                    source: prevNode.id,
                    target: node.id,
                    type: openLinkType
                } as MindMapGraphLink);
            }
            if(nextLinkType){
                openLinkType = nextLinkType as LinkType;
            }
            prevNode = node;
        }
        return { 
            links,
            nodes: Object.values(nodes)
        } as DirectedGraphData<MindMapGraphNode,MindMapGraphLink>;
    }
};