import React from "react";
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, ListItemText,
    Menu, MenuItem, Stack, Switch, TextField, Tooltip, Typography
} from "@mui/material";
import { Add, Delete, ExpandLess, Place, Tune } from "@mui/icons-material";
import { ServerApi } from "./ServerApi";
import { useRing } from "./live";
import {
    Spot, WeekHours, Whereabouts, byName, currentSpot, dayHoursText, inOrder, parseDayHours, pickUntil, startingSpots, treeProblem, weekDays
} from "./spots";

/* Where Jon is, for Your move: the "Right now I'm…" picker, the spot chip on a card he taps to correct Claude's guess,
   and the editor for the tree of spots itself. The rules live in src/spots.ts. */

/* the demo's library keeps ordinary hours, so the closed and closing-soon lines can be seen */
const demoSpots: Spot[] = startingSpots.map(s => s.id !== "library" ? s : {
    ...s, hours: {mon: [["10:00", "20:00"]], tue: [["10:00", "20:00"]], wed: [["10:00", "20:00"]], thu: [["10:00", "20:00"]],
        fri: [["10:00", "18:00"]], sat: [["10:00", "17:00"]]}
});

export function useWhere(demo: boolean) {
    const [spots, setSpots] = React.useState<Spot[]>(demo ? demoSpots : []);
    const [now, setNow] = React.useState<Whereabouts>();
    const [, setTick] = React.useState(0);
    const load = React.useCallback(() => {
        if (demo) return;
        ServerApi.where().then(w => {
            setSpots(w.spots);
            setNow(w.now);
        }).catch(() => undefined);
    }, [demo]);
    React.useEffect(load, [load]);
    useRing("claude", undefined, load, !demo);
    // a pick wears off and spots open and close by the clock, so look again every minute
    React.useEffect(() => {
        const timer = window.setInterval(() => setTick(t => t + 1), 60000);
        return () => window.clearInterval(timer);
    }, []);

    const pick = (spot: Spot | undefined) => {
        const next = spot ? {spotId: spot.id, setAt: new Date().toISOString(), until: pickUntil(spots, spot).toISOString()} : undefined;
        setNow(next);
        if (!demo) ServerApi.setWhere(next?.spotId ?? null, next?.until).catch(load);
    };
    const save = async (next: Spot[]) => {
        if (demo) {
            setSpots(next);
            return;
        }
        setSpots(await ServerApi.saveSpots(next));
    };
    return {spots, here: currentSpot(spots, now), until: now?.until, pick, save};
}

const untilWords = (until: string) => {
    const at = new Date(until);
    const time = at.toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"});
    return at.toDateString() === new Date().toDateString() ? `till ${time}` : `till tomorrow ${time}`;
};

/* "Right now I'm: In bed" — a chip that opens the tree */
export function WherePicker({spots, here, until, onPick, onEdit}: {
    spots: Spot[], here?: Spot, until?: string, onPick: (spot: Spot | undefined) => void, onEdit: () => void
}) {
    const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
    if (spots.length === 0) return null;
    const choose = (spot: Spot | undefined) => {
        setAnchor(null);
        onPick(spot);
    };
    return <Stack direction="row" alignItems="center" gap={1} sx={{minWidth: 0}}>
        <Typography variant="body2" sx={{color: "claude.inkSoft", whiteSpace: "nowrap"}}>Right now I'm</Typography>
        <Chip
            icon={<Place fontSize="small"/>}
            label={here ? here.name : "anywhere"}
            variant={here ? "filled" : "outlined"}
            onClick={e => setAnchor(e.currentTarget)}
            onDelete={here ? () => onPick(undefined) : undefined}
            data-testid="where-picker"
            sx={here ? {bgcolor: "claude.ring", color: "#fff", "& .MuiChip-icon, & .MuiChip-deleteIcon": {color: "#fff"}} : {color: "claude.ink", borderColor: "claude.line"}}
        />
        {here && until && <Typography variant="caption" sx={{color: "claude.inkSoft", whiteSpace: "nowrap"}}>{untilWords(until)}</Typography>}
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            {inOrder(spots).filter(({spot}) => spot.parentId).map(({spot, depth}) => <MenuItem
                key={spot.id} selected={spot.id === here?.id} onClick={() => choose(spot)} sx={{pl: 2 * depth}}
            >
                <ListItemText primary={spot.name} secondary={spot.staysPut ? "staying put" : undefined}/>
            </MenuItem>)}
            <MenuItem onClick={() => choose(undefined)} selected={!here}>
                <ListItemText primary="Show everything" secondary="no filter"/>
            </MenuItem>
            <Divider/>
            <MenuItem onClick={() => {
                setAnchor(null);
                onEdit();
            }}>Edit where I can be…</MenuItem>
        </Menu>
    </Stack>;
}

/* The spot an item needs, on its card: dashed while it is Claude's guess. A tap picks another. */
export function WhereChip({spots, where, whereBy, onChange}: {
    spots: Spot[], where?: string, whereBy?: "claude" | "jon", onChange: (name: string) => void
}) {
    const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
    const known = byName(spots, where);
    const label = known?.name ?? where ?? rootName(spots);
    const guess = whereBy !== "jon";
    return <>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Chip size="small" icon={<Place fontSize="small"/>} label={label} onClick={spots.length ? e => setAnchor(e.currentTarget) : undefined}
                variant="outlined" data-testid="where-chip"
                sx={{color: "claude.ink", borderColor: "claude.line", borderStyle: guess ? "dashed" : "solid"}}/>
            <Typography variant="caption" color="text.secondary">
                {!where ? "a phone will do" : guess ? "Claude's guess; tap to change" : "you set this"}
                {where && !known ? " (not one of your spots, so it shows anywhere)" : ""}
            </Typography>
        </Stack>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            {inOrder(spots).map(({spot, depth}) => <MenuItem key={spot.id} selected={spot.id === known?.id} sx={{pl: 2 + 2 * depth}}
                onClick={() => {
                    setAnchor(null);
                    onChange(spot.name);
                }}>{spot.name}</MenuItem>)}
        </Menu>
    </>;
}

const rootName = (spots: Spot[]) => spots.find(s => !s.parentId)?.name ?? "Anywhere";

const dayNames: Record<typeof weekDays[number], string> = {sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat"};

/* A spot's details: what it sits under, whether Jon stays put there, and its opening hours */
function SpotDetails({spot, spots, onChange}: {spot: Spot, spots: Spot[], onChange: (s: Spot) => void}) {
    const [texts, setTexts] = React.useState<Record<string, string>>(() =>
        Object.fromEntries(weekDays.map(d => [d, dayHoursText(spot.hours?.[d])])));
    const below = new Set(inOrder(spots).filter(({spot: s}) => {
        // a spot can't move under itself or anything under it
        for (let p: Spot | undefined = s; p; p = spots.find(x => x.id === p!.parentId)) if (p.id === spot.id) return true;
        return false;
    }).map(({spot: s}) => s.id));
    const setDay = (day: string, text: string) => {
        const next = {...texts, [day]: text};
        setTexts(next);
        const hours: WeekHours = {};
        for (const d of weekDays) {
            const ranges = parseDayHours(next[d] ?? "");
            if (!ranges) return; // keep the last good hours until this reads
            if (ranges.length) hours[d] = ranges;
        }
        onChange({...spot, hours});
    };
    return <Box sx={{pl: 2, pr: 1, pb: 1.5, pt: 0.5, borderLeft: 2, borderColor: "claude.line", ml: 1}}>
        {spot.parentId && <TextField select size="small" label="Sits under" value={spot.parentId} sx={{minWidth: 180, mb: 1}}
            onChange={e => onChange({...spot, parentId: e.target.value})}>
            {inOrder(spots).filter(({spot: s}) => !below.has(s.id)).map(({spot: s, depth}) =>
                <MenuItem key={s.id} value={s.id} sx={{pl: 2 + 2 * depth}}>{s.name}</MenuItem>)}
        </TextField>}
        {spot.parentId && <FormControlLabel
            control={<Switch size="small" checked={!!spot.staysPut} onChange={e => onChange({...spot, staysPut: e.target.checked})}/>}
            label={<Typography variant="body2">Staying put here: only things tagged here or {rootName(spots)} fit</Typography>}
        />}
        <FormControlLabel
            control={<Switch size="small" checked={!!spot.hours} onChange={e => {
                if (e.target.checked) {
                    onChange({...spot, hours: {}});
                } else {
                    onChange({...spot, hours: undefined});
                }
            }}/>}
            label={<Typography variant="body2">Has opening hours</Typography>}
        />
        {spot.hours && <Box sx={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1, mt: 0.5}}>
            {weekDays.map(d => {
                const bad = parseDayHours(texts[d] ?? "") === undefined;
                return <TextField key={d} size="small" label={dayNames[d]} placeholder="closed" value={texts[d] ?? ""}
                    error={bad} helperText={bad ? "like 10:00-18:00" : undefined}
                    onChange={e => setDay(d, e.target.value)}/>;
            })}
            <Typography variant="caption" color="text.secondary" sx={{gridColumn: "1 / -1"}}>
                Blank is closed. Two stretches: 9:00-12:00, 13:00-17:00.
            </Typography>
        </Box>}
    </Box>;
}

/* The tree of spots, edited as a whole and saved at once */
export function SpotsEditor({open, spots, onClose, onSave}: {
    open: boolean, spots: Spot[], onClose: () => void, onSave: (spots: Spot[]) => Promise<void>
}) {
    const [draft, setDraft] = React.useState<Spot[]>(spots);
    const [openDetails, setOpenDetails] = React.useState<string>();
    const [error, setError] = React.useState<string>();
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => {
        if (open) {
            setDraft(spots);
            setError(undefined);
            setOpenDetails(undefined);
        }
    }, [open, spots]);
    const update = (spot: Spot) => setDraft(d => d.map(s => s.id === spot.id ? spot : s));
    const remove = (spot: Spot) => {
        const gone = new Set([spot.id]);
        let grew = true;
        while (grew) {
            grew = false;
            draft.forEach(s => {
                if (s.parentId && gone.has(s.parentId) && !gone.has(s.id)) {
                    gone.add(s.id);
                    grew = true;
                }
            });
        }
        setDraft(d => d.filter(s => !gone.has(s.id)));
    };
    const addUnder = (parent: Spot) => {
        const id = `spot-${Math.random().toString(36).slice(2, 10)}`;
        const position = Math.max(-1, ...draft.filter(s => s.parentId === parent.id).map(s => s.position)) + 1;
        setDraft(d => [...d, {id, parentId: parent.id, name: "", position}]);
    };
    const save = async () => {
        const clean = draft.map(s => ({...s, name: s.name.trim()}));
        const problem = treeProblem(clean);
        if (problem) {
            setError(problem);
            return;
        }
        setSaving(true);
        try {
            await onSave(clean);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save.");
        } finally {
            setSaving(false);
        }
    };
    return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle>Where I can be</DialogTitle>
        <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{mb: 1.5}}>
                Claude tags each to-do and ask with the spot it needs. When you say where you are, Your move shows what fits
                there: things tagged with that spot or any spot above it.
            </Typography>
            {inOrder(draft).map(({spot, depth}) => <Box key={spot.id} sx={{pl: 2 * depth}}>
                <Stack direction="row" alignItems="center" gap={0.5} sx={{py: 0.5}}>
                    <TextField size="small" value={spot.name} placeholder="Name this spot" autoFocus={!spot.name}
                        inputProps={{"aria-label": "Spot name", maxLength: 40}}
                        onChange={e => update({...spot, name: e.target.value})} sx={{flexGrow: 1, minWidth: 0}}/>
                    <Tooltip title="Add a spot under this one">
                        <IconButton size="small" aria-label={`Add a spot under ${spot.name}`} onClick={() => addUnder(spot)}><Add fontSize="small"/></IconButton>
                    </Tooltip>
                    <Tooltip title="Hours and more">
                        <IconButton size="small" aria-label={`Details for ${spot.name}`} onClick={() => setOpenDetails(o => o === spot.id ? undefined : spot.id)}
                            sx={{color: spot.hours || spot.staysPut ? "claude.ring" : undefined}}>
                            {openDetails === spot.id ? <ExpandLess fontSize="small"/> : <Tune fontSize="small"/>}
                        </IconButton>
                    </Tooltip>
                    {spot.parentId ? <Tooltip title="Remove it and the spots under it">
                        <IconButton size="small" aria-label={`Remove ${spot.name}`} onClick={() => remove(spot)}><Delete fontSize="small"/></IconButton>
                    </Tooltip> : <Box sx={{width: 34}}/>}
                </Stack>
                {openDetails === spot.id && <SpotDetails spot={spot} spots={draft} onChange={update}/>}
            </Box>)}
            {error && <Alert severity="warning" sx={{mt: 1}}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose} sx={{color: "claude.ink"}}>Cancel</Button>
            <Button variant="contained" onClick={save} disabled={saving} sx={{bgcolor: "claude.ring", "&:hover": {bgcolor: "claude.ringHover"}}}>Save</Button>
        </DialogActions>
    </Dialog>;
}
