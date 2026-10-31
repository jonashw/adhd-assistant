import React from "react";
import { MindMapGraphDataRecord } from "./MindMap";
import { GraphRepositoryContext } from "./GraphRepositoryContext";
import { emptyTrail, localTrailStore, serverTrailStore, Signal, TrailData, Visit, VisitKind } from "./Trail";
import { readTether, standingAt, Tether, WeatherAnswer } from "./Navigator";

export type Navigator = {
    loaded: boolean,
    trail: TrailData,
    tether: Tether,
    now: Date,
    weatherAnswer?: WeatherAnswer,
    /* Jon's feet move to a place; leaving a place he was tied off at unties him there first */
    arrive: (noteId: string) => void,
    tieOff: (noteId: string) => void,
    untie: () => void,
    answerWeather: (answer: WeatherAnswer["answer"]) => void,
    flagOf: (noteId: string) => Signal | undefined,
    plantFlag: (noteId: string, label: string, dueAt: string) => Promise<void>,
    clearFlag: (signalId: string) => Promise<void>
};

export const NavigatorContext = React.createContext<Navigator | undefined>(undefined);

export function useNavigator(): Navigator {
    const navigator = React.useContext(NavigatorContext);
    if (!navigator) {
        throw new Error("useNavigator needs a NavigatorProvider");
    }
    return navigator;
}

const weatherKey = (mapId: string) => `weather:${mapId}`;

export function NavigatorProvider({graph, children}: {graph: MindMapGraphDataRecord, children: React.ReactNode}) {
    const {status} = React.useContext(GraphRepositoryContext);
    const store = status?.mode === "server" ? serverTrailStore : localTrailStore;
    const mapId = graph.id;
    const homeId = graph.nodes.find(n => n.type === "HOME")?.id ?? "";
    const [trail, setTrail] = React.useState<TrailData>(emptyTrail);
    const [loaded, setLoaded] = React.useState(false);
    const [now, setNow] = React.useState(() => new Date());
    const [weatherAnswer, setWeatherAnswer] = React.useState<WeatherAnswer | undefined>(() => {
        try {
            return JSON.parse(localStorage.getItem(weatherKey(mapId)) ?? "null") ?? undefined;
        } catch {
            return undefined;
        }
    });
    const nextLocalId = React.useRef(-1);

    React.useEffect(() => {
        let cancelled = false;
        store.load(mapId)
            .then(data => !cancelled && setTrail(data))
            .catch(e => console.warn("couldn't load the trail", e))
            .finally(() => !cancelled && setLoaded(true));
        return () => {
            cancelled = true;
        };
    }, [store, mapId]);

    React.useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);

    const tether = React.useMemo(() => readTether(trail.recent, homeId), [trail.recent, homeId]);
    //kept current between renders, so two quick moves read the right tether
    const visitsRef = React.useRef(trail.recent);
    visitsRef.current = trail.recent;
    const tetherRef = React.useRef(tether);
    tetherRef.current = tether;

    const record = React.useCallback((noteId: string, kind: VisitKind) => {
        //shown at once; the server copy follows
        const visit: Visit = {id: nextLocalId.current--, noteId, kind, at: new Date().toISOString()};
        visitsRef.current = [...visitsRef.current, visit];
        tetherRef.current = readTether(visitsRef.current, homeId);
        setTrail(t => ({
            ...t,
            recent: [...t.recent, visit],
            lastArrivedAt: kind === "arrive" ? {...t.lastArrivedAt, [noteId]: visit.at} : t.lastArrivedAt
        }));
        setNow(new Date());
        store.addVisit(mapId, noteId, kind).catch(e => console.warn("couldn't record the visit", e));
    }, [store, mapId, homeId]);

    const arrive = React.useCallback((noteId: string) => {
        const current = tetherRef.current;
        if (standingAt(current) === noteId) {
            return;
        }
        if (current.state === "tied") {
            record(current.at, "untie");
        }
        record(noteId, "arrive");
    }, [record]);

    const tieOff = React.useCallback((noteId: string) => {
        if (standingAt(tetherRef.current) !== noteId) {
            record(noteId, "arrive");
        }
        record(noteId, "tie_off");
    }, [record]);

    const untie = React.useCallback(() => {
        const current = tetherRef.current;
        if (current.state === "tied") {
            record(current.at, "untie");
        }
    }, [record]);

    const answerWeather = React.useCallback((answer: WeatherAnswer["answer"]) => {
        const value = {answer, at: new Date().toISOString()};
        setWeatherAnswer(value);
        try {
            localStorage.setItem(weatherKey(mapId), JSON.stringify(value));
        } catch {
            // the answer still holds until reload
        }
    }, [mapId]);

    const flagOf = React.useCallback((noteId: string) =>
        trail.signals
            .filter(s => s.noteId === noteId && s.kind === "deadline")
            .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))[0],
        [trail.signals]);

    const plantFlag = React.useCallback(async (noteId: string, label: string, dueAt: string) => {
        const signal = await store.plantFlag(mapId, noteId, label, dueAt);
        setTrail(t => ({...t, signals: [...t.signals, signal]}));
    }, [store, mapId]);

    const clearFlag = React.useCallback(async (signalId: string) => {
        await store.clearSignal(mapId, signalId);
        setTrail(t => ({...t, signals: t.signals.filter(s => s.id !== signalId)}));
    }, [store, mapId]);

    const value: Navigator = {
        loaded, trail, tether, now, weatherAnswer,
        arrive, tieOff, untie, answerWeather, flagOf, plantFlag, clearFlag
    };
    return <NavigatorContext.Provider value={value}>{children}</NavigatorContext.Provider>;
}
