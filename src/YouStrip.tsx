import React from "react";
import { createPortal } from "react-dom";
import { Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Fab, Stack, Typography } from "@mui/material";
import { Close } from "@mui/icons-material";
import { MapScene, MindMapGraphData } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { minutesAloft, reelInStep, shouldAskWeather, shouldTug, standingAt, stringOut, tunables } from "./Navigator";
import { Jon, RabbitBurrow } from "./Crew";
import { WhatsNextDialog } from "./WhatsNextDialog";

export const youStripHeight = 36;

const pulse = {
    "@keyframes ctaPulse": {"0%, 100%": {transform: "scale(1)"}, "50%": {transform: "scale(1.06)"}},
    animation: "ctaPulse 1.6s ease-in-out infinite",
    "@media (prefers-reduced-motion: reduce)": {animation: "none"}
};

/* The You strip: where Jon stands, whether he is tied off or aloft, and the kit's notes (the tug, the weather check) */
export function YouStrip({graph, onChange, selectNodeId, actionsSlot, nextSlot}: {
    graph: MindMapGraphData,
    /* where the strip's buttons go: the row of calls to action at the foot of the map */
    actionsSlot?: HTMLElement | null,
    /* and where What's next goes, with the buttons for finding your way */
    nextSlot?: HTMLElement | null,
    onChange?: (graph: MindMapGraphData) => void,
    selectNodeId: (id: string) => void
}) {
    const nav = useNavigator();
    const {tether, now} = nav;
    //Balloon-head's picture calls HOME base camp
    const homeName = graph.nodes.find(n => n.type === "HOME")?.scene === "crew" ? "Base camp" : "HOME";
    const labelOf = (id: string) => {
        const node = graph.nodes.find(n => n.id === id);
        return node ? (node.type === "HOME" ? homeName : node.label) : "a place that's gone";
    };
    const here = standingAt(tether);
    const back = reelInStep(tether);
    const [whatsNextOpen, setWhatsNextOpen] = React.useState(false);
    const [offerTieOff, setOfferTieOff] = React.useState<string>();
    const [tugSnoozedUntil, setTugSnoozedUntil] = React.useState(0);
    const [weatherSnoozedUntil, setWeatherSnoozedUntil] = React.useState(0);

    //the offer to tie off lasts a little while, then the button settles back
    React.useEffect(() => {
        if (offerTieOff === undefined) {
            return;
        }
        const timer = window.setTimeout(() => setOfferTieOff(undefined), 12000);
        return () => window.clearTimeout(timer);
    }, [offerTieOff]);

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

    //the tug and the offer to tie off land on the buttons that answer them, not in notes over the map
    const offering = offerTieOff !== undefined && here === offerTieOff && tether.state === "aloft";
    const tugNote = tether.state === "aloft" && tether.setDown !== homeId
        ? `${burrow ? "The work you left" : "Set down at your feet"}: ${labelOf(tether.setDown)}`
        : `${homeName === "HOME" ? "Home" : homeName} is ${stringOut(tether)} ${burrow ? "hole(s) up" : "step(s) back"}.`;
    const actions = (
        <>
            {tether.state === "tied"
                ? <Fab variant="extended" size="medium" onClick={nav.untie}>{words.untie}</Fab>
                : <>
                    {back && <Badge color="warning" badgeContent={stringOut(tether)} invisible={!tugging} overlap="rectangular" data-testid={tugging ? "tug" : undefined}>
                        <Fab variant="extended" size="medium" color={tugging ? "warning" : "default"} onClick={reelIn}
                            title={tugging ? tugNote : undefined} aria-label={tugging ? `${words.reelIn}. ${tugNote}` : words.reelIn}
                            sx={tugging ? pulse : undefined}>
                            {words.reelIn}
                        </Fab>
                    </Badge>}
                    {tugging && <Fab size="small" onClick={() => setTugSnoozedUntil(now.getTime() + 15 * 60_000)}
                        title="Not yet" aria-label="Not yet: snooze the tug for 15 minutes"><Close fontSize="small"/></Fab>}
                    {offering && <Box role="status" sx={{bgcolor: "background.paper", borderRadius: 5, px: 1.5, py: 0.75, boxShadow: 2,
                        typography: "body2", maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                        You're at <b>{labelOf(here)}</b>
                    </Box>}
                    <Fab variant="extended" size="medium" color={offering ? "success" : "default"} sx={offering ? pulse : undefined}
                        onClick={() => {
                            nav.tieOff(here);
                            setOfferTieOff(undefined);
                        }}>
                        {words.tieOff}
                    </Fab>
                </>}
        </>
    );
    const next = (
        <>
            <Badge
                badgeContent={nav.trail.unplaced.length}
                color="warning"
                data-testid="claude-asks-badge"
                title={nav.trail.unplaced.length > 0 ? `${nav.trail.unplaced.length} Claude thread(s) asking which place they serve` : undefined}
                sx={{flexShrink: 0, "& .MuiBadge-badge": {fontWeight: 700}}}
            >
                <Fab variant="extended" size="medium" color="primary" onClick={() => setWhatsNextOpen(true)}>What's next</Fab>
            </Badge>
        </>
    );

    return (
        <>
            <Stack
                direction="row"
                alignItems="center"
                gap={0.5}
                sx={{
                    height: youStripHeight, py: 0, px: 1, flexShrink: 0, overflow: "hidden",
                    borderBottom: 1, borderColor: "divider", bgcolor: "background.paper",
                    "& .MuiButton-root": {flexShrink: 0, minWidth: 0, px: 1}
                }}
                data-testid="you-strip"
            >
                <Box sx={{flex: "1 1 auto", minWidth: 0, lineHeight: 1.3, ml: 0.5}}>
                    {tether.state === "tied"
                        ? <Typography variant="body2" noWrap>{words.tiedAt} <b>{labelOf(tether.at)}</b></Typography>
                        : <Typography variant="body2" noWrap>
                            {words.aloft}
                            <Box component="span" sx={{color: "text.secondary"}}> · {words.setDown}: {labelOf(tether.setDown)}</Box>
                        </Typography>}
                </Box>
            </Stack>



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

            {actionsSlot && createPortal(actions, actionsSlot)}
            {nextSlot && createPortal(next, nextSlot)}
        </>
    );
}
