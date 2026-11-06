import React from "react";
import { Button, Snackbar } from "@mui/material";
import { MindMap, MindMapGraphDataRecord } from "./MindMap";
import DB from "./GraphsDatabase";
import { ConflictError, ServerApi, ServerStatus } from "./ServerApi";
import { safetyPollMs, startLive, useRing } from "./live";

export const GraphRepositoryContext = React.createContext<{
    status?: ServerStatus,
    graphs: MindMapGraphDataRecord[],
    /* bumps when a map is replaced from elsewhere, so its editor starts fresh */
    reloadCount: {[id: string]: number},
    saveGraph: (g: MindMapGraphDataRecord) => void,
    /* resolves once the server holds every change made to this map so far */
    whenSaved: (id: string) => Promise<void>,
    deleteGraphById: (id: string) => void
}>({
    graphs: [],
    reloadCount: {},
    saveGraph: () => {},
    whenSaved: () => Promise.resolve(),
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
    const waiters = React.useRef(new Map<string, (() => void)[]>());
    const settled = (id: string) => {
        if (!pending.current.has(id) && !inFlight.current.has(id)) {
            (waiters.current.get(id) ?? []).forEach(resolve => resolve());
            waiters.current.delete(id);
        }
    };
    const whenSaved = React.useCallback((id: string) => new Promise<void>(resolve => {
        waiters.current.set(id, [...(waiters.current.get(id) ?? []), resolve]);
        settled(id);
    }), []);

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
                //a failed save still releases its waiters, which then find the place missing and say so
                if (saveNext) {
                    settled(id);
                } else {
                    (waiters.current.get(id) ?? []).forEach(resolve => resolve());
                    waiters.current.delete(id);
                }
            });
    }, [replaceFromServer]);

    //maps made while the stored ones were still loading are kept, not overwritten
    const setLoaded = (loaded: MindMapGraphDataRecord[]) => setGraphs(current => [
        ...loaded,
        ...current.filter(g => !loaded.some(l => l.id === g.id))
    ]);

    React.useEffect(() => {
        ServerApi.status().then(async status => {
            setStatus(status);
            if (status.mode === "server") {
                const maps = await ServerApi.listMaps();
                for (const map of maps) {
                    revisions.current[map.id] = map.revision;
                }
                setLoaded(maps.map(({id, nodes, links}) => MindMap.normalize({id, nodes, links})));
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
                setLoaded(migrated);
            }
        }).catch((e: Error) => setNotice(`Couldn't load your maps: ${e.message}`));
    }, []);

    /* Maps changed somewhere else (another tab, another device): take the newer ones in. A map with changes of
       this tab's own still on the way is left alone; if both changed, its save meets the newer revision and the
       usual "changed somewhere else" notice shows the newer version. */
    const refreshing = React.useRef<Promise<void>>();
    const refreshAgain = React.useRef(false);
    const refreshMaps = React.useCallback((): Promise<void> => {
        if (status?.mode !== "server") {
            return Promise.resolve();
        }
        if (refreshing.current) {
            //one look at a time; a ring during it means one more look straight after
            refreshAgain.current = true;
            return refreshing.current;
        }
        const busy = (id: string) => pending.current.has(id) || inFlight.current.has(id);
        const isNewer = (id: string, revision: number) => (revisions.current[id] ?? 0) < revision;
        const look = async () => {
            const listed = await ServerApi.mapRevisions();
            const changed = listed.filter(m => !busy(m.id) && isNewer(m.id, m.revision));
            const fetched = await Promise.all(changed.map(m => ServerApi.getMap(m.id).catch(() => undefined)));
            const fresh = fetched.filter((m): m is NonNullable<typeof m> => !!m && !busy(m.id) && isNewer(m.id, m.revision));
            //only maps this tab knows the server holds can have been deleted elsewhere
            const gone = graphsRef.current
                .filter(g => revisions.current[g.id] != null && !busy(g.id) && !listed.some(m => m.id === g.id))
                .map(g => g.id);
            if (fresh.length === 0 && gone.length === 0) {
                return;
            }
            for (const map of fresh) {
                revisions.current[map.id] = map.revision;
            }
            for (const id of gone) {
                delete revisions.current[id];
            }
            const known = new Set(graphsRef.current.map(g => g.id));
            const replaced = fresh.filter(m => known.has(m.id)).map(m => m.id);
            setGraphs(graphs => {
                const updated = graphs
                    .filter(g => !gone.includes(g.id))
                    .map(g => {
                        const map = fresh.find(m => m.id === g.id);
                        return map ? MindMap.normalize({id: map.id, nodes: map.nodes, links: map.links}) : g;
                    });
                const added = fresh
                    .filter(m => !graphs.some(g => g.id === m.id))
                    .map(m => MindMap.normalize({id: m.id, nodes: m.nodes, links: m.links}));
                return [...updated, ...added];
            });
            //an open editor starts again from the newer map
            if (replaced.length > 0) {
                setReloadCount(counts => ({...counts, ...Object.fromEntries(replaced.map(id => [id, (counts[id] ?? 0) + 1]))}));
            }
        };
        const run = look()
            .catch(e => console.warn("couldn't check for newer maps", e))
            .finally(() => {
                refreshing.current = undefined;
                if (refreshAgain.current) {
                    refreshAgain.current = false;
                    refreshMaps();
                }
            });
        refreshing.current = run;
        return run;
    }, [status]);

    //a ring from the server, or from another tab in this browser, says a map changed
    useRing("maps", undefined, refreshMaps, status?.mode === "server");
    React.useEffect(() => {
        if (status?.mode !== "server") {
            return;
        }
        startLive();
        const visible = () => document.visibilityState === "visible";
        const onReturn = () => visible() && refreshMaps();
        const timer = window.setInterval(onReturn, safetyPollMs);
        document.addEventListener("visibilitychange", onReturn);
        window.addEventListener("focus", onReturn);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onReturn);
            window.removeEventListener("focus", onReturn);
        };
    }, [status, refreshMaps]);

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
        <GraphRepositoryContext.Provider value={{status, graphs, reloadCount, saveGraph, whenSaved, deleteGraphById}}>
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
