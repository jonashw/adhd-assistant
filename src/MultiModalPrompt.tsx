import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from "@mui/material";
import React from "react";
import { ListenFab } from "./ListenFab";
import { Transcript, useSpeechRecognition } from "./useSpeechRecognition";

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
    const { listeningStatus, startListening, stopListening, transcript } =
        useSpeechRecognition({
            autoStart: true,
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
                {listeningStatus === "off" && <TextField
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
                />}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => { onClose(); }}>Cancel</Button>
                <Button type="submit">OK</Button>
            </DialogActions>
        </Dialog>
    );
}