import React from "react";
import { Box, Button, SvgIcon, Typography } from "@mui/material";

/* Take a break: the Sky loading screen comes back over the page, says where Jon was, and waits. No clock, no count:
   the screen never says how long he's been away. The place is saved on the device, so a break survives closing the
   app, and coming back lands him on what he left. */

export type BreakPlace = {
    /* what the veil names: the project or thread he was on, or undefined for the whole map */
    label?: string,
    /* enough to put him back: which tab and which card (the camera follows the card) */
    tab: string,
    selectedId?: string
};

const breakKey = "claudeMap.break";

/* A small JSON value kept on this device. A private window can refuse storage; then it lasts until the page closes. */

const readJson = (key: string): unknown => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
};

const keepJson = (key: string, value: unknown) => {
    try {
        if (value === undefined) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    } catch {
        // storage refused
    }
};

export const readBreak = (): BreakPlace | undefined => {
    const saved = readJson(breakKey);
    return saved && typeof saved === "object" && typeof (saved as BreakPlace).tab === "string" ? saved as BreakPlace : undefined;
};
export const saveBreak = (place: BreakPlace | undefined) => keepJson(breakKey, place);

/* The balloon from the loading screen (art/you, face-calm), bobbing unless Jon asked for less motion */
function SkyBalloon() {
    return <svg className="break-fly" viewBox="-14 -13 28 74" aria-hidden="true">
        <path d="M0 11.6 C-3 24 4 36 -1 47 C-3 52 0 55 0 57.5" fill="none" stroke="#5a4636" strokeWidth=".55" strokeLinecap="round"/>
        <circle cx="0" cy="58" r="1.2" fill="#23313d"/>
        <g className="break-bob">
            <path d="M-1.4 11.6 L0 9.6 L1.4 11.6 Z" fill="#b71c1c"/>
            <ellipse cx="0" cy="0" rx="8.6" ry="10" fill="#d32f2f" stroke="#b71c1c" strokeWidth="0.6"/>
            <ellipse cx="-3.6" cy="-4.5" rx="1.7" ry="3.2" transform="rotate(25 -3.6 -4.5)" fill="#ffffff" opacity="0.45"/>
            <ellipse cx="-2.7" cy="-1.6" rx="1.15" ry="1.55" fill="#ffffff"/>
            <ellipse cx="2.7" cy="-1.6" rx="1.15" ry="1.55" fill="#ffffff"/>
            <path d="M-3.4 2.5 Q0 4.6 3.4 2.5" fill="none" stroke="#ffffff" strokeWidth="1.25" strokeLinecap="round"/>
        </g>
    </svg>;
}

/* The balloon on a string, as a toolbar icon */
export function BalloonIcon() {
    return <SvgIcon viewBox="-12 -12 24 24">
        <ellipse cx="0" cy="-3.5" rx="6.2" ry="7.2"/>
        <path d="M-1.1 4.6 L0 3 L1.1 4.6 Z"/>
        <path d="M0 4.6 C-1.6 7 1.6 8.6 0 11.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </SvgIcon>;
}

export function BreakVeil({place, onBack}: {place: BreakPlace, onBack: () => void}) {
    const back = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => back.current?.focus(), []);
    return <Box
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-words"
        data-testid="break-veil"
        sx={{
            position: "fixed", inset: 0, zIndex: 1500, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "flex-end", overflow: "hidden", background: "linear-gradient(#cfe3f2,#eef5fa 70%,#f7f3ea)",
            "@keyframes break-in": {from: {opacity: 0}},
            animation: "break-in .45s ease",
            "& .break-fly": {height: "min(42dvh, 340px)", width: "auto", mb: "-0.6dvh", position: "relative"},
            "& .break-bob": {transformBox: "fill-box", transformOrigin: "50% 100%"},
            "@keyframes break-bob": {"50%": {transform: "translateY(-1px) rotate(-2deg)"}},
            "@media (prefers-reduced-motion: no-preference)": {"& .break-bob": {animation: "break-bob 3.6s ease-in-out infinite"}}
        }}
    >
        <svg viewBox="0 0 360 150" aria-hidden="true" style={{position: "absolute", top: "10dvh", left: "50%", transform: "translateX(-50%)", width: "min(100%, 720px)", height: "auto"}}>
            <g fill="#fff" opacity=".9">
                <ellipse cx="80" cy="38" rx="56" ry="18"/><ellipse cx="110" cy="26" rx="34" ry="20"/>
                <ellipse cx="280" cy="124" rx="50" ry="15"/><ellipse cx="300" cy="114" rx="28" ry="16"/>
            </g>
        </svg>
        <SkyBalloon/>
        <Box sx={{
            width: "140%", minHeight: "max(34dvh, 230px)", bgcolor: "#cfdcb8", borderRadius: "50% 50% 0 0 / 38px 38px 0 0",
            display: "flex", flexDirection: "column", alignItems: "center", pt: "max(3.5dvh, 22px)", pb: 3, gap: 1, textAlign: "center"
        }}>
            <Typography id="break-words" sx={{fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 600, color: "#23313d", letterSpacing: "-.01em", lineHeight: 1.1}}>
                you are here
            </Typography>
            <Typography sx={{color: "#3b4733", maxWidth: "min(88vw, 460px)", px: 2}}>
                {place.label ? <>You were on <strong>{place.label}</strong>. </> : "Your map is saved as you left it. "}
                Come back whenever.
            </Typography>
            <Button
                ref={back}
                variant="contained"
                onClick={onBack}
                sx={{mt: 1, bgcolor: "#23313d", color: "#fff", borderRadius: 999, px: 3, textTransform: "none", fontSize: "1rem", "&:hover": {bgcolor: "#3a4c5c"}}}
            >
                I'm back
            </Button>
        </Box>
    </Box>;
}
