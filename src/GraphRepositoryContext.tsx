import React from "react";
import { MindMapGraphDataRecord } from "./MindMap";

export const GraphRepositoryContext = React.createContext<{
    graphs: MindMapGraphDataRecord[],
    saveGraph: (g: MindMapGraphDataRecord) => void,
    deleteGraphById: (id: string) => void
}>({
    graphs: [],
    saveGraph: () => {},
    deleteGraphById: () => {}
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

const STORAGE_KEY = "graphs_2024-07-17";

const json = localStorage.getItem(STORAGE_KEY);
const loadedGraphs: MindMapGraphDataRecord[] = !!json ? JSON.parse(json) : sampleGraphs;
console.log('loading graphs from localStorage');

export function GraphRepositoryContextProvider({children}:{children:React.JSX.Element}){

    const [graphs, setGraphs] = React.useState(loadedGraphs);
    React.useEffect(() => {
        console.log('saving graphs to localStorage');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs,null,2));
    },[graphs]);

    const saveGraph = React.useCallback((graph: MindMapGraphDataRecord) => {
        setGraphs(graphs => {
            if(graphs.find(g => g.id === graph.id) !== undefined){
                return graphs.map(g => g.id === graph.id ? graph : g);
            } else {
                return [...graphs, graph];
            }
        });
    },[]);

    const deleteGraphById = React.useCallback((id: string) => {
        setGraphs(graphs => graphs.filter(g => g.id !== id));
    },[]);

    return (
        <GraphRepositoryContext.Provider value={{graphs,saveGraph,deleteGraphById}}>
            {children}
        </GraphRepositoryContext.Provider>
    );
}