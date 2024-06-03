import { Fab } from "@mui/material";
import { Mic } from "@mui/icons-material";
import { ListeningStatus } from "./useSpeechRecognition";

//import { useContainerHeight } from "./useContainerWidth";
export function ListenFab({
    status, start, stop, fill
}: {
    status: ListeningStatus;
    start: () => void;
    stop: () => void;
    fill?: boolean;
}) {
    const active = status === "listening" || status === "recognizing"; 
    return <Fab
        sx={ fill ? {width:'100%'} : {}}
        variant={"extended"}
        color={active ? "error" : "default"}
        onClick={active ? stop : start}
        disabled={status === "loading"}
    >
        <Mic sx={{ mr: 1 }} />
        {status === 'listening' 
        ? 'Stop' 
        : status === 'recognizing'
        ? '...'
        : 'Listen'}
    </Fab>;
}
