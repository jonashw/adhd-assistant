import React from "react";
import { Box, Button, SvgIcon, Typography, useTheme } from "@mui/material";
import { Head } from "./crew/Jon";
import { Fidget, useFidget } from "./crew/useFidget";
import "./crew/crew.css";
import { sky } from "./theme";

/* Take a break: the Sky loading screen comes back over the page and waits. It says only that he's on a break: no
   clock, no count, and no reminder of what he was doing (he knows the app remembers). The place is saved on the
   device, so a break survives closing the app, and coming back lands him on what he left. */

export type BreakPlace = {
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

/* Balloon Head from the loading screen, animated as the crew draws it: a slow bob, and now and then a blink or a
   look around (crew fidgets), all still when Jon asks for less motion */
const fidgets: Fidget[] = [
    {name: "is-blink", ms: 200, weight: 3},
    {name: "is-look", ms: 1400, weight: 1}
];

function SkyBalloon() {
    const fidget = useFidget(fidgets, [2000, 6000]);
    const s = sky[useTheme().palette.mode];
    return <svg className={["break-fly", "crew", "crew-jon", fidget].filter(Boolean).join(" ")} viewBox="-14 -13 28 74" aria-hidden="true">
        <path d="M0 11.6 C-3 24 4 36 -1 47 C-3 52 0 55 0 57.5" fill="none" stroke={s.string} strokeWidth=".55" strokeLinecap="round"/>
        <circle cx="0" cy="58" r="1.2" fill={s.weight}/>
        <g className="break-bob">
            <Head x={0} y={1.5} r={10}/>
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

export function BreakVeil({onBack}: {onBack: () => void}) {
    const back = React.useRef<HTMLButtonElement>(null);
    const s = sky[useTheme().palette.mode];
    React.useEffect(() => back.current?.focus(), []);
    return <Box
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-words"
        data-testid="break-veil"
        sx={{
            position: "fixed", inset: 0, zIndex: 1500, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "flex-end", overflow: "hidden", background: s.gradient,
            "@keyframes break-in": {from: {opacity: 0}},
            animation: "break-in .45s ease",
            "& .break-fly": {height: "min(42dvh, 340px)", width: "auto", mb: "-0.6dvh", position: "relative"},
            "& .break-bob, & .jon-head": {transformBox: "fill-box", transformOrigin: "50% 100%"},
            "@keyframes break-bob": {"50%": {transform: "translateY(-1px) rotate(-2deg)"}},
            "@media (prefers-reduced-motion: no-preference)": {"& .break-bob": {animation: "break-bob 3.6s ease-in-out infinite"}}
        }}
    >
        <svg viewBox="0 0 360 150" aria-hidden="true" style={{position: "absolute", top: "10dvh", left: "50%", transform: "translateX(-50%)", width: "min(100%, 720px)", height: "auto"}}>
            {s.stars > 0 && <g fill="#fff" opacity={s.stars}>
                <circle cx="30" cy="12" r=".9"/><circle cx="160" cy="8" r=".7"/><circle cx="215" cy="40" r="1"/>
                <circle cx="330" cy="20" r=".8"/><circle cx="250" cy="76" r=".6"/><circle cx="20" cy="96" r=".7"/>
            </g>}
            <g fill={s.cloud} opacity={s.cloudOpacity}>
                <ellipse cx="80" cy="38" rx="56" ry="18"/><ellipse cx="110" cy="26" rx="34" ry="20"/>
                <ellipse cx="280" cy="124" rx="50" ry="15"/><ellipse cx="300" cy="114" rx="28" ry="16"/>
            </g>
        </svg>
        <SkyBalloon/>
        <Box sx={{
            width: "140%", minHeight: "max(34dvh, 230px)", bgcolor: s.ground, borderRadius: "50% 50% 0 0 / 38px 38px 0 0",
            display: "flex", flexDirection: "column", alignItems: "center", pt: "max(3.5dvh, 22px)", pb: 3, gap: 1, textAlign: "center"
        }}>
            <Typography id="break-words" sx={{fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 600, color: s.words, letterSpacing: "-.01em", lineHeight: 1.1}}>
                You are on a break
            </Typography>
            <Typography sx={{color: s.sub, fontSize: "1.1rem"}}>Come back whenever</Typography>
            <Button
                ref={back}
                variant="contained"
                onClick={onBack}
                sx={{mt: 1, bgcolor: s.button, color: s.buttonText, borderRadius: 999, px: 3, textTransform: "none", fontSize: "1rem", "&:hover": {bgcolor: s.buttonHover}}}
            >
                I'm back
            </Button>
        </Box>
    </Box>;
}
