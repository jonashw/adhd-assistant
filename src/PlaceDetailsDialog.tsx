import React from "react";
import {
    Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Rating, Stack, Switch, TextField, Typography
} from "@mui/material";
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { formatDue } from "./Navigator";

/* A place's flag, what it waits on, and the two things the ranking reads: small and interest */
export function PlaceDetailsDialog({node, graph, onChange, onClose}: {
    node?: DirectedGraphNode<MindMapGraphNode>,
    graph: MindMapGraphData,
    onChange: (graph: MindMapGraphData) => void,
    onClose: () => void
}) {
    const nav = useNavigator();
    const [flagLabel, setFlagLabel] = React.useState("");
    const [flagDue, setFlagDue] = React.useState("");
    const [error, setError] = React.useState<string>();
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        setFlagLabel("");
        setFlagDue("");
        setError(undefined);
    }, [node?.id]);

    if (!node) {
        return null;
    }
    const current = graph.nodes.find(n => n.id === node.id) ?? node;
    const flag = nav.flagOf(node.id);
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const blockers = MindMap.blockersOf(graph, node.id).map(id => byId.get(id)).filter(Boolean) as MindMapGraphNode[];
    const choices = graph.nodes.filter(n =>
        n.type !== "HOME" && n.id !== node.id && !blockers.some(b => b.id === n.id));
    const isOpen = (n: MindMapGraphNode) => n.status !== "done" && n.status !== "dropped";

    const run = (work: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        work().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm" data-testid="place-details">
            <DialogTitle>{current.label}</DialogTitle>
            <DialogContent>
                <Stack gap={3} sx={{pt: 1}}>
                    {error && <Alert severity="warning">{error}</Alert>}

                    <Box>
                        <Typography variant="overline">Flag</Typography>
                        {flag
                            ? <Stack direction="row" alignItems="center" gap={1}>
                                <Typography data-testid="flag-shown">⚑ {flag.label}, due {formatDue(flag.dueAt!, nav.now)}</Typography>
                                <Button size="small" disabled={busy} onClick={() => run(() => nav.clearFlag(flag.id))}>Take it down</Button>
                            </Stack>
                            : <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                                <TextField size="small" label="Label" value={flagLabel} inputProps={{maxLength: 200}}
                                    onChange={e => setFlagLabel(e.target.value)} sx={{flex: "1 1 160px"}}/>
                                <TextField size="small" label="Due" type="date" value={flagDue}
                                    onChange={e => setFlagDue(e.target.value)} InputLabelProps={{shrink: true}}/>
                                <Button
                                    size="small"
                                    disabled={busy || !flagLabel.trim() || !flagDue}
                                    onClick={() => run(() => nav.plantFlag(node.id, flagLabel.trim(), flagDue))}
                                >Plant flag</Button>
                            </Stack>}
                    </Box>

                    <Box>
                        <Typography variant="overline">Waiting on</Typography>
                        <Stack direction="row" gap={1} flexWrap="wrap" sx={{mb: 1}} data-testid="blockers">
                            {blockers.length === 0 && <Typography variant="body2" color="text.secondary">Nothing</Typography>}
                            {blockers.map(b => (
                                <Chip
                                    key={b.id}
                                    label={isOpen(b) ? b.label : `${b.label} (${b.status})`}
                                    variant={isOpen(b) ? "filled" : "outlined"}
                                    onDelete={() => onChange(MindMap.removeBlocker(graph, node.id, b.id))}
                                />
                            ))}
                        </Stack>
                        <Autocomplete
                            size="small"
                            options={choices}
                            getOptionLabel={n => n.label}
                            getOptionDisabled={n => MindMap.wouldLoop(graph, node.id, n.id)}
                            value={null}
                            blurOnSelect
                            clearOnBlur
                            onChange={(_, chosen) => {
                                if (!chosen) {
                                    return;
                                }
                                if (MindMap.wouldLoop(graph, node.id, chosen.id)) {
                                    setError(`"${chosen.label}" already waits on this place, so this can't wait on it too.`);
                                    return;
                                }
                                onChange(MindMap.addBlocker(graph, node.id, chosen.id));
                            }}
                            renderInput={params => <TextField {...params} label="Blocked by…"/>}
                        />
                    </Box>

                    <Box>
                        <FormControlLabel
                            control={<Switch checked={current.small === true}
                                onChange={e => onChange(MindMap.setSmall(graph, node.id, e.target.checked))}/>}
                            label="Small: the next step takes 5 minutes or less"
                        />
                    </Box>

                    <Box>
                        <Typography variant="overline" component="div">Interest</Typography>
                        <Stack direction="row" alignItems="center" gap={1}>
                            <Rating
                                value={current.interest ?? null}
                                onChange={(_, value) => onChange(MindMap.setInterest(graph, node.id, value ?? undefined))}
                            />
                            <Typography variant="body2" color="text.secondary">
                                {current.interest ? "" : "Not set (neutral)"}
                            </Typography>
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Done</Button>
            </DialogActions>
        </Dialog>
    );
}
