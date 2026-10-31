import React from "react";
import {
    Alert, Autocomplete, Box, Button, Chip, Link, List, ListItem, ListItemText, MenuItem, Select, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Rating, Stack, Switch, TextField, Typography
} from "@mui/material";
import { DirectedGraphNode, MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { useNavigator } from "./NavigatorContext";
import { formatDue, targetPlaces } from "./Navigator";
import { age, isSilent, LinkedItem } from "./TrailTypes";

const kindNames: {[kind in LinkedItem["kind"]]: string} = {
    "claude.thread": "Claude thread",
    "claude.project": "Claude project",
    "github.pr": "Pull request",
    "url": "Link"
};

const stateNames = {working: "working", waiting: "waiting on you", done: "finished", failed: "ran into trouble"};

/* What a Claude thread last said, and how long ago */
function threadLine(item: LinkedItem, now: Date): string {
    if (item.kind !== "claude.thread") return kindNames[item.kind];
    const heard = item.lastHeardAt ? `, ${age(item.lastHeardAt, now)}` : "";
    if (isSilent(item, now)) return `Claude thread: check in?${heard}`;
    const note = item.stateNote ? `: ${item.stateNote}` : "";
    return `Claude thread, ${item.state ? stateNames[item.state] : "checked in"}${note}${heard}`;
}

/* Claude threads and pasted links on this place (FR-7) */
function LinkedItems({noteId, graph}: {noteId: string, graph: MindMapGraphData}) {
    const nav = useNavigator();
    const [url, setUrl] = React.useState("");
    const [error, setError] = React.useState<string>();
    const [busy, setBusy] = React.useState(false);
    const items = nav.itemsAt(noteId);
    const signals = nav.signalsAt(noteId);
    const run = (work: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        return work().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
    };
    const others = targetPlaces(graph).filter(n => n.id !== noteId);
    return (
        <Box data-testid="linked-items">
            <Typography variant="overline">Linked</Typography>
            {error && <Alert severity="warning">{error}</Alert>}
            {signals.filter(s => !s.itemId).map(s => (
                <Typography key={s.id} variant="body2">{s.label} · {age(s.raisedAt, nav.now)}</Typography>
            ))}
            {items.length === 0 && <Typography variant="body2" color="text.secondary">Nothing yet</Typography>}
            <List dense disablePadding>
                {items.map(item => {
                    const primary = item.places.find(p => p.noteId === noteId)?.primary;
                    return (
                        <ListItem key={item.id} disableGutters secondaryAction={
                            <Button size="small" disabled={busy} onClick={() => run(() => nav.removeLink(noteId, item.id))}>Unlink</Button>
                        }>
                            <ListItemText
                                primary={item.url
                                    ? <Link href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</Link>
                                    : item.title}
                                secondary={<>
                                    {threadLine(item, nav.now)}{primary || item.kind !== "claude.thread" ? "" : " · its signals land at another place"}
                                    {item.kind === "claude.thread" && primary && others.length > 0 &&
                                        <Select size="small" variant="standard" value="" displayEmpty sx={{ml: 1, fontSize: "inherit"}}
                                            onChange={e => e.target.value && run(() => nav.placeItem(item.id, String(e.target.value)))}>
                                            <MenuItem value="">Move to…</MenuItem>
                                            {others.map(n => <MenuItem key={n.id} value={n.id}>{n.label}</MenuItem>)}
                                        </Select>}
                                </>}
                                secondaryTypographyProps={{component: "div"}}
                            />
                        </ListItem>
                    );
                })}
            </List>
            <Stack direction="row" gap={1} alignItems="center" sx={{mt: 1}}>
                <TextField size="small" label="Paste a link" value={url} sx={{flex: 1}} type="url"
                    onChange={e => setUrl(e.target.value)}
                    helperText="A Claude project or thread, a GitHub PR, or any web page"/>
                <Button size="small" disabled={busy || !url.trim()}
                    onClick={() => run(() => nav.addLink(noteId, url.trim()).then(() => setUrl("")))}>Link</Button>
            </Stack>
        </Box>
    );
}

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

                    {nav.linksSupported && <LinkedItems noteId={node.id} graph={graph}/>}

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
