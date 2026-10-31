import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, Typography } from "@mui/material";
import { MindMapGraphData } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { minutesAloft, reelInStep, shouldAskWeather, shouldTug, standingAt, stringOut, tunables } from "./Navigator";
import { CrewIcon } from "./Crew";
import { WhatsNextDialog } from "./WhatsNextDialog";

export const youStripHeight = 52;

/* The You strip: where Jon stands, whether he is tied off or aloft, and the kit's notes (the tug, the weather check) */
export function YouStrip({graph, selectNodeId}: {graph: MindMapGraphData, selectNodeId: (id: string) => void}) {
    const nav = useNavigator();
    const {tether, now} = nav;
    const labelOf = (id: string) => {
        const node = graph.nodes.find(n => n.id === id);
        return node ? (node.type === "HOME" ? "HOME" : node.label) : "a place that's gone";
    };
    const here = standingAt(tether);
    const back = reelInStep(tether);
    const [whatsNextOpen, setWhatsNextOpen] = React.useState(false);
    const [offerTieOff, setOfferTieOff] = React.useState<string>();
    const [tugSnoozedUntil, setTugSnoozedUntil] = React.useState(0);
    const [weatherSnoozedUntil, setWeatherSnoozedUntil] = React.useState(0);

    const reelIn = () => {
        if (back) {
            selectNodeId(back);
            if (tether.state === "aloft" && back === tether.setDown) {
                setOfferTieOff(back);
            }
        }
    };

    const tugging = nav.loaded && shouldTug(tether, nav.weatherAnswer, now) && now.getTime() >= tugSnoozedUntil;
    const askWeather = nav.loaded && shouldAskWeather(tether, nav.weatherAnswer, now) && now.getTime() >= weatherSnoozedUntil;
    const homeId = graph.nodes.find(n => n.type === "HOME")?.id;
    const recentNew = tether.state === "aloft"
        ? tether.newSteps.filter(at => Date.parse(at) >= now.getTime() - tunables.gustMinutes * 60_000).length
        : 0;

    return (
        <>
            <Stack
                direction="row"
                alignItems="center"
                gap={0.5}
                sx={{
                    height: youStripHeight, px: 1, flexShrink: 0, overflow: "hidden",
                    borderBottom: 1, borderColor: "divider", bgcolor: "background.paper",
                    "& .MuiButton-root": {flexShrink: 0, minWidth: 0, px: 1}
                }}
                data-testid="you-strip"
            >
                <Box sx={{flex: "1 1 auto", minWidth: 0, lineHeight: 1.3}}>
                    {tether.state === "tied"
                        ? <Typography variant="body2" noWrap>Tied off at <b>{labelOf(tether.at)}</b></Typography>
                        : <>
                            <Typography variant="body2" noWrap>Aloft {minutesAloft(tether, now)} min, string out {stringOut(tether)}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                                Set down: {labelOf(tether.setDown)}
                            </Typography>
                        </>}
                </Box>
                {tether.state === "tied"
                    ? <Button size="small" onClick={nav.untie}>Untie</Button>
                    : <>
                        {back && <Button size="small" onClick={reelIn}>Reel in</Button>}
                        <Button size="small" onClick={() => nav.tieOff(here)}>Tie off</Button>
                    </>}
                <Button size="small" variant="contained" onClick={() => setWhatsNextOpen(true)}>
                    What's next
                </Button>
            </Stack>

            {tugging && <Alert
                icon={<CrewIcon who="spider" size={20}/>}
                severity="info"
                //floats above the map, so the canvas never jumps when the tug comes and goes
                sx={{position: "fixed", left: 8, right: 8, bottom: 88, zIndex: 1200, boxShadow: 3}}
                data-testid="tug"
                action={<Stack direction="row">
                    {back && <Button color="inherit" size="small" onClick={reelIn}>Reel in</Button>}
                    <Button color="inherit" size="small" onClick={() => setTugSnoozedUntil(now.getTime() + 15 * 60_000)}>Not yet</Button>
                </Stack>}
            >
                {tether.state === "aloft" && tether.setDown !== homeId
                    ? <>Set down at your feet: <b>{labelOf(tether.setDown)}</b></>
                    : <>Home is {stringOut(tether)} step(s) back.</>}
            </Alert>}

            <Dialog open={askWeather} data-testid="weather-check">
                <DialogTitle sx={{display: "flex", gap: 1, alignItems: "center"}}>
                    <CrewIcon who="spider"/> Gusty up there?
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        You've stepped to {recentNew} new places in the last {tunables.gustMinutes} minutes.
                        Only you can tell gusts from a thermal.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{flexWrap: "wrap", gap: 1}}>
                    <Button onClick={() => nav.answerWeather("gusty")}>Gusty</Button>
                    <Button onClick={() => nav.answerWeather("thermal")}>Riding a thermal</Button>
                    <Button onClick={() => {
                        nav.answerWeather("calm");
                        setWeatherSnoozedUntil(now.getTime() + tunables.gustMinutes * 60_000);
                    }}>It's calm, actually</Button>
                </DialogActions>
            </Dialog>

            <WhatsNextDialog
                open={whatsNextOpen}
                graph={graph}
                onClose={() => setWhatsNextOpen(false)}
                onGo={id => {
                    setWhatsNextOpen(false);
                    selectNodeId(id);
                    setOfferTieOff(id);
                }}
            />

            <Snackbar
                open={offerTieOff !== undefined && here === offerTieOff && tether.state === "aloft"}
                autoHideDuration={12000}
                onClose={(_, reason) => reason !== "clickaway" && setOfferTieOff(undefined)}
                message={<>You're at {offerTieOff && labelOf(offerTieOff)}.</>}
                action={<Button color="info" size="small" onClick={() => {
                    if (offerTieOff) {
                        nav.tieOff(offerTieOff);
                    }
                    setOfferTieOff(undefined);
                }}>Tie off and work</Button>}
            />
        </>
    );
}
