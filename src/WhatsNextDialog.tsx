import React from "react";
import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText,
    Stack, Typography, useMediaQuery, useTheme
} from "@mui/material";
import { MindMapGraphData } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { currentWeather, Suggestion, whatsNext } from "./Navigator";
import { CrewIcon } from "./Crew";

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

function Mindful() {
    return (
        <Stack alignItems="center" gap={2} sx={{py: 3, textAlign: "center"}} data-testid="mindful">
            <Box sx={{position: "relative", width: 180, height: 180}}>
                <img src="/Enso.svg" alt="" width={180} height={180}/>
                <Box sx={{position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)"}}><CrewIcon who="sloth" size={28}/></Box>
                <Box sx={{position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 0.5}}>
                    <CrewIcon who="spider" size={18}/><CrewIcon who="squirrel" size={20}/><CrewIcon who="dog" size={24}/>
                </Box>
            </Box>
            <Typography variant="overline">You are here: Mindful</Typography>
            <Typography variant="h6">Nothing needs you. You can just stand here.</Typography>
        </Stack>
    );
}

/* What's next: the app suggests where Jon's feet go; Jon picks */
export function WhatsNextDialog({open, graph, onClose, onGo}: {
    open: boolean,
    graph: MindMapGraphData,
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
        now: nav.now
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
