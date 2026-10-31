import React from "react";
import { Button, Snackbar } from "@mui/material";
import { MindMap, MindMapGraphDataRecord } from "./MindMap";
import DB from "./GraphsDatabase";
import { ConflictError, ServerApi, ServerStatus } from "./ServerApi";

export const GraphRepositoryContext = React.createContext<{
    status?: ServerStatus,
    graphs: MindMapGraphDataRecord[],
    /* bumps when a map is replaced from elsewhere, so its editor starts fresh */
    reloadCount: {[id: string]: number},
    saveGraph: (g: MindMapGraphDataRecord) => void,
    deleteGraphById: (id: string) => void
}>({
    graphs: [],
    reloadCount: {},
    saveGraph: () => {},
    deleteGraphById: () => {}
});

export function GraphRepositoryContextProvider({children}:{children:React.JSX.Element}){
    const [status, setStatus] = React.useState<ServerStatus>();
    const [graphs, setGraphs] = React.useState<MindMapGraphDataRecord[]>([]);
    const [reloadCount, setReloadCount] = React.useState<{[id: string]: number}>({});
    const [notice, setNotice] = React.useState<string>();
    const graphsRef = React.useRef(graphs);
    graphsRef.current = graphs;

    //server saves: one request per map at a time, always sending the newest state and the last revision seen
    const revisions = React.useRef<{[id: string]: number | null}>({});
    const pending = React.useRef(new Map<string, MindMapGraphDataRecord>());
    const inFlight = React.useRef(new Set<string>());

    const replaceFromServer = React.useCallback((id: string, latest: MindMapGraphDataRecord | null, message: string) => {
        pending.current.delete(id);
        setGraphs(graphs => latest
            ? graphs.map(g => g.id === id ? latest : g)
            : graphs.filter(g => g.id !== id));
        setReloadCount(counts => ({...counts, [id]: (counts[id] ?? 0) + 1}));
        setNotice(message);
    }, []);

    const flush = React.useCallback((id: string) => {
        const graph = pending.current.get(id);
        if (!graph || inFlight.current.has(id)) {
            return;
        }
        pending.current.delete(id);
        inFlight.current.add(id);
        let saveNext = true;
        ServerApi.saveMap(graph, revisions.current[id] ?? null)
            .then(({revision}) => {
                revisions.current[id] = revision;
            })
            .catch((e: Error) => {
                if (e instanceof ConflictError) {
                    revisions.current[id] = e.latest?.revision ?? null;
                    replaceFromServer(id, e.latest && {id: e.latest.id, nodes: e.latest.nodes, links: e.latest.links},
                        e.latest
                            ? `${e.message} Showing the newer version.`
                            : e.message);
                } else {
                    //keep the unsaved state so the next change retries it, rather than retrying in a loop
                    saveNext = false;
                    if (!pending.current.has(id)) {
                        pending.current.set(id, graph);
                    }
                    setNotice(`Couldn't save: ${e.message}`);
                }
            })
            .finally(() => {
                inFlight.current.delete(id);
                if (saveNext) {
                    flush(id);
                }
            });
    }, [replaceFromServer]);

    React.useEffect(() => {
        ServerApi.status().then(async status => {
            setStatus(status);
            if (status.mode === "server") {
                const maps = await ServerApi.listMaps();
                for (const map of maps) {
                    revisions.current[map.id] = map.revision;
                }
                setGraphs(maps.map(({id, nodes, links}) => MindMap.normalize({id, nodes, links})));
            } else if (status.mode === "local") {
                const db = await DB.openDatabase();
                const stored = await db.graph.getAll();
                const migrated = stored.map(g => MindMap.normalize(g));
                const changed = migrated.filter((g, i) => g !== stored[i]);
                if (changed.length > 0) {
                    const db = await DB.openDatabase();
                    await Promise.all(changed.map(g => db.graph.put(g)));
                    console.log(`brought ${changed.length} graph(s) up to the current model`);
                }
                setGraphs(migrated);
            }
        }).catch((e: Error) => setNotice(`Couldn't load your maps: ${e.message}`));
    }, []);

    const saveGraph = React.useCallback((graph: MindMapGraphDataRecord) => {
        const exists = graphsRef.current.some(g => g.id === graph.id);
        setGraphs(graphs => exists ? graphs.map(g => g.id === graph.id ? graph : g) : [...graphs, graph]);
        if (status?.mode === "server") {
            pending.current.set(graph.id, graph);
            flush(graph.id);
        } else {
            DB.openDatabase().then(db => exists ? db.graph.put(graph) : db.graph.add(graph));
        }
    }, [status, flush]);

    const deleteGraphById = React.useCallback((id: string) => {
        setGraphs(graphs => graphs.filter(g => g.id !== id));
        if (status?.mode === "server") {
            pending.current.delete(id);
            ServerApi.deleteMap(id)
                .then(() => {
                    delete revisions.current[id];
                })
                .catch((e: Error) => setNotice(`Couldn't delete: ${e.message}`));
        } else {
            DB.openDatabase().then(db => db.graph.delete(id));
        }
    }, [status]);

    return (
        <GraphRepositoryContext.Provider value={{status, graphs, reloadCount, saveGraph, deleteGraphById}}>
            {children}
            <Snackbar
                open={notice !== undefined}
                message={notice}
                onClose={(_, reason) => {
                    if (reason !== 'clickaway') {
                        setNotice(undefined);
                    }
                }}
                action={<Button color="info" size="small" onClick={() => setNotice(undefined)}>OK</Button>}
            />
        </GraphRepositoryContext.Provider>
    );
}
