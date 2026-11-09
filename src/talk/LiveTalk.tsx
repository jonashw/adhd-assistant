import React from "react";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router-dom";
import {
    Alert, AppBar, Box, Button, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
    List, ListItemButton, ListItemText, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, ToggleButton,
    ToggleButtonGroup, Toolbar, Typography, useMediaQuery, useTheme
} from "@mui/material";
import { ArrowBack, Send } from "@mui/icons-material";
import { useClaudeColors } from "../theme";
import { liveTabHeader, liveTabId, useLiveStatus, useRing } from "../live";
import { BoxesView, OutlineView, TalkNode, TalkRabbitHole } from "./TalkTree";
import { chime, cueGapMs, Cue, pauseMs, pickCue, spokenCueSwitch, unlockChime } from "./cues";
import { LoggedStretch, parseListenLog } from "./listenLog";

/* The live screen (E7 phase 2, story 2), in the browser first: three bands. On top, the questions Jon is answering, each
   need a chip (outlined while still open, half filled when partly covered, quiet and filled when covered). In the
   middle, the tree of his ideas, read by Claude stretch by stretch. At the bottom, the transcript: grey is heard but
   not read yet, normal ink is read and in the tree. A "type a stretch" box and a listen-test log played back at its real
   timing stand in for the phone's microphone until the Android shell (story 4). */

type NeedState = "open" | "partly" | "covered" | "set_aside";
type Need = {id: string, text: string, state: NeedState, evidence?: string, nodes: string[]};
type Question = {id: string, text: string, mode: "finish" | "expand", covered: string, needs: Need[]};
type Stretch = {seq: number, raw: string, saidAtMs: number, read: boolean, text?: string, move?: string, cue?: string};
type Talk = {
    talk: {id: string, startedAt: string, source: string, label: string | null},
    stretches: Stretch[],
    nodes: TalkNode[],
    here: string | null,
    thin: string[],
    rabbitHole: (TalkRabbitHole & {sinceAtMs: number}) | null,
    questions: Question[],
    reading: {readUpTo: number, busy: boolean, note?: string},
    usage: {reads: number, input: number, output: number, cacheRead: number, cacheWrite: number, dollars: number, model: string}
};
type TalkSummary = {id: string, startedAt: string, source: string, label: string | null, stretches: number, firstWords: string | null};
type RecentQuestion = {id: string, text: string, mode: string, createdAt: string};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init, credentials: "same-origin",
        headers: {"content-type": "application/json", [liveTabHeader]: liveTabId, ...init?.headers}
    });
    if (response.status === 204 || response.status === 202) return undefined as T;
    const body = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(body?.error ?? `The server answered ${response.status}.`);
    return body as T;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
const viewKey = "adhd.talkView";
const cuesKey = "adhd.talkCues";
const readPref = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };

/* ---------- the list of talks ---------- */

function TalkList() {
    const navigate = useNavigate();
    const [talks, setTalks] = React.useState<TalkSummary[]>();
    const [error, setError] = React.useState<string>();
    const [replayOpen, setReplayOpen] = React.useState(false);
    React.useEffect(() => {
        api<TalkSummary[]>("/api/talks").then(setTalks).catch(e => setError(e.message));
    }, []);
    const start = async (source: "typed" | "replay", log?: LoggedStretch[], label?: string) => {
        try {
            unlockChime();
            const {id} = await api<{id: string}>("/api/talks", {method: "POST", body: JSON.stringify({source, label})});
            navigate(`/talk/${encodeURIComponent(id)}`, {state: log ? {log} : undefined});
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };
    return (
        <Box>
            <AppBar position="static"><Toolbar>
                <IconButton color="inherit" component={RouterLink} to="/" aria-label="Back to your maps"><ArrowBack/></IconButton>
                <Typography variant="h6">Live talks</Typography>
            </Toolbar></AppBar>
            {error && <Alert severity="warning" sx={{m: 2}}>{error}</Alert>}
            <Stack direction="row" gap={1} sx={{m: 2, flexWrap: "wrap"}}>
                <Button variant="contained" onClick={() => start("typed")} data-testid="talk-start">Start a talk</Button>
                <Button variant="outlined" onClick={() => setReplayOpen(true)} data-testid="talk-replay-log">Replay a listen-test log</Button>
            </Stack>
            {talks && talks.length === 0 && <Typography sx={{mx: 2}} color="text.secondary">No talks yet.</Typography>}
            <List>
                {talks?.map(t => (
                    <ListItemButton key={t.id} component={RouterLink} to={`/talk/${encodeURIComponent(t.id)}`}>
                        <ListItemText primary={t.label || t.firstWords || "(no words yet)"}
                            secondary={`${when(t.startedAt)} · ${t.stretches} stretch${t.stretches === 1 ? "" : "es"}${t.source === "replay" ? " · replayed log" : ""}`}/>
                    </ListItemButton>
                ))}
            </List>
            <LogDialog open={replayOpen} onClose={() => setReplayOpen(false)}
                onPick={(log, name) => { setReplayOpen(false); void start("replay", log, name); }}/>
        </Box>
    );
}

function LogDialog({open, onClose, onPick}: {open: boolean, onClose: () => void, onPick: (log: LoggedStretch[], name?: string) => void}) {
    const [text, setText] = React.useState("");
    const [name, setName] = React.useState<string>();
    const parsed = React.useMemo(() => parseListenLog(text), [text]);
    return (
        <Dialog open={open} onClose={onClose} fullWidth>
            <DialogTitle>Replay a listen-test log</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{mb: 1}}>
                    Pick a log the listen test saved, or paste it. Each segment is sent at the time it was said, as if the phone were listening.
                </Typography>
                <Button component="label" variant="outlined" size="small" sx={{mb: 1}}>
                    Choose a file
                    <input hidden type="file" accept=".txt,text/plain" onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setName(file.name);
                            setText(await file.text());
                        }
                    }}/>
                </Button>
                <TextField multiline minRows={4} maxRows={10} fullWidth placeholder="+7.2s segment: All right, I'm trying…"
                    value={text} onChange={e => setText(e.target.value)} inputProps={{"data-testid": "talk-log-text"}}/>
                <Typography variant="body2" sx={{mt: 1}}>
                    {parsed.length > 0
                        ? `${parsed.length} segments over ${Math.round(parsed[parsed.length - 1].atMs / 1000)} s`
                        : "No segments found yet."}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={parsed.length === 0} onClick={() => onPick(parsed, name)} data-testid="talk-log-go">Use this log</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ---------- questions ---------- */

function NeedChip({need, lit, onTap}: {need: Need, lit: boolean, onTap: () => void}) {
    const c = useClaudeColors();
    const fill = need.state === "covered" ? c.talk.needFill
        : need.state === "partly" ? `linear-gradient(90deg, ${c.talk.needFill} 50%, transparent 50%)` : "transparent";
    return (
        <Box component="button" type="button" onClick={onTap} title={`${need.text}: ${need.state === "set_aside" ? "set aside" : need.state === "open" ? "still open" : need.state}`}
            data-testid="talk-need" data-state={need.state} sx={{
                font: "inherit", fontSize: 12, lineHeight: "20px", px: 1, borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap",
                border: `1px ${need.state === "set_aside" ? "dashed" : "solid"} ${need.state === "covered" ? "transparent" : c.talk.need}`,
                background: fill, color: need.state === "covered" || need.state === "set_aside" ? c.talk.needCoveredText : "text.primary",
                opacity: need.state === "set_aside" ? 0.6 : 1,
                outline: lit ? `2px solid ${c.talk.need}` : "none", outlineOffset: 1
            }}>
            {need.text}
        </Box>
    );
}

function QuestionsRail({talk, litNeed, onTapNeed, onAdd, onRemove}: {
    talk: Talk, litNeed: string | null, onTapNeed: (id: string) => void, onAdd: () => void, onRemove: (id: string) => void
}) {
    const [open, setOpen] = React.useState<string | null>(null);
    return (
        <Box data-testid="talk-questions" sx={{px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", flex: "none", maxHeight: "30vh", overflow: "auto"}}>
            {talk.questions.length === 0 && <Stack direction="row" alignItems="center" gap={1}>
                <Typography variant="body2" color="text.secondary" sx={{flex: 1}}>No question yet. The tree grows either way.</Typography>
                <Button size="small" onClick={onAdd} data-testid="talk-add-question">Add a question</Button>
            </Stack>}
            {talk.questions.map(q => {
                const counted = q.needs.filter(n => n.state !== "set_aside");
                const allCovered = q.mode === "finish" && counted.length > 0 && counted.every(n => n.state === "covered");
                return (
                    <Box key={q.id} sx={{mb: 0.75}}>
                        <Stack direction="row" alignItems="baseline" gap={1}>
                            <Typography variant="body2" sx={{fontWeight: 600, cursor: "pointer", flex: 1}} onClick={() => setOpen(open === q.id ? null : q.id)}>
                                {q.text}
                            </Typography>
                            {allCovered && <Typography variant="caption" color="text.secondary">Covered all {counted.length}</Typography>}
                        </Stack>
                        <Stack direction="row" gap={0.5} sx={{flexWrap: "wrap", mt: 0.5}}>
                            {q.needs.map(n => <NeedChip key={n.id} need={n} lit={litNeed === n.id} onTap={() => onTapNeed(n.id)}/>)}
                        </Stack>
                        <Collapse in={open === q.id}>
                            <Box sx={{mt: 0.5}}>
                                {q.needs.map(n => (
                                    <Typography key={n.id} variant="body2" sx={{fontSize: 13}}>
                                        {n.state === "covered" ? "Covered" : n.state === "partly" ? "Partly" : n.state === "set_aside" ? "Set aside" : "Still open"}: {n.text}
                                        {n.evidence && <Box component="span" sx={{color: "text.secondary"}}> · "{n.evidence}"</Box>}
                                    </Typography>
                                ))}
                                <Stack direction="row" gap={1} sx={{mt: 0.5}}>
                                    <Button size="small" onClick={onAdd}>Add another question</Button>
                                    <Button size="small" onClick={() => onRemove(q.id)}>Take it off this talk</Button>
                                </Stack>
                            </Box>
                        </Collapse>
                    </Box>
                );
            })}
        </Box>
    );
}

function QuestionDialog({open, onClose, onSave}: {open: boolean, onClose: () => void, onSave: (body: object) => Promise<void>}) {
    const [recent, setRecent] = React.useState<RecentQuestion[]>();
    const [tab, setTab] = React.useState<"new" | "pick">("new");
    const [text, setText] = React.useState("");
    const [needs, setNeeds] = React.useState("");
    const [mode, setMode] = React.useState<"finish" | "expand">("finish");
    const [error, setError] = React.useState<string>();
    React.useEffect(() => {
        if (open) api<RecentQuestion[]>("/api/answer-questions").then(setRecent).catch(() => setRecent([]));
    }, [open]);
    const save = (body: object) => onSave(body).then(() => { setText(""); setNeeds(""); setError(undefined); }).catch(e => setError(e.message));
    return (
        <Dialog open={open} onClose={onClose} fullWidth>
            <DialogTitle>The question you're answering</DialogTitle>
            <DialogContent>
                <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)} sx={{mb: 2}}>
                    <ToggleButton value="new">Write one</ToggleButton>
                    <ToggleButton value="pick">Pick one from a thread</ToggleButton>
                </ToggleButtonGroup>
                {error && <Alert severity="warning" sx={{mb: 1}}>{error}</Alert>}
                {tab === "new" ? <Stack gap={1.5}>
                    <TextField label="Question" value={text} onChange={e => setText(e.target.value)} fullWidth inputProps={{"data-testid": "talk-q-text"}}/>
                    <TextField label="What a full answer covers, one per line" value={needs} onChange={e => setNeeds(e.target.value)}
                        multiline minRows={3} fullWidth inputProps={{"data-testid": "talk-q-needs"}}/>
                    <RadioGroup row value={mode} onChange={e => setMode(e.target.value as "finish" | "expand")}>
                        <FormControlLabel value="finish" control={<Radio size="small"/>} label="Land it (fixed needs)"/>
                        <FormControlLabel value="expand" control={<Radio size="small"/>} label="Explore (needs can grow)"/>
                    </RadioGroup>
                </Stack> : <List dense>
                    {recent?.length === 0 && <Typography color="text.secondary">No questions from threads yet.</Typography>}
                    {recent?.map(q => (
                        <ListItemButton key={q.id} onClick={() => save({questionId: q.id})}>
                            <ListItemText primary={q.text} secondary={when(q.createdAt)}/>
                        </ListItemButton>
                    ))}
                </List>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                {tab === "new" && <Button variant="contained" data-testid="talk-q-save"
                    disabled={!text.trim() || !needs.trim()}
                    onClick={() => save({text, mode, needs: needs.split("\n").map(n => n.trim()).filter(Boolean).slice(0, 8)})}>
                    Add it
                </Button>}
            </DialogActions>
        </Dialog>
    );
}

/* ---------- the screen ---------- */

function useReplay(talkId: string, send: (text: string, saidAtMs: number) => Promise<void>) {
    const [state, setState] = React.useState<{sent: number, total: number, running: boolean}>({sent: 0, total: 0, running: false});
    const timers = React.useRef<number[]>([]);
    const stop = React.useCallback(() => {
        timers.current.forEach(t => window.clearTimeout(t));
        timers.current = [];
        setState(s => ({...s, running: false}));
    }, []);
    const start = React.useCallback((log: LoggedStretch[], speed: number) => {
        stop();
        setState({sent: 0, total: log.length, running: true});
        log.forEach((s, i) => {
            timers.current.push(window.setTimeout(() => {
                void send(s.text, s.atMs);
                setState(st => ({...st, sent: i + 1, running: i + 1 < log.length}));
            }, s.atMs / speed));
        });
    }, [send, stop]);
    React.useEffect(() => stop, [talkId, stop]);
    return {...state, start, stop};
}

function TalkScreen({id}: {id: string}) {
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const c = useClaudeColors();
    const wide = useMediaQuery(theme.breakpoints.up("md"), {noSsr: true});
    const live = useLiveStatus();
    const [talk, setTalk] = React.useState<Talk>();
    const [error, setError] = React.useState<string>();
    const [draft, setDraft] = React.useState("");
    const [view, setView] = React.useState<"outline" | "boxes" | null>(() => {
        const v = readPref(viewKey);
        return v === "outline" || v === "boxes" ? v : null;
    });
    const shownView = view ?? (wide ? "boxes" : "outline");
    const [cuesOn, setCuesOn] = React.useState(() => readPref(cuesKey) !== "off");
    const [cue, setCue] = React.useState<Cue | null>(null);
    const cued = React.useRef<Set<string>>(new Set());
    const lastCueAt = React.useRef(0);
    const lastStretchAt = React.useRef(Date.now());
    const [litNeed, setLitNeed] = React.useState<string | null>(null);
    const [litNode, setLitNode] = React.useState<string | null>(null);
    const [questionOpen, setQuestionOpen] = React.useState(false);
    const [pendingLog, setPendingLog] = React.useState<LoggedStretch[] | undefined>((location.state as {log?: LoggedStretch[]} | null)?.log);
    const [speed, setSpeed] = React.useState(1);
    const [logOpen, setLogOpen] = React.useState(false);

    const load = React.useCallback(() => {
        api<Talk>(`/api/talks/${encodeURIComponent(id)}`).then(t => { setTalk(t); setError(undefined); }).catch(e => setError(e.message));
    }, [id]);
    React.useEffect(load, [load]);
    useRing("talks", id, load);
    // while a stretch waits to be read and the doorbell isn't live, look every few seconds
    const waiting = talk ? talk.stretches.some(s => !s.read) && !talk.reading.note : false;
    React.useEffect(() => {
        if (!waiting || live === "live") return;
        const t = window.setInterval(load, 3000);
        return () => window.clearInterval(t);
    }, [waiting, live, load]);

    const setCues = React.useCallback((on: boolean) => {
        setCuesOn(on);
        writePref(cuesKey, on ? "on" : "off");
        if (!on) setCue(null);
    }, []);

    const send = React.useCallback(async (text: string, saidAtMs?: number) => {
        const words = text.trim();
        if (!words) return;
        lastStretchAt.current = Date.now();
        setCue(null);
        const spoken = spokenCueSwitch(words);
        if (spoken !== null) setCues(spoken);
        try {
            await api(`/api/talks/${encodeURIComponent(id)}/stretches`, {method: "POST", body: JSON.stringify({text: words, saidAtMs})});
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [id, load, setCues]);
    const replay = useReplay(id, send);

    // a cue at a pause of 3 s or more, once the tree has caught up, at most one a minute
    React.useEffect(() => {
        const t = window.setInterval(() => {
            if (!talk || !cuesOn) return;
            const now = Date.now();
            const caughtUp = talk.stretches.length > 0 && talk.stretches.every(s => s.read);
            if (!caughtUp || now - lastStretchAt.current < pauseMs || now - lastCueAt.current < cueGapMs) return;
            const textOf = new Map(talk.nodes.map(n => [n.id, n.text]));
            const next = pickCue({
                openNeeds: talk.questions.flatMap(q => q.needs.filter(n => n.state === "open")),
                thin: talk.thin.map(id => ({id, text: textOf.get(id) ?? "that"})),
                rabbitHole: talk.rabbitHole ? {...talk.rabbitHole, text: textOf.get(talk.rabbitHole.nodeId) ?? ""} : null,
                alreadyCued: cued.current
            });
            if (!next) return;
            cued.current.add(next.key);
            lastCueAt.current = now;
            setCue(next);
            chime();
        }, 500);
        return () => window.clearInterval(t);
    }, [talk, cuesOn]);
    // a cue fades after a while; the next stretch clears it too
    React.useEffect(() => {
        if (!cue) return;
        const t = window.setTimeout(() => setCue(null), 12_000);
        return () => window.clearTimeout(t);
    }, [cue]);

    // the transcript follows the newest words only when Jon is already at the bottom
    const strip = React.useRef<HTMLDivElement>(null);
    const atBottom = React.useRef(true);
    React.useLayoutEffect(() => {
        const el = strip.current;
        if (el && atBottom.current) el.scrollTop = el.scrollHeight;
    }, [talk?.stretches.length, talk?.reading.readUpTo]);
    // keep "you are here" in view as the tree grows
    const treeBox = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!talk?.here) return;
        treeBox.current?.querySelector(`[data-node="${talk.here}"]`)?.scrollIntoView({block: "nearest", inline: "nearest", behavior: "smooth"});
    }, [talk?.here, shownView]);

    const lit = React.useMemo(() => {
        if (!talk) return new Set<string>();
        if (litNeed) return new Set(talk.questions.flatMap(q => q.needs).find(n => n.id === litNeed)?.nodes ?? []);
        if (litNode) return new Set([litNode]);
        return new Set<string>();
    }, [talk, litNeed, litNode]);
    // tap a node and the needs it answers light up
    const needsOfNode = React.useMemo(() => new Set(talk && litNode ? talk.questions.flatMap(q => q.needs).filter(n => n.nodes.includes(litNode)).map(n => n.id) : []), [talk, litNode]);

    const treeProps = talk && {
        nodes: talk.nodes, here: talk.here, thin: new Set(talk.thin), rabbitHole: talk.rabbitHole, lit,
        onTapNode: (nodeId: string) => { setLitNeed(null); setLitNode(litNode === nodeId ? null : nodeId); }
    };

    return (
        <Box sx={{display: "flex", flexDirection: "column", height: "100dvh"}}>
            <AppBar position="static" elevation={0} sx={{bgcolor: c.bar, color: c.barText}}><Toolbar variant="dense" sx={{gap: 1}}>
                <IconButton color="inherit" onClick={() => navigate("/talk")} aria-label="Back to your talks"><ArrowBack/></IconButton>
                <Typography variant="h6" sx={{flex: 1}} noWrap>{talk?.talk.label || "Live talk"}</Typography>
                <ToggleButtonGroup size="small" exclusive value={shownView} aria-label="Tree view"
                    onChange={(_, v) => { if (v) { setView(v); writePref(viewKey, v); } }}
                    sx={{bgcolor: "background.paper", "& .MuiToggleButton-root": {py: 0.25, textTransform: "none"}}}>
                    <ToggleButton value="outline" data-testid="talk-view-outline">Outline</ToggleButton>
                    <ToggleButton value="boxes" data-testid="talk-view-boxes">Boxes</ToggleButton>
                </ToggleButtonGroup>
                <FormControlLabel sx={{mr: 0}} label={<Typography variant="body2">Cues {cuesOn ? "On" : "Off"}</Typography>}
                    control={<Switch size="small" color="default" checked={cuesOn} onChange={e => { unlockChime(); setCues(e.target.checked); }}
                        inputProps={{"aria-label": "Cues", ...{"data-testid": "talk-cues"}}}/>}/>
            </Toolbar></AppBar>
            {error && <Alert severity="warning" sx={{m: 1}} onClose={() => setError(undefined)}>{error}</Alert>}
            {talk && <QuestionsRail talk={talk} onAdd={() => setQuestionOpen(true)}
                litNeed={litNeed ?? (needsOfNode.size === 1 ? [...needsOfNode][0] : null)}
                onTapNeed={needId => { setLitNode(null); setLitNeed(litNeed === needId ? null : needId); }}
                onRemove={async qid => {
                    await api(`/api/talks/${encodeURIComponent(id)}/questions/${encodeURIComponent(qid)}`, {method: "DELETE"}).catch(e => setError(e.message));
                    load();
                }}/>}
            <Box ref={treeBox} sx={{flex: 1, overflow: "auto", position: "relative", px: shownView === "outline" ? 1 : 0}} data-testid="talk-tree">
                {cue && <Box data-testid="talk-cue" onClick={() => setCue(null)} sx={{
                    position: "sticky", top: 8, left: 8, zIndex: 2, mx: "auto", width: "fit-content", maxWidth: "90%",
                    px: 2, py: 1, borderRadius: 2, bgcolor: c.talk.cueBg, color: c.talk.cueText, border: `1px solid ${c.talk.boxEdge}`,
                    boxShadow: 2, fontSize: 15
                }}>{cue.text}</Box>}
                {talk && talk.nodes.length === 0 && <Typography color="text.secondary" sx={{p: 2}}>
                    {talk.stretches.length === 0 ? "Start talking (or typing). The tree grows as Claude reads each stretch." : "Reading…"}
                </Typography>}
                {treeProps && (shownView === "outline" ? <OutlineView {...treeProps}/> : <BoxesView {...treeProps}/>)}
            </Box>
            {talk && <Box sx={{flex: "none", borderTop: 1, borderColor: "divider"}}>
                {talk.reading.note && <Alert severity="info" sx={{borderRadius: 0, py: 0}} action={
                    <Button size="small" onClick={() => api(`/api/talks/${encodeURIComponent(id)}/read`, {method: "POST"}).then(load)}>Read again</Button>
                }>Waiting to be read: {talk.reading.note}</Alert>}
                <Box ref={strip} data-testid="talk-transcript" onScroll={e => {
                    const el = e.currentTarget;
                    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
                }} sx={{maxHeight: "5.6em", overflow: "auto", px: 1.5, py: 0.75, lineHeight: 1.4, fontSize: 15}}>
                    {talk.stretches.map(s => (
                        <Box component="span" key={s.seq} data-read={s.read ? "yes" : "no"} title={s.read && s.text !== s.raw ? `Heard: ${s.raw}` : undefined}
                            sx={{color: s.read ? "text.primary" : c.talk.heard, mr: 0.5}}>
                            {s.read ? s.text ?? s.raw : s.raw}
                        </Box>
                    ))}
                </Box>
                <Stack direction="row" gap={1} alignItems="center" sx={{px: 1, pb: 1}}>
                    <TextField size="small" fullWidth placeholder="Type a stretch, then Enter" value={draft}
                        onChange={e => setDraft(e.target.value)} inputProps={{"data-testid": "talk-input"}}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); unlockChime(); void send(draft); setDraft(""); } }}/>
                    <IconButton aria-label="Send this stretch" onClick={() => { unlockChime(); void send(draft); setDraft(""); }} disabled={!draft.trim()}><Send/></IconButton>
                </Stack>
                <Stack direction="row" gap={1} alignItems="center" sx={{px: 1.5, pb: 1, flexWrap: "wrap"}}>
                    {replay.running
                        ? <>
                            <Typography variant="caption">Replaying {replay.sent} of {replay.total}</Typography>
                            <Button size="small" onClick={replay.stop} data-testid="talk-replay-stop">Stop replay</Button>
                        </>
                        : pendingLog
                            ? <>
                                <Typography variant="caption">{pendingLog.length} segments ready</Typography>
                                <TextField select size="small" value={speed} onChange={e => setSpeed(Number(e.target.value))} sx={{"& .MuiSelect-select": {py: 0.25}}}>
                                    <MenuItem value={1}>Real timing</MenuItem>
                                    <MenuItem value={2}>2× faster</MenuItem>
                                    <MenuItem value={4}>4× faster</MenuItem>
                                </TextField>
                                <Button size="small" variant="contained" data-testid="talk-replay-start"
                                    onClick={() => { unlockChime(); replay.start(pendingLog, speed); setPendingLog(undefined); }}>Play the log</Button>
                            </>
                            : <Button size="small" onClick={() => setLogOpen(true)}>Replay a log into this talk</Button>}
                    <Typography variant="caption" color="text.secondary" sx={{ml: "auto"}} data-testid="talk-usage">
                        {talk.usage.reads} read{talk.usage.reads === 1 ? "" : "s"} · {talk.usage.input + talk.usage.cacheRead + talk.usage.cacheWrite} in / {talk.usage.output} out tokens · about ${talk.usage.dollars.toFixed(4)}
                    </Typography>
                </Stack>
            </Box>}
            <QuestionDialog open={questionOpen} onClose={() => setQuestionOpen(false)} onSave={async body => {
                await api(`/api/talks/${encodeURIComponent(id)}/questions`, {method: "POST", body: JSON.stringify(body)});
                setQuestionOpen(false);
                load();
            }}/>
            <LogDialog open={logOpen} onClose={() => setLogOpen(false)} onPick={log => { setLogOpen(false); setPendingLog(log); }}/>
        </Box>
    );
}

export function LiveTalk() {
    const {talkId} = useParams();
    return talkId ? <TalkScreen key={talkId} id={talkId}/> : <TalkList/>;
}
