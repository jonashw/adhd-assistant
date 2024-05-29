import { Fab } from "@mui/material";
import { Mic } from "@mui/icons-material";
import { ListeningStatus } from "./useSpeechRecognition";

//import { useContainerHeight } from "./useContainerWidth";
export function ListenFab({
    status, start, stop
}: {
    status: ListeningStatus;
    start: () => void;
    stop: () => void;
}) {
    return <Fab
        variant={"extended"}
        color={status === "listening" ? "error" : "default"}
        onClick={status === "listening" ? stop : start}
        disabled={status === "loading"}
    >
        {status !== "listening" && <Mic sx={{ mr: 1 }} />} {status === 'listening' ? 'Stop' : 'Listen'}
    </Fab>;
}
