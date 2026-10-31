import React from "react";
import {
    Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText,
    Stack, TextField, Typography, useMediaQuery, useTheme
} from "@mui/material";
import { MindMapGraphData } from "./MindMap";
import { LinkedItem, PlaceSuggestion, age } from "./TrailTypes";
import { MindMap } from "./MindMap";
import { GraphRepositoryContext } from "./GraphRepositoryContext";
import { useNavigator } from "./NavigatorContext";
import { currentWeather, Suggestion, targetPlaces, whatsNext } from "./Navigator";
import { MindfulScene, Sloth, Squirrel } from "./Crew";

function SuggestionList({items, onGo, testId}: {items: Suggestion[], onGo: (id: string) => void, testId: string}) {
    return (
        <List dense data-testid={testId}>
            {items.map(s => (
                <ListItemButton key={s.node.id} onClick={() => onGo(s.node.id)}>
                    <ListItemText primary={s.node.label} secondary={s.reason}/>
                </ListItemButton>
            ))}
        </List>
    );
}

/* The HOME illustration is drawn at 360px, or narrower when the screen is */
const mindfulMaxSize = 360;

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
    const ref = React.useRef<T>(null);
    const [width, setWidth] = React.useState(0);
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => setWidth(el.clientWidth);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

export function Mindful() {
    const [ref, width] = useWidth<HTMLDivElement>();
    const size = width > 0 ? Math.min(mindfulMaxSize, width) : 0;
    //every position below was laid out on a 180px enso, so scale them with it
    const u = size / 180;
    return (
        <Stack ref={ref} alignItems="center" gap={2} sx={{py: 3, textAlign: "center", width: "100%"}} data-testid="mindful">
            {size > 0 && <Box sx={{position: "relative", width: size, height: size}}>
                <img src="/Enso.svg" alt="" width={size} height={size}/>
                {/* the sloth hooks its claws over the inside edge of the enso's top, so its body hangs against the white */}
                <Box sx={{position: "absolute", top: 28 * u, left: "50%", transform: "translateX(-50%)", lineHeight: 0}}><Sloth size={44 * u} bar={false}/></Box>
                <Box sx={{position: "absolute", bottom: 34 * u, left: "50%", transform: "translateX(-50%)", lineHeight: 0}}>
                    <MindfulScene size={78 * u}/>
                </Box>
            </Box>}
            <Typography variant="overline">You are here: Mindful</Typography>
            <Typography variant="h6">Nothing needs you. You can just stand here.</Typography>
        </Stack>
    );
}

/* A thread suggested a new place: Jon charts it (renaming the last name if he likes), or answers below */
function ChartSuggestion({item, suggestion, graph, onChart}: {
    item: LinkedItem,
    suggestion: PlaceSuggestion,
    graph: MindMapGraphData,
    onChart: (names: string[]) => Promise<void>
}) {
    const [last, setLast] = React.useState(suggestion.path[suggestion.path.length - 1]);
    const [busy, setBusy] = React.useState(false);
    const under = graph.nodes.find(n => n.id === suggestion.underNoteId);
    const lead = suggestion.path.slice(0, -1);
    return (
        <Stack gap={1} data-testid="place-suggestion">
            <Typography variant="body2" sx={{display: "flex", gap: 1, alignItems: "center"}}>
                <Squirrel size={28} doing="glide"/>
                <span>It suggests a new place: {under && under.type !== "HOME" ? `${under.label} › ` : ""}{[...lead, last].join(" › ")}</span>
            </Typography>
            <Stack direction="row" gap={1} alignItems="center">
                <TextField size="small" label="Name" value={last} sx={{flex: 1}} inputProps={{maxLength: 120}}
                    onChange={e => setLast(e.target.value)}/>
                <Button size="small" variant="contained" disabled={busy || !last.trim()}
                    onClick={() => {
                        setBusy(true);
                        onChart([...lead, last.trim()]).finally(() => setBusy(false));
                    }}>Chart it</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">Or pick an existing place for {item.title}:</Typography>
        </Stack>
    );
}

/* A thread checked in without naming a place: that question is a flare until Jon answers */
function ClaudeAsks({items, graph, onChange}: {items: LinkedItem[], graph: MindMapGraphData, onChange?: (graph: MindMapGraphData) => void}) {
    const nav = useNavigator();
    const {whenSaved} = React.useContext(GraphRepositoryContext);
    //the squirrel stakes the new place (dashed until Jon walks there), then the thread moves in once the map is saved
    const chart = (item: LinkedItem, suggestion: PlaceSuggestion) => async (names: string[]) => {
        if (!onChange) return;
        const [charted, placeId] = MindMap.chartPath(graph, suggestion.underNoteId, names);
        onChange(charted);
        await whenSaved(nav.mapId);
        await run(nav.placeItem(item.id, placeId));
    };
    const [error, setError] = React.useState<string>();
    const choices = targetPlaces(graph);
    const run = (work: Promise<void>) => work.then(() => setError(undefined)).catch((e: Error) => setError(e.message));
    return (
        <Box data-testid="claude-asks" sx={{mb: 2}}>
            <Typography variant="overline">Flare: Claude asks</Typography>
            {error && <Alert severity="warning">{error}</Alert>}
            {items.map(item => (
                <Stack key={item.id} gap={1} sx={{py: 1}}>
                    <Typography variant="body2">
                        Which place does <strong>{item.title}</strong> serve?
                        {item.lastHeardAt && <Typography component="span" variant="caption" color="text.secondary"> {age(item.lastHeardAt, nav.now)}</Typography>}
                    </Typography>
                    {item.suggestion && item.suggestion.mapId === nav.mapId && onChange
                        && graph.nodes.some(n => n.id === item.suggestion!.underNoteId)
                        && <ChartSuggestion item={item} suggestion={item.suggestion} graph={graph} onChart={chart(item, item.suggestion)}/>}
                    <Stack direction="row" gap={1} alignItems="center">
                        <Autocomplete
                            size="small"
                            sx={{flex: 1}}
                            options={choices}
                            getOptionLabel={n => n.label}
                            value={null}
                            blurOnSelect
                            onChange={(_, chosen) => chosen && run(nav.placeItem(item.id, chosen.id))}
                            renderInput={params => <TextField {...params} label="Pick a place"/>}
                        />
                        <Button size="small" onClick={() => run(nav.forgetItem(item.id))}>Not on the map</Button>
                    </Stack>
                </Stack>
            ))}
        </Box>
    );
}

/* What's next: the app suggests where Jon's feet go; Jon picks */
export function WhatsNextDialog({open, graph, onChange, onClose, onGo}: {
    open: boolean,
    graph: MindMapGraphData,
    /* edits the map, for charting a place Claude suggested */
    onChange?: (graph: MindMapGraphData) => void,
    onClose: () => void,
    onGo: (id: string) => void
}) {
    const nav = useNavigator();
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const [standing, setStanding] = React.useState(false);
    const [showOthers, setShowOthers] = React.useState(false);
    const weather = currentWeather(nav.tether, nav.weatherAnswer, nav.now);
    const result = React.useMemo(() => whatsNext({
        graph,
        signals: nav.trail.signals,
        lastArrivedAt: nav.trail.lastArrivedAt,
        tether: nav.tether,
        weather,
        now: nav.now,
        items: nav.trail.items
    }), [graph, nav.trail, nav.tether, weather, nav.now]);

    React.useEffect(() => {
        if (!open) {
            setStanding(false);
            setShowOthers(false);
        }
    }, [open]);

    const others = result.kind === "small" ? [] : result.others;

    return (
        <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" data-testid="whats-next">
            <DialogTitle>What's next</DialogTitle>
            <DialogContent>
                {!standing && nav.trail.unplaced.length > 0 && <ClaudeAsks items={nav.trail.unplaced} graph={graph} onChange={onChange}/>}
                {standing ? <Mindful/>
                : result.kind === "mindful" ? <Mindful/>
                : result.kind === "small" ? (
                    result.pick
                        ? <>
                            <Typography variant="body2" color="text.secondary">It's gusty, so here's one small thing to tie off on.</Typography>
                            <SuggestionList items={[result.pick]} onGo={onGo} testId="small-pick"/>
                        </>
                        : <Typography sx={{py: 2}} data-testid="small-pick">
                            Nothing small is waiting. You could tie off right where you are, or just stand here.
                        </Typography>
                ) : <>
                    {result.flag && <>
                        <Typography variant="overline">Flag due soon</Typography>
                        <SuggestionList items={[result.flag]} onGo={onGo} testId="flag-pick"/>
                    </>}
                    {result.top.length > 0 && <>
                        <Typography variant="overline">{result.top.length > 1 ? "A close call" : "Next"}</Typography>
                        <SuggestionList items={result.top} onGo={onGo} testId="top-picks"/>
                        {result.top.length > 1 && <Typography variant="body2" color="text.secondary" data-testid="flip">
                            {result.flip
                                ? `${result.flip} would flip the top two if it counted for more.`
                                : "No single criterion would flip the top two."}
                        </Typography>}
                    </>}
                </>}
                {!standing && others.length > 0 && (
                    showOthers
                        ? <>
                            <Typography variant="overline">Other open places</Typography>
                            <SuggestionList items={others} onGo={onGo} testId="others"/>
                        </>
                        : <Button size="small" onClick={() => setShowOthers(true)}>Show other open places ({others.length})</Button>
                )}
            </DialogContent>
            <DialogActions sx={{flexWrap: "wrap", gap: 1}}>
                {weather === "gusty"
                    ? <Button onClick={() => nav.answerWeather("calm")}>It's calm, actually</Button>
                    : <Button onClick={() => nav.answerWeather("gusty")}>I'm scattered</Button>}
                {!standing && <Button onClick={() => setStanding(true)}>Just stand here</Button>}
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
