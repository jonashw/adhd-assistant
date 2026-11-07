import React from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
    Alert, AppBar, Box, Chip, IconButton, List, ListItemButton, ListItemText, Slider, Stack, ToggleButton,
    ToggleButtonGroup, Toolbar, Typography
} from "@mui/material";
import { ArrowBack, Pause, PlayArrow, Replay as ReplayIcon } from "@mui/icons-material";
import { MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { BalloonTrail } from "./crew/BalloonTrail";
import { RabbitBurrow } from "./Crew";

/* The spoken map's replay (PRD v1.0, E7.S5): a monologue plays back from its first sentence. The transcript
   lights up in step, the scene moves with each reading (a drill sends the balloon up a level or the rabbit down a
   hole, a jump walks to another place on the ground), and the places Jon spoke about appear as he named them.
   Switching scene partway is saved, so the next replay switches at the same moment. */

type Move = "stay" | "drill" | "surface" | "sideways" | "jump" | "return" | "ask";
type Reading = {seq: number, move: Move, topic: string, depth: number, confidence: number, model: string, cue?: string};
type Utterance = {seq: number, text: string, reading?: Reading};
type Monologue = {id: string, receivedAt: string, threadUrl?: string, read: {state: "read" | "waiting", note?: string}, utterances: Utterance[]};
type ReplayStake = {
    id: string, seq: number, topic: string, move: Move,
    underNoteId?: string, underStakeId?: string, noteId?: string,
    settled?: "charted" | "dismissed", chartedNoteId?: string
};
type Scene = "crew" | "burrow";
type ReplayData = {
    monologue: Monologue,
    start: {mapId: string, noteId: string} | null,
    stakes: ReplayStake[],
    scenes: {seq: number, scene: Scene}[]
};
type Summary = {id: string, receivedAt: string, firstLine: string, utteranceCount: number, read: {state: string}};

const getJson = async <T,>(path: string): Promise<T> => {
    const response = await fetch(path, {credentials: "same-origin"});
    const body = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(body?.error ?? `The server answered ${response.status}.`);
    return body as T;
};

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
const stakeId = (id: string) => `said:${id}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
/* about how long a sentence takes to say: dictation runs near 160 words a minute */
const sayMs = (text: string) => Math.max(1400, text.split(/\s+/).length * 375);

const moveWords: Record<Move, string> = {
    stay: "carrying on", drill: "drilling in", surface: "coming up", sideways: "moving sideways",
    jump: "jumping", return: "coming back", ask: "asking"
};

/* Each frame of the replay: the map with the places named so far, where Jon was, and the scene */
function framesOf(data: ReplayData, map: MindMapGraphData) {
    const known = new Set(map.nodes.map(n => n.id));
    const placeOf = (s: ReplayStake): string =>
        s.chartedNoteId && known.has(s.chartedNoteId) ? s.chartedNoteId : s.noteId && known.has(s.noteId) ? s.noteId : stakeId(s.id);
    const home = map.nodes.find(n => n.type === "HOME")?.id;
    const startAt = data.start && known.has(data.start.noteId) ? data.start.noteId : home;
    const byTopic = new Map(data.stakes.map(s => [norm(s.topic), s]));
    const defaultScene: Scene = map.nodes.find(n => n.type === "HOME")?.scene === "burrow" ? "burrow" : "crew";
    let at = startAt;
    return data.monologue.utterances.map(u => {
        const stake = u.reading && byTopic.get(norm(u.reading.topic));
        if (stake && stake.seq <= u.seq) at = placeOf(stake);
        // new places appear as they are named; ones Jon already charted are on the map from the start
        const said = data.stakes.filter(s => s.seq <= u.seq && placeOf(s) === stakeId(s.id));
        const nodes: MindMapGraphNode[] = said.map(s => ({id: stakeId(s.id), label: s.topic, type: "RabbitHole"}));
        const parentOf = (s: ReplayStake) => s.underStakeId
            ? (() => { const up = data.stakes.find(x => x.id === s.underStakeId); return up ? placeOf(up) : undefined; })()
            : s.underNoteId;
        const links = said.flatMap(s => {
            const parent = parentOf(s);
            return parent ? [{source: stakeId(s.id), target: parent, type: "PART_OF" as const}] : [];
        });
        const scene = [...data.scenes].reverse().find(c => c.seq <= u.seq)?.scene ?? defaultScene;
        return {seq: u.seq, at, scene, graph: {nodes: [...map.nodes, ...nodes], links: [...map.links, ...links]} as MindMapGraphData};
    });
}

function MonologueList() {
    const [list, setList] = React.useState<Summary[]>();
    const [error, setError] = React.useState<string>();
    React.useEffect(() => {
        getJson<Summary[]>("/api/monologues").then(setList).catch(e => setError(e.message));
    }, []);
    return (
        <Box>
            <AppBar position="static"><Toolbar>
                <IconButton color="inherit" component={RouterLink} to="/" aria-label="Back to your maps"><ArrowBack/></IconButton>
                <Typography variant="h6">What you said</Typography>
            </Toolbar></AppBar>
            {error && <Alert severity="warning" sx={{m: 2}}>{error}</Alert>}
            {list && list.length === 0 && <Typography sx={{m: 2}} color="text.secondary">
                Nothing logged yet. Dictate into a Claude thread and ask it to log what you said.
            </Typography>}
            <List>
                {list?.map(m => (
                    <ListItemButton key={m.id} component={RouterLink} to={`/replay/${encodeURIComponent(m.id)}`}>
                        <ListItemText primary={m.firstLine || "(no words)"}
                            secondary={`${when(m.receivedAt)} · ${m.utteranceCount} sentence${m.utteranceCount === 1 ? "" : "s"}${m.read.state === "read" ? "" : " · waiting to be read"}`}/>
                    </ListItemButton>
                ))}
            </List>
        </Box>
    );
}

function Player({id}: {id: string}) {
    const navigate = useNavigate();
    const [data, setData] = React.useState<ReplayData>();
    const [map, setMap] = React.useState<MindMapGraphData>();
    const [error, setError] = React.useState<string>();
    const [index, setIndex] = React.useState(0);
    const [playing, setPlaying] = React.useState(false);
    const [width, setWidth] = React.useState(() => window.innerWidth);
    React.useEffect(() => {
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    React.useEffect(() => {
        getJson<ReplayData>(`/api/monologues/${encodeURIComponent(id)}/replay`)
            .then(async replay => {
                setData(replay);
                const mapId = replay.start?.mapId;
                const graph = mapId ? await getJson<MindMapGraphData>(`/api/maps/${encodeURIComponent(mapId)}`) : undefined;
                setMap(graph ?? {nodes: [{id: "home", label: "HOME", type: "HOME"}], links: []});
                setPlaying(true);
            })
            .catch(e => setError(e.message));
    }, [id]);
    const frames = React.useMemo(() => data && map ? framesOf(data, map) : [], [data, map]);
    const utterances = data?.monologue.utterances ?? [];
    //playing: each sentence holds for about as long as it took to say
    React.useEffect(() => {
        if (!playing || utterances.length === 0) return;
        if (index >= utterances.length - 1) {
            const stop = setTimeout(() => setPlaying(false), sayMs(utterances[index].text));
            return () => clearTimeout(stop);
        }
        const timer = setTimeout(() => setIndex(i => Math.min(i + 1, utterances.length - 1)), sayMs(utterances[index].text));
        return () => clearTimeout(timer);
    }, [playing, index, utterances]);
    //keep the sentence being said in view
    React.useEffect(() => {
        document.querySelector(`[data-seq="${index}"]`)?.scrollIntoView({block: "nearest", behavior: "smooth"});
    }, [index]);

    const frame = frames[index];
    const switchScene = (scene: Scene | null) => {
        if (!scene || !frame || scene === frame.scene || !data) return;
        const change = {seq: frame.seq, scene};
        setData({...data, scenes: [...data.scenes.filter(c => c.seq !== frame.seq), change].sort((a, b) => a.seq - b.seq)});
        fetch(`/api/monologues/${encodeURIComponent(id)}/scenes`, {
            method: "POST", credentials: "same-origin", headers: {"content-type": "application/json"}, body: JSON.stringify(change)
        }).then(r => { if (!r.ok) setError("That scene switch wasn't saved."); }).catch(() => setError("That scene switch wasn't saved."));
    };
    const sceneHeight = Math.max(260, Math.min(420, Math.round(window.innerHeight * 0.45)));
    const reading = utterances[index]?.reading;

    return (
        <Box sx={{display: "flex", flexDirection: "column", height: "100dvh"}}>
            <AppBar position="static"><Toolbar>
                <IconButton color="inherit" onClick={() => navigate("/replay")} aria-label="Back to what you said"><ArrowBack/></IconButton>
                <Typography variant="h6" sx={{flex: 1}} noWrap>Replay{data ? ` · ${when(data.monologue.receivedAt)}` : ""}</Typography>
            </Toolbar></AppBar>
            {error && <Alert severity="warning" sx={{m: 1}}>{error}</Alert>}
            {data && data.monologue.read.state !== "read" && <Alert severity="info" sx={{m: 1}}>
                This one is still waiting to be read, so it plays without moves.
            </Alert>}
            {frame && <Box data-testid="replay-scene" sx={{flex: "none", overflow: "hidden", height: sceneHeight, bgcolor: frame.scene === "burrow" ? "#dcefff" : undefined}}>
                {frame.scene === "burrow"
                    ? <RabbitBurrow fit={{width: width - 4, height: sceneHeight - 4, minScale: 1.6}} graph={frame.graph} at={frame.at}/>
                    : <BalloonTrail width={width} height={sceneHeight} graph={frame.graph} at={frame.at}/>}
            </Box>}
            {frame && <Stack direction="row" alignItems="center" gap={1} sx={{px: 2, py: 1, flexWrap: "wrap"}}>
                <IconButton onClick={() => {
                    if (!playing && index >= utterances.length - 1) setIndex(0);
                    setPlaying(p => !p);
                }} aria-label={playing ? "Pause" : "Play"} data-testid="replay-play">
                    {playing ? <Pause/> : index >= utterances.length - 1 ? <ReplayIcon/> : <PlayArrow/>}
                </IconButton>
                <Slider sx={{flex: 1, minWidth: 140}} min={0} max={Math.max(0, utterances.length - 1)} step={1} value={index}
                    onChange={(_, v) => { setIndex(v as number); setPlaying(false); }} aria-label="Sentence" data-testid="replay-scrubber"/>
                <ToggleButtonGroup size="small" exclusive value={frame.scene} onChange={(_, v) => switchScene(v)} aria-label="Scene">
                    <ToggleButton value="crew">Balloon-head</ToggleButton>
                    <ToggleButton value="burrow">Rabbit holes</ToggleButton>
                </ToggleButtonGroup>
                {reading && <Chip size="small" variant="outlined" sx={{borderStyle: "dashed"}} data-testid="replay-reading"
                    label={`${moveWords[reading.move]} · ${reading.topic}${reading.cue ? ` · you said "${reading.cue}"` : ""}`}/>}
            </Stack>}
            <Box sx={{flex: 1, overflow: "auto", px: 2, pb: 2}} data-testid="replay-transcript">
                {utterances.map((u, i) => (
                    <Typography key={u.seq} data-seq={i} component="span" onClick={() => { setIndex(i); setPlaying(false); }}
                        sx={{
                            cursor: "pointer", borderRadius: 1, px: 0.25, mr: 0.5, transition: "background-color 200ms",
                            bgcolor: i === index ? "warning.light" : "transparent",
                            color: i > index ? "text.secondary" : "text.primary"
                        }}>
                        {u.text}
                    </Typography>
                ))}
            </Box>
        </Box>
    );
}

export function Replay() {
    const {monologueId} = useParams();
    return monologueId ? <Player id={monologueId}/> : <MonologueList/>;
}
