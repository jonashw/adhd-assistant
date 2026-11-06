import { Box, Tooltip } from "@mui/material";
import { LiveStatus, useLiveStatus } from "./live";

const looks: Record<Exclude<LiveStatus, "off">, {color: string, label: string}> = {
    live: {color: "#4caf50", label: "Live: changes show here as they happen"},
    connecting: {color: "#ffb300", label: "Connecting: changes show once it's live"},
    down: {color: "#9e9e9e", label: "Not live right now: changes show when it reconnects or you come back to this tab"}
};

/* A small dot in the app bar: green while changes arrive by themselves, grey when they don't */
export function LiveDot() {
    const status = useLiveStatus();
    if (status === "off") {
        return null;
    }
    const {color, label} = looks[status];
    return (
        <Tooltip title={label}>
            <Box
                role="status"
                aria-label={label}
                sx={{
                    width: 10, height: 10, borderRadius: "50%", flexShrink: 0, mx: 0.5,
                    bgcolor: color, border: "1.5px solid rgba(255,255,255,0.85)",
                    animation: status === "connecting" ? "live-dot-pulse 1.2s ease-in-out infinite" : undefined,
                    "@keyframes live-dot-pulse": {"0%, 100%": {opacity: 1}, "50%": {opacity: 0.35}}
                }}
            />
        </Tooltip>
    );
}
