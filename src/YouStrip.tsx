import React from "react";
import { Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, Typography } from "@mui/material";
import { MindMapGraphData } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { minutesAloft, reelInStep, shouldAskWeather, shouldTug, standingAt, stringOut, tunables } from "./Navigator";
import { Dog, Jon, YouStage } from "./Crew";
import { WhatsNextDialog } from "./WhatsNextDialog";

export const youStripHeight = 120;

function useLabelOf(graph: MindMapGraphData) {
    return (id: string) => {
        const node = graph.nodes.find(n => n.id === id);
        return node ? (node.type === "HOME" ? "HOME" : node.label) : "a place that's gone";
    };
}

/* Where you stand, in words. It floats over the top of the map, under the toolbar, with nothing behind it */
export function YouLabel({graph}: {graph: MindMapGraphData}) {
    const {tether, now} = useNavigator();
    const labelOf = useLabelOf(graph);
    return (
        <Box sx={{position: "absolute", top: 4, left: 12, right: 12, zIndex: 1, pointerEvents: "none", lineHeight: 1.3}} data-testid="you-label">
            {tether.state === "tied"
                ? <Typography variant="body2" noWrap>Tied off at <b>{labelOf(tether.at)}</b></Typography>
                : <>
                    <Typography variant="body2" noWrap>Aloft {minutesAloft(tether, now)} min, string out {stringOut(tether)}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                        Set down: {labelOf(tether.setDown)}
                    </Typography>
                </>}
        </Box>
    );
}

/* The You strip: where Jon stands, whether he is tied off or aloft, and the kit's notes (the tug, the weather check) */
export function YouStrip({graph, onChange, selectNodeId}: {
    graph: MindMapGraphData,
    onChange?: (graph: MindMapGraphData) => void,
    selectNodeId: (id: string) => void
}) {
    const nav = useNavigator();
    const {tether, now} = nav;
    const labelOf = useLabelOf(graph);
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
    //head in the clouds: far enough or long enough up that the spider would tug, snoozed or not
    const inClouds = nav.loaded && shouldTug(tether, nav.weatherAnswer, now);
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
                gap={1}
                sx={{
                    height: youStripHeight, px: 1, flexShrink: 0, overflow: "hidden",
                    borderBottom: 1, borderColor: "divider", bgcolor: "background.paper",
                    "& .MuiButton-root": {flexShrink: 0, minWidth: 0, px: 1}
                }}
                data-testid="you-strip"
            >
                {/* the stage takes every bit of width the buttons leave */}
                <Box sx={{flex: "1 1 auto", minWidth: 0, alignSelf: "flex-end", pb: 0.5}}>
                    <YouStage height={youStripHeight - 8} aloft={tether.state === "aloft"} stringOut={stringOut(tether)} inClouds={inClouds}/>
                </Box>
                <Stack gap={0.5} alignItems="stretch" sx={{flexShrink: 0}}>
                    {tether.state === "tied"
                        ? <Button size="small" onClick={nav.untie}>Untie</Button>
                        : <Stack direction="row" gap={0.5} justifyContent="flex-end">
                            {back && <Button size="small" onClick={reelIn}>Reel in</Button>}
                            <Button size="small" onClick={() => nav.tieOff(here)}>Tie off</Button>
                        </Stack>}
                    <Badge
                        badgeContent={nav.trail.unplaced.length}
                        color="warning"
                        data-testid="claude-asks-badge"
                        title={nav.trail.unplaced.length > 0 ? `${nav.trail.unplaced.length} Claude thread(s) asking which place they serve` : undefined}
                        sx={{flexShrink: 0, "& .MuiBadge-badge": {fontWeight: 700, top: 3, right: 5}}}
                    >
                        <Button size="small" variant="contained" fullWidth onClick={() => setWhatsNextOpen(true)}>
                            What's next
                        </Button>
                    </Badge>
                </Stack>
            </Stack>

            {tugging && <Alert
                icon={<Jon size={52} doing="aloft" stringOut={stringOut(tether)} spider="tug"/>}
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
                <DialogTitle>Gusty up there?</DialogTitle>
                <DialogContent>
                    <Box sx={{display: "flex", justifyContent: "center", mb: 1}}>
                        <Jon size={120} doing="aloft" stringOut={stringOut(tether)} spider="ask"/>
                    </Box>
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
                onChange={onChange}
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
                message={<Stack direction="row" gap={1} alignItems="center">
                    <Dog size={28} doing="settle"/>
                    <span>You're at {offerTieOff && labelOf(offerTieOff)}.</span>
                </Stack>}
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
