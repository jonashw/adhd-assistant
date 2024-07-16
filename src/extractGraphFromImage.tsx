import { MindMapGraphData, DirectedGraphLink, MindMapGraphLink, DirectedGraphNode, MindMapGraphNode } from "./MindMap";

type CloudGraph = {
    nodes: {
        id: string;
        label: string
    }[];
    edges: {
        source: string;
        target: string;
        label?: string;
    }[]
};

export async function extractGraphFromImage(img: File | Blob): Promise<MindMapGraphData | undefined> {
    const newGraph: CloudGraph = await fetch('https://jonashw-dev.azurewebsites.net/api/ExtractDirectedAcyclicGraphFromImage',
        {
            method: 'POST',
            body: img
        }
    ).then(r => r.json());

    var links: DirectedGraphLink<MindMapGraphLink>[] = newGraph.edges.map(({ source, target }) => ({
        source,
        target,
        type: 'RETURNS_TO'
    }));

    var nodes: DirectedGraphNode<MindMapGraphNode>[] = newGraph.nodes.map(({ label, id }) => ({
        label,
        id,
        type: label === "HOME" ? "HOME" : "RabbitHole"
    }));

    const hasHome = nodes.some(n => n.type === "HOME");

    if (!hasHome) {
        alert("Sorry, couldn't detect HOME node. Please try again");
        return;
    }
    const graph: MindMapGraphData = { links, nodes };
    console.log({ graph });
    return graph;
}