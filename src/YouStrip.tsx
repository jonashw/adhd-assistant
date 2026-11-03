import React from "react";
import { Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, Typography } from "@mui/material";
import { MapScene, MindMapGraphData } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { minutesAloft, reelInStep, shouldAskWeather, shouldTug, standingAt, stringOut, tunables } from "./Navigator";
import { Dog, Jon, RabbitBurrow, YouScene } from "./Crew";
import { WhatsNextDialog } from "./WhatsNextDialog";

export const youStripHeight = 64;

/* The You strip: where Jon stands, whether he is tied off or aloft, and the kit's notes (the tug, the weather check) */
export function YouStrip({graph, onChange, selectNodeId, sceneShownBelow = false}: {
    graph: MindMapGraphData,
    /* the main view already draws the burrow, so the strip leaves its picture out */
    sceneShownBelow?: boolean,
    onChange?: (graph: MindMapGraphData) => void,
    selectNodeId: (id: string) => void
}) {
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
    //rabbit-hole maps draw the rabbit's burrow: the map as tunnels, the rabbit where you stand, holding the work when tied off
    const scene: MapScene = graph.nodes.find(n => n.type === "HOME")?.scene ?? "crew";
    const burrow = scene === "burrow";
    //the same actions, in each scene's own words
    const words = burrow
        ? {untie: "Put it down", reelIn: "Back up a hole", tieOff: "Pick it up here", tiedAt: "Digging in at", setDown: "Left the work at",
            aloft: `Exploring, ${stringOut(tether)} hole${stringOut(tether) === 1 ? "" : "s"} out, ${minutesAloft(tether, now)} min`,
            gusty: "Lots of new holes?"}
        : {untie: "Untie", reelIn: "Reel in", tieOff: "Tie off", tiedAt: "Tied off at", setDown: "Set down",
            aloft: `Aloft ${minutesAloft(tether, now)} min, string out ${stringOut(tether)}`,
            gusty: "Gusty up there?"};
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
                    height: burrow && !sceneShownBelow ? "auto" : youStripHeight, py: burrow && !sceneShownBelow ? 0.5 : 0, px: 1, flexShrink: 0, overflow: "hidden",
                    borderBottom: 1, borderColor: "divider", bgcolor: "background.paper",
                    "& .MuiButton-root": {flexShrink: 0, minWidth: 0, px: 1}
                }}
                data-testid="you-strip"
            >
                {sceneShownBelow
                    ? null
                    : burrow
                    ? <Box sx={{flex: "0 1 auto", maxWidth: "60%", minWidth: 0}} data-testid="burrow-stage">
                        <RabbitBurrow size={150} graph={graph} at={here} carrying={tether.state === "tied"} labels={false}
                            onPick={selectNodeId}/>
                    </Box>
                    : <YouScene size={56} aloft={tether.state === "aloft"} stringOut={stringOut(tether)}/>}
                <Box sx={{flex: "1 1 auto", minWidth: 0, lineHeight: 1.3, ml: 0.5}}>
                    {tether.state === "tied"
                        ? <Typography variant="body2" noWrap>{words.tiedAt} <b>{labelOf(tether.at)}</b></Typography>
                        : <>
                            <Typography variant="body2" noWrap>{words.aloft}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                                {words.setDown}: {labelOf(tether.setDown)}
                            </Typography>
                        </>}
                </Box>
                {tether.state === "tied"
                    ? <Button size="small" onClick={nav.untie}>{words.untie}</Button>
                    : <>
                        {back && <Button size="small" onClick={reelIn}>{words.reelIn}</Button>}
                        <Button size="small" onClick={() => nav.tieOff(here)}>{words.tieOff}</Button>
                    </>}
                <Badge
                    badgeContent={nav.trail.unplaced.length}
                    color="warning"
                    data-testid="claude-asks-badge"
                    title={nav.trail.unplaced.length > 0 ? `${nav.trail.unplaced.length} Claude thread(s) asking which place they serve` : undefined}
                    sx={{flexShrink: 0, "& .MuiBadge-badge": {fontWeight: 700, top: 3, right: 5}}}
                >
                    <Button size="small" variant="contained" onClick={() => setWhatsNextOpen(true)}>
                        What's next
                    </Button>
                </Badge>
            </Stack>

            {tugging && <Alert
                icon={burrow ? false : <Jon size={52} doing="aloft" stringOut={stringOut(tether)} spider="tug"/>}
                severity="info"
                //floats above the map, so the canvas never jumps when the tug comes and goes
                sx={{position: "fixed", left: 8, right: 8, bottom: 88, zIndex: 1200, boxShadow: 3}}
                data-testid="tug"
                action={<Stack direction="row">
                    {back && <Button color="inherit" size="small" onClick={reelIn}>{words.reelIn}</Button>}
                    <Button color="inherit" size="small" onClick={() => setTugSnoozedUntil(now.getTime() + 15 * 60_000)}>Not yet</Button>
                </Stack>}
            >
                {tether.state === "aloft" && tether.setDown !== homeId
                    ? <>{burrow ? "The work you left" : "Set down at your feet"}: <b>{labelOf(tether.setDown)}</b></>
                    : <>Home is {stringOut(tether)} {burrow ? "hole(s) up" : "step(s) back"}.</>}
            </Alert>}

            <Dialog open={askWeather} data-testid="weather-check">
                <DialogTitle>{words.gusty}</DialogTitle>
                <DialogContent>
                    <Box sx={{display: "flex", justifyContent: "center", mb: 1}}>
                        {burrow
                            ? <RabbitBurrow size={140} graph={graph} at={here} labels={false}/>
                            : <Jon size={120} doing="aloft" stringOut={stringOut(tether)} spider="ask"/>}
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
