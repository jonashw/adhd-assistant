import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { MindMapGraphData } from "./MindMap";
import { Stake } from "./TrailTypes";
import { chainOf, chartStake } from "./stakeGraph";
import { useNavigator } from "./NavigatorContext";
import { GraphRepositoryContext } from "./GraphRepositoryContext";

/* The card a dashed stake opens (E7.S3); the drawing and charting helpers are in stakeGraph.ts */

const moveWords: Record<Stake["move"], string> = {
    drill: "You went deeper here",
    sideways: "You moved on to this beside where you were",
    surface: "You came back up to this",
    jump: "You jumped to this",
    return: "You came back to this",
    stay: "You talked about this",
    ask: "You asked about this"
};

/* What a tap on a dashed stake opens: chart it as a real place, or not now */
export function StakeDialog({stakeId, graph, onChange, onClose}: {
    stakeId?: string,
    graph: MindMapGraphData,
    onChange?: (graph: MindMapGraphData) => void,
    onClose: (placeId?: string) => void
}) {
    const nav = useNavigator();
    const {whenSaved} = React.useContext(GraphRepositoryContext);
    const [error, setError] = React.useState<string>();
    const stake = nav.trail.stakes.find(s => s.id === stakeId);
    const reach = stake ? chainOf(nav.trail.stakes, stake.id) : undefined;
    const under = reach && graph.nodes.find(n => n.id === reach.underNoteId);
    const above = reach ? reach.chain.slice(0, -1).map(s => s.topic) : [];
    const chart = async () => {
        if (!stake || !onChange) return;
        const result = chartStake(graph, nav.trail.stakes, stake.id);
        if (!result) {
            setError("The place it hangs from is gone.");
            return;
        }
        const [charted, made] = result;
        onChange(charted);
        try {
            await whenSaved(nav.mapId);
            for (const {stakeId, noteId} of made) {
                await nav.settleStake(stakeId, {charted: noteId});
            }
            onClose(made.at(-1)?.noteId);
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const dismiss = async () => {
        if (!stake) return;
        try {
            await nav.settleStake(stake.id, "dismissed");
            onClose();
        } catch (e) {
            setError((e as Error).message);
        }
    };
    return (
        <Dialog open={stake !== undefined} onClose={() => onClose()} data-testid="stake-dialog">
            {stake && <>
                <DialogTitle>{stake.topic}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {moveWords[stake.move]}, {new Date(stake.madeAt).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit"})}.
                        {" "}It's a dashed stake{under ? ` under ${[under.type === "HOME" ? "HOME" : under.label, ...above].join(" › ")}` : ""} until you chart it.
                    </Typography>
                    {above.length > 0 && <Typography variant="caption" color="text.secondary" component="p" sx={{mt: 1}}>
                        Charting it also charts {above.join(" › ")} above it.
                    </Typography>}
                    {error && <Typography variant="body2" color="error" sx={{mt: 1}}>{error}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={dismiss}>Not now</Button>
                    <Button variant="contained" onClick={chart} disabled={!onChange}>Chart it</Button>
                </DialogActions>
            </>}
        </Dialog>
    );
}
