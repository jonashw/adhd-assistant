import React from "react";
import { Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, Typography } from "@mui/material";
import { MindMapGraphData } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { minutesAloft, reelInStep, shouldAskWeather, shouldTug, standingAt, stringOut, tunables } from "./Navigator";
import { Dog, Jon, YouStage } from "./Crew";
import { WhatsNextDialog } from "./WhatsNextDialog";

/* height of the stage in the companion row; the row itself grows to fit its buttons */
export const youStageHeight = 100;

function useLabelOf(graph: MindMapGraphData) {
    return (id: string) => {
        const node = graph.nodes.find(n => n.id === id);
        return node ? (node.type === "HOME" ? "HOME" : node.label) : "a place that's gone";
    };
}

/* The companion row along the bottom of the map: you and the crew in the corner, where you stand in words,
   and what you can do next. Also the kit's notes (the tug, the weather check). */
export function YouStrip({graph, onChange, selectNodeId, deeper}: {
    graph: MindMapGraphData,
    onChange?: (graph: MindMapGraphData) => void,
    selectNodeId: (id: string) => void,
    /* the Deeper button: go down a rabbit hole from the selected place */
    deeper?: {disabled: boolean, onClick: () => void}
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
                alignItems="flex-end"
                gap={1}
                sx={{
                    px: 1.5, pt: 1, pb: 1.5, flexShrink: 0,
                    borderTop: 1, borderColor: "divider", bgcolor: "background.paper"
                }}
                data-testid="you-strip"
            >
                {/* left: you and the crew, close at hand */}
                <Box sx={{flexShrink: 0}}>
                    <YouStage height={youStageHeight} aloft={tether.state === "aloft"} stringOut={stringOut(tether)} inClouds={inClouds}/>
                </Box>
                {/* centre: where you stand, in words */}
                <Box sx={{flex: "1 1 auto", minWidth: 0, textAlign: "center", alignSelf: "center", lineHeight: 1.25}} data-testid="you-label">
                    {tether.state === "tied"
                        ? <Typography variant="body2">Tied off at <b>{labelOf(tether.at)}</b></Typography>
                        : <>
                            <Typography variant="body2">Aloft {minutesAloft(tether, now)} min, string out {stringOut(tether)}</Typography>
                            <Typography variant="caption" color="text.secondary" component="div">
                                Set down: {labelOf(tether.setDown)}
                            </Typography>
                        </>}
                </Box>
                {/* right: what you can do */}
                <Stack gap={0.75} alignItems="stretch" sx={{
                    flexShrink: 0,
                    "& .MuiButton-root": {borderRadius: 99, minWidth: 0, px: 1.75, whiteSpace: "nowrap", boxShadow: 2}
                }}>
                    {tether.state === "tied"
                        ? <Button size="small" variant="outlined" sx={{bgcolor: "background.paper"}} onClick={nav.untie}>Untie</Button>
                        : <>
                            {back && <Button size="small" variant="outlined" sx={{bgcolor: "background.paper"}} onClick={reelIn}>Reel in</Button>}
                            <Button size="small" variant="outlined" sx={{bgcolor: "background.paper"}} onClick={() => nav.tieOff(here)}>Tie off</Button>
                        </>}
                    <Badge
                        badgeContent={nav.trail.unplaced.length}
                        color="warning"
                        data-testid="claude-asks-badge"
                        title={nav.trail.unplaced.length > 0 ? `${nav.trail.unplaced.length} Claude thread(s) asking which place they serve` : undefined}
                        sx={{"& .MuiBadge-badge": {fontWeight: 700, top: 3, right: 5}}}
                    >
                        <Button size="small" variant="contained" fullWidth onClick={() => setWhatsNextOpen(true)}>
                            What's next
                        </Button>
                    </Badge>
                    {deeper && <Button size="small" variant="contained" color="info" disabled={deeper.disabled} onClick={deeper.onClick}>
                        Deeper
                    </Button>}
                </Stack>
            </Stack>

            {tugging && <Alert
                icon={<Jon size={52} doing="aloft" stringOut={stringOut(tether)} spider="tug"/>}
                severity="info"
                //floats above the map, so the canvas never jumps when the tug comes and goes
                sx={{position: "fixed", left: 8, right: 8, bottom: 160, zIndex: 1200, boxShadow: 3}}
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
