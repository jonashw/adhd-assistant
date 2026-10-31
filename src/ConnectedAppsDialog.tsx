import React from "react";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography
} from "@mui/material";
import { Connection, ServerApi } from "./ServerApi";

/* The apps (Claude) Jon has let read his map and raise signals, each revocable (NFR-3) */
export function ConnectedAppsDialog({open, onClose}: {open: boolean, onClose: () => void}) {
    const [connections, setConnections] = React.useState<Connection[]>();
    const [error, setError] = React.useState<string>();
    const load = React.useCallback(() => {
        ServerApi.listConnections().then(setConnections).catch((e: Error) => setError(e.message));
    }, []);
    React.useEffect(() => {
        if (open) {
            setError(undefined);
            load();
        }
    }, [open, load]);
    const connectorUrl = `${window.location.origin}/mcp`;
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="connected-apps">
            <DialogTitle>Connected apps</DialogTitle>
            <DialogContent>
                <Typography variant="body2" gutterBottom>
                    To connect Claude, add a custom connector in Claude's settings with this address. Claude sends you
                    back here to sign in and allow it; nothing secret is copied anywhere.
                </Typography>
                <Typography variant="body2" sx={{fontFamily: "monospace", my: 1, wordBreak: "break-all"}}>{connectorUrl}</Typography>
                {error && <Alert severity="warning">{error}</Alert>}
                {connections?.length === 0 && <Typography color="text.secondary" sx={{mt: 2}}>Nothing is connected.</Typography>}
                <List dense>
                    {connections?.map(c => (
                        <ListItem key={c.id} disableGutters secondaryAction={
                            <Button size="small" color="warning"
                                onClick={() => ServerApi.revokeConnection(c.id).then(load).catch((e: Error) => setError(e.message))}>
                                Revoke
                            </Button>
                        }>
                            <ListItemText primary={c.name} secondary={`Connected ${new Date(c.connectedAt).toLocaleString()}`}/>
                        </ListItem>
                    ))}
                </List>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Done</Button>
            </DialogActions>
        </Dialog>
    );
}
