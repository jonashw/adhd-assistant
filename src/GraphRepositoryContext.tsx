import React from "react";
import { MindMapGraphDataRecord } from "./MindMap";

export const GraphRepositoryContext = React.createContext<{
    graphs: MindMapGraphDataRecord[],
    saveGraph: (g: MindMapGraphDataRecord) => void
}>({
    graphs: [],
    saveGraph: () => {}
});

const sampleGraphs: MindMapGraphDataRecord[] = [
    {
        id: 'e5972094-31e6-4749-b401-30c0f2b8acce',
        nodes: [
            { id: 'HOME', label: 'MINDFUL', type: 'HOME' },
            { id: '1', label: 'Subtopic #1', type: 'RabbitHole' },
            { id: '2', label: 'Subtopic #2', type: 'RabbitHole' },
            { id: '3', label: 'Subtopic #3', type: 'RabbitHole' },
        ],
        links: [
            { source: '1', target: 'HOME', type: 'RETURNS_TO' },
            { source: '2', target: 'HOME', type: 'RETURNS_TO' },
            { source: '3', target: 'HOME', type: 'RETURNS_TO' }
        ]
    }
];

export function GraphRepositoryContextProvider({children}:{children:React.JSX.Element}){
    const [graphs, setGraphs] = React.useState(sampleGraphs);
    const saveGraph = React.useCallback((graph: MindMapGraphDataRecord) => {
        setGraphs(graphs => {
            if(graphs.find(g => g.id === graph.id) !== undefined){
                return graphs.map(g => g.id === graph.id ? graph : g);
            } else {
                return [...graphs, graph];
            }
        });
    },[]);

    return (
        <GraphRepositoryContext.Provider value={{graphs,saveGraph}}>
            {children}
        </GraphRepositoryContext.Provider>
    );
}