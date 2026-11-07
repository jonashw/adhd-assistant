import React from "react";
import {
    Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText, Stack, TextField,
    Tooltip, Typography
} from "@mui/material";
import { ContentCopy, Delete } from "@mui/icons-material";
import { ServerApi } from "./ServerApi";
import { Spot } from "./spots";

/* Arrival alerts (worker/src/arrivals.ts): turn on notifications on this phone, and make a key the phone's own
   automations use to say "I've arrived at Costco". The app can't watch the phone's location while it's closed;
   Tasker, MacroDroid or Shortcuts can, and they call the arrival link. */

const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription(): Promise<PushSubscription | null> {
    if (!pushSupported()) return null;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return registration ? registration.pushManager.getSubscription() : null;
}

function Copyable({text, label}: {text: string, label: string}) {
    const [copied, setCopied] = React.useState(false);
    return <Box sx={{position: "relative", mt: 0.5}}>
        <Box component="pre" sx={{m: 0, p: 1.5, pr: 5, bgcolor: "claude.fill", borderRadius: 1, fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere"}}>
            {text}
        </Box>
        <Tooltip title={copied ? "Copied" : `Copy ${label}`}>
            <IconButton size="small" aria-label={`Copy ${label}`} sx={{position: "absolute", top: 4, right: 4}} onClick={() => {
                navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined);
            }}><ContentCopy fontSize="small"/></IconButton>
        </Tooltip>
    </Box>;
}

export function ArrivalAlerts({open, onClose, spots, demo}: {open: boolean, onClose: () => void, spots: Spot[], demo: boolean}) {
    const [publicKey, setPublicKey] = React.useState<string>();
    const [problem, setProblem] = React.useState<string>();
    const [subscribed, setSubscribed] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const [keys, setKeys] = React.useState<{id: string, label: string, createdAt: string, lastUsedAt?: string}[]>([]);
    const [newKey, setNewKey] = React.useState<{label: string, token: string}>();
    const [label, setLabel] = React.useState("My phone");

    const load = React.useCallback(async () => {
        if (demo) {
            setProblem("This is the demo: nothing here is saved or sent.");
            return;
        }
        try {
            const [info, hookKeys, sub] = await Promise.all([ServerApi.pushKey(), ServerApi.hookKeys(), currentSubscription()]);
            setPublicKey(info.publicKey);
            setProblem(info.problem);
            setKeys(hookKeys);
            setSubscribed(!!sub);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [demo]);
    React.useEffect(() => {
        if (open) {
            setNewKey(undefined);
            setError(undefined);
            load();
        }
    }, [open, load]);

    const turnOn = async () => {
        if (!publicKey) return;
        setBusy(true);
        setError(undefined);
        try {
            if (await Notification.requestPermission() !== "granted") {
                throw new Error("Notifications are blocked for this site. Allow them in the browser's site settings.");
            }
            const registration = await navigator.serviceWorker.register("/sw.js", {scope: "/"});
            await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey)});
            await ServerApi.subscribePush(sub.toJSON(), navigator.userAgent.includes("Android") ? "Android phone" : "Browser");
            setSubscribed(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };
    const turnOff = async () => {
        setBusy(true);
        try {
            const sub = await currentSubscription();
            if (sub) {
                await ServerApi.unsubscribePush(sub.endpoint);
                await sub.unsubscribe();
            }
            setSubscribed(false);
        } finally {
            setBusy(false);
        }
    };
    const makeKey = async () => {
        setError(undefined);
        try {
            const made = await ServerApi.makeHookKey(label);
            setNewKey(made);
            setKeys(await ServerApi.hookKeys());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };
    const revoke = async (id: string) => {
        await ServerApi.revokeHookKey(id);
        setKeys(k => k.filter(x => x.id !== id));
    };

    const link = `${window.location.origin}/api/hook/arrive`;
    const example = spots.find(s => s.name === "Costco")?.name ?? spots.find(s => s.parentId)?.name ?? "Home";
    const call = (token: string) => `POST ${link}\nAuthorization: Bearer ${token}\nContent-Type: application/json\n\n{"spot": "${example}"}`;

    return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
        <DialogTitle>Arrival alerts</DialogTitle>
        <DialogContent dividers>
            <Typography variant="body2" color="text.secondary">
                When you get somewhere, your phone tells the app, and the app sets where you are. If something waits for you
                there, you get a notification: "You're at {example}: 2 things to do here". Things that work from anywhere
                don't count, since they don't need the trip.
            </Typography>
            {problem && <Alert severity="info" sx={{mt: 1.5}}>{problem}</Alert>}
            {error && <Alert severity="warning" sx={{mt: 1.5}}>{error}</Alert>}

            <Typography variant="overline" display="block" sx={{mt: 2, color: "claude.inkSoft"}}>1. Notifications on this phone</Typography>
            {!pushSupported() ? <Typography variant="body2">This browser can't take notifications. On Android, open the app in Chrome.</Typography>
                : <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                    {subscribed
                        ? <><Typography variant="body2">On for this phone.</Typography>
                            <Button size="small" onClick={turnOff} disabled={busy} sx={{color: "claude.ink"}}>Turn off</Button></>
                        : <Button size="small" variant="contained" onClick={turnOn} disabled={busy || !publicKey} data-testid="push-on"
                            sx={{bgcolor: "claude.ring", "&:hover": {bgcolor: "claude.ringHover"}}}>Turn on notifications</Button>}
                </Stack>}

            <Typography variant="overline" display="block" sx={{mt: 2, color: "claude.inkSoft"}}>2. A key for your phone's automations</Typography>
            {keys.length > 0 && <List dense disablePadding>
                {keys.map(k => <ListItem key={k.id} disableGutters secondaryAction={<Tooltip title="Revoke this key">
                    <IconButton edge="end" size="small" aria-label={`Revoke ${k.label}`} onClick={() => revoke(k.id)}><Delete fontSize="small"/></IconButton>
                </Tooltip>}>
                    <ListItemText primary={k.label} secondary={k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "not used yet"}/>
                </ListItem>)}
            </List>}
            {newKey
                ? <Box>
                    <Alert severity="success" sx={{mb: 1}}>Here is the key for {newKey.label}. It shows only once; copy it into your automation now.</Alert>
                    <Copyable label="the call" text={call(newKey.token)}/>
                </Box>
                : <Stack direction="row" gap={1} alignItems="center" sx={{mt: 1}}>
                    <TextField size="small" label="Which device" value={label} onChange={e => setLabel(e.target.value)} sx={{maxWidth: 220}}/>
                    <Button size="small" variant="outlined" onClick={makeKey} disabled={demo} sx={{color: "claude.ink", borderColor: "claude.line", whiteSpace: "nowrap", flexShrink: 0}}>Make a key</Button>
                </Stack>}

            <Typography variant="overline" display="block" sx={{mt: 2, color: "claude.inkSoft"}}>3. Teach your phone when to call it</Typography>
            <Box component="ul" sx={{m: 0, pl: 2.5, "& li": {mb: 0.75}}}>
                <Typography component="li" variant="body2">
                    <b>Tasker</b>: a Profile with a Location context (or Wi-Fi Connected for Home), and a Task with an HTTP Request:
                    method POST, the link and header above, body {`{"spot": "${example}"}`}. Add an exit task with {`{"spot": "${example}", "event": "leave"}`}.
                </Typography>
                <Typography component="li" variant="body2">
                    <b>MacroDroid</b>: trigger Geofence (enter or exit), action HTTP Request, the same link, header and body.
                </Typography>
                <Typography component="li" variant="body2">
                    <b>In bed</b>: trigger on Bedtime mode turning on, with {`{"spot": "In bed"}`}; it clears itself in the morning.
                </Typography>
                <Typography component="li" variant="body2">
                    Use your spot names exactly as they are in Where I can be: {spots.filter(s => s.parentId).map(s => s.name).join(", ")}.
                </Typography>
            </Box>
        </DialogContent>
        <DialogActions>
            <Button onClick={onClose} sx={{color: "claude.ink"}}>Done</Button>
        </DialogActions>
    </Dialog>;
}
