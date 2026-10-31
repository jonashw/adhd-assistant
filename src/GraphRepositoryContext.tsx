import React from "react";
import { MindMap, MindMapGraphDataRecord } from "./MindMap";
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
            .then(graphs => {
                const migrated = graphs.map(g => MindMap.migrateDoneLabels(g) as MindMapGraphDataRecord);
                const changed = migrated.filter((g, i) => g !== graphs[i]);
                if(changed.length > 0){
                    DB.openDatabase()
                        .then(db => Promise.all(changed.map(g => db.graph.put(g))))
                        .then(() => {
                            console.log(`moved DONE labels into status on ${changed.length} graph(s)`);
                        });
                }
                setGraphs(migrated);
            });
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
        DB.openDatabase()
            .then(db => db.graph.delete(id))
            .then(() => {
                console.log('graph deleted from DB');
            });
    },[]);

    return (
        <GraphRepositoryContext.Provider value={{graphs,saveGraph,deleteGraphById}}>
            {children}
        </GraphRepositoryContext.Provider>
    );
}