import React from "react";
import { MindMapGraphDataRecord } from "./MindMap";
import DB from "./GraphsDatabase";

export const GraphRepositoryContext = React.createContext<{
    graphs: MindMapGraphDataRecord[],
    saveGraph: (g: MindMapGraphDataRecord) => void,
    deleteGraphById: (id: string) => void
}>({
    graphs: [],
    saveGraph: () => {},
    deleteGraphById: () => {}
});

export function GraphRepositoryContextProvider({children}:{children:React.JSX.Element}){
    const [graphs, setGraphs] = React.useState<MindMapGraphDataRecord[]>([]);

    React.useEffect(() => {
        DB.openDatabase()
            .then(db => db.graph.getAll())
            .then(graphs => setGraphs(graphs));
    },[]);

    const saveGraph = React.useCallback((graph: MindMapGraphDataRecord) => {
        setGraphs(graphs => {
            if(graphs.find(g => g.id === graph.id) !== undefined){
                DB.openDatabase()
                    .then(db => db.graph.put(graph))
                    .then(() => {
                        console.log('graph updated in DB');
                    });
                return graphs.map(g => g.id === graph.id ? graph : g);
            } else {
                DB.openDatabase()
                    .then(db => db.graph.add(graph))
                    .then(() => {
                        console.log('graph added to DB');
                    });
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