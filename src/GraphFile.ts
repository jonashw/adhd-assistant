import { MindMapGraphDataRecord } from "./MindMap";

const format = "adhd-assist-graph";
const version = 1;

type GraphFileContents = {
    format: typeof format,
    version: number,
    exportedAt: string,
    graph: MindMapGraphDataRecord
};

/* Only the stored fields, so a graph re-imports with identical nodes and links */
const plain = (graph: MindMapGraphDataRecord): MindMapGraphDataRecord => ({
    id: graph.id,
    nodes: graph.nodes.map(n => ({...n})),
    links: graph.links.map(({source, target, type, label}) => label ? {source, target, type, label} : {source, target, type})
});

export function exportGraph(graph: MindMapGraphDataRecord, name: string) {
    const contents: GraphFileContents = {
        format,
        version,
        exportedAt: new Date().toISOString(),
        graph: plain(graph)
    };
    const blob = new Blob([JSON.stringify(contents, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "graph"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function readGraphFile(file: File): Promise<MindMapGraphDataRecord> {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== format || typeof parsed.version !== "number") {
        throw new Error("This file is not an ADHD Assist graph export.");
    }
    if (parsed.version > version) {
        throw new Error("This file was exported by a newer version of ADHD Assist.");
    }
    const graph = parsed.graph;
    if (typeof graph?.id !== "string" || !Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
        throw new Error("The graph in this file is incomplete.");
    }
    return plain(graph);
}
