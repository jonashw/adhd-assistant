import { Box, Fab } from "@mui/material";
import { Mic } from "@mui/icons-material";
import { ListeningStatus } from "./useSpeechRecognition";

//import { useContainerHeight } from "./useContainerWidth";
export function ListenFab({
    status, start, stop, fill, compact
}: {
    status: ListeningStatus;
    start: () => void;
    stop: () => void;
    fill?: boolean;
    /* on a phone, just the microphone */
    compact?: boolean;
}) {
    const active = status === "listening" || status === "recognizing"; 
    return <Fab
        aria-label={compact ? (active ? 'Stop listening' : 'Listen') : undefined}
        sx={ fill ? {width:'100%'} : compact ? {px: {xs: 1.5, sm: 2}, minWidth: {xs: 48, sm: 0}} : {}}
        variant={"extended"}
        color={active ? "error" : "default"}
        onClick={active ? stop : start}
        disabled={status === "loading"}
    >
        <Mic sx={compact ? { mr: {xs: 0, sm: 1} } : { mr: 1 }} />
        <Box component="span" sx={compact ? {display: {xs: 'none', sm: 'inline'}} : undefined}>
        {status === 'listening' 
        ? 'Stop' 
        : status === 'recognizing'
        ? '...'
        : 'Listen'}
        </Box>
    </Fab>;
}
