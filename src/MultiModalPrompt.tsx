import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import React from "react";
import { ListenFab } from "./ListenFab";
import { Transcript, useSpeechRecognition } from "./useSpeechRecognition";
import { useLocalStorage } from "./useLocalStorage";

export type MultiModalPromptRef = {
    open: (defaultValue?: string) => Promise<string|undefined>
};

export function MultiModalPrompt({
    defaultValue,
    title,
    instructions,
    open,
    onClose,
    label
}: {
    defaultValue?: string
    title: string,
    instructions: string,
    open: boolean,
    onClose: (name?: string) => void,
    label?: string
}) {
    const [value, setValue] = React.useState(defaultValue);
    const [autoListen, setAutoListen] = useLocalStorage(
        true,
        "AUTO_LISTEN_IN_MULTIMODAL",
        b => b.toString(),
        str => str === "true"
    );
    const { listeningStatus, startListening, stopListening, transcript } =
        useSpeechRecognition({
            autoStart: autoListen,
            onRecognize: React.useCallback((result: Transcript | undefined) => {
                if(!result || !result.isFinal){
                    return;
                }
                console.log({result});
                setValue(result.value);
                onClose(result.value);
            },[onClose]),
            interimResults: true,
            maxAlternatives: 1,
            continuous: true
        });

    return (
        <Dialog
            open={open}
            onClose={props => {
                console.log({ props });
                onClose();
            }}
            PaperProps={{
                component: 'form',
                onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    const formJson = Object.fromEntries((formData as any).entries());
                    onClose(formJson.value);
                }
            }}
        >
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText gutterBottom>
                    {instructions}
                </DialogContentText>
                <ListenFab fill status={listeningStatus} start={startListening} stop={stopListening} />
                {transcript && !transcript.isFinal && <Typography gutterBottom>{transcript.value}</Typography>}
                {listeningStatus === "off" && (
                    <Stack direction={"column"}>
                        <TextField
                            required
                            margin="dense"
                            id="value"
                            onFocus={e => {
                                e.target.select();
                            }}
                            name="value"
                            label={label}
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            type="text"
                            fullWidth
                            variant="standard"
                            autoComplete={"off"}
                        />
                        <FormControlLabel 
                            label="Auto-listen next time"
                            control={
                                <Switch
                                    checked={autoListen}
                                    onChange={e => setAutoListen(e.target.checked)}
                                />
                            }
                        />
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => { onClose(); }}>Cancel</Button>
                <Button type="submit">OK</Button>
            </DialogActions>
        </Dialog>
    );
}