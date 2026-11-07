import React from "react";
import { createTheme, PaletteMode, Theme, useMediaQuery, useTheme } from "@mui/material";

/* Light and dark, both built on MUI's palette. Light keeps the app's look as it was; dark follows claude.ai's dark
   theme: warm near-black surfaces (#262624 page, #30302E cards, #1F1E1D app bars), warm off-white text, quiet
   hairline borders and the clay accent (#D97757). The Claude map's own colours live in palette.claude so the canvas,
   the SVGs and the sx props all read the same tokens. */

export type ColorChoice = "system" | "light" | "dark";
export const colorChoiceKey = "adhd.colorMode";

export type BadgeColors = {color: string, text: string};
export type ClaudeTokens = {
    /* the clay accent: rings, the app bar, key buttons */
    ring: string,
    ringHover: string,
    /* the Claude map's app bar: clay in light, Claude's dark top bar in dark */
    bar: string,
    barText: string,
    barIndicator: string,
    /* the map's paper */
    fill: string,
    /* lists and cards that sat on white */
    surface: string,
    ink: string,
    inkSoft: string,
    muted: string,
    /* the map's links and the hairline under bars */
    link: string,
    /* outlines on cards and the order graph */
    line: string,
    cardEdge: string,
    keyCardBg: string,
    /* Leverage heat, coolest to hottest */
    heat: [string, string, string, string],
    /* artifacts: loud purple for new, soft for updated */
    artifact: string,
    artifactText: string,
    artifactSoft: string,
    artifactEdge: string,
    neutralPill: string,
    neutralPillText: string,
    /* a thread's open ask */
    askBg: string,
    askEdge: string,
    askLabel: string,
    askText: string,
    track: string,
    todoBg: string,
    /* a thin ring that lifts a dot off whatever it sits on */
    halo: string,
    badges: Record<"blocked" | "review_ready" | "working" | "failed" | "stopped" | "done" | "stale" | "gone" | "someday" | "later", BadgeColors>,
    ci: Record<"success" | "failure" | "pending" | "none", string>
};

const lightBadges: ClaudeTokens["badges"] = {
    blocked: {color: "#F59E0B", text: "#1F1300"},
    review_ready: {color: "#16A34A", text: "#FFFFFF"},
    working: {color: "#2563EB", text: "#FFFFFF"},
    failed: {color: "#DC2626", text: "#FFFFFF"},
    stopped: {color: "#64748B", text: "#FFFFFF"},
    done: {color: "#9CA3AF", text: "#FFFFFF"},
    stale: {color: "#E5E7EB", text: "#374151"},
    gone: {color: "#E5E7EB", text: "#374151"},
    someday: {color: "#FDE9C4", text: "#7C4A03"},
    later: {color: "#E0E7FF", text: "#3730A3"}
};

const claudeLight: ClaudeTokens = {
    ring: "#D97757",
    ringHover: "#C4623F",
    bar: "#D97757",
    barText: "#FFFFFF",
    barIndicator: "#FFFFFF",
    fill: "#FAF6EF",
    surface: "#FFFFFF",
    ink: "#3D2B1F",
    inkSoft: "#5B4636",
    muted: "#9C8B7A",
    link: "#E3C7B5",
    line: "#C9B8A6",
    cardEdge: "#E7D9CB",
    keyCardBg: "#FFF8F3",
    heat: ["#F3ECE2", "#F6D9C4", "#EFAF8A", "#D97757"],
    artifact: "#7C3AED",
    artifactText: "#5B21B6",
    artifactSoft: "#F3E8FF",
    artifactEdge: "#C4B5FD",
    neutralPill: "#F3F4F6",
    neutralPillText: "#4B5563",
    askBg: "#FEF3C7",
    askEdge: "#F59E0B",
    askLabel: "#92400E",
    askText: "#1F1300",
    track: "#F1E4DA",
    todoBg: "#F3ECE2",
    halo: "#FFFFFF",
    badges: lightBadges,
    ci: {success: "#16A34A", failure: "#DC2626", pending: "#F59E0B", none: "#9CA3AF"}
};

/* claude.ai's dark theme, by eye and by its published colour variables */
export const claudeDark = {
    page: "#262624",
    card: "#30302E",
    raised: "#3A3936",
    bar: "#1F1E1D",
    deepest: "#141413",
    text: "#FAF9F5",
    textSoft: "#C2C0B6",
    textFaint: "#9C9A92",
    border: "rgba(222, 220, 209, 0.15)",
    clay: "#D97757",
    clayDeep: "#C6613F"
};

const claudeDarkTokens: ClaudeTokens = {
    ring: claudeDark.clay,
    ringHover: "#E08A6D",
    bar: claudeDark.bar,
    barText: claudeDark.text,
    barIndicator: claudeDark.clay,
    fill: claudeDark.page,
    surface: claudeDark.card,
    ink: claudeDark.text,
    inkSoft: claudeDark.textSoft,
    muted: claudeDark.textFaint,
    link: "#5A4B42",
    line: "#5E5A52",
    cardEdge: "#4A4843",
    keyCardBg: "#3A2E28",
    heat: ["#3A3936", "#4E3B31", "#8E5239", "#D97757"],
    artifact: "#9F7AEA",
    artifactText: "#C4B5FD",
    artifactSoft: "#2F2742",
    artifactEdge: "#6D54B0",
    neutralPill: claudeDark.raised,
    neutralPillText: claudeDark.textSoft,
    askBg: "#3A2F1C",
    askEdge: "#F59E0B",
    askLabel: "#FBBF24",
    askText: claudeDark.text,
    track: "#45403B",
    todoBg: "#3A3633",
    halo: claudeDark.page,
    badges: {
        ...lightBadges,
        done: {color: "#5F5E5A", text: "#E8E6DC"},
        stale: {color: claudeDark.raised, text: claudeDark.textSoft},
        gone: {color: claudeDark.raised, text: claudeDark.textSoft},
        someday: {color: "#4A3B1E", text: "#F6CF86"},
        later: {color: "#2E3150", text: "#C7CCF5"}
    },
    ci: {success: "#22C55E", failure: "#EF4444", pending: "#F59E0B", none: "#9C9A92"}
};

/* The Sky (loading screen and Take a break): day in light, a calm dusk in dark. index.html repeats these for the
   loading screen, which shows before any script runs; keep the two in step. */
export const sky = {
    light: {
        gradient: "linear-gradient(#cfe3f2,#eef5fa 70%,#f7f3ea)", cloud: "#ffffff", cloudOpacity: 0.9, stars: 0,
        ground: "#cfdcb8", words: "#23313d", sub: "#3b4733", string: "#5a4636", weight: "#23313d",
        button: "#23313d", buttonText: "#ffffff", buttonHover: "#3a4c5c"
    },
    dark: {
        gradient: `linear-gradient(#141821,#1f222a 70%,${claudeDark.page})`, cloud: "#3b404b", cloudOpacity: 0.75, stars: 0.7,
        ground: "#2c3427", words: claudeDark.text, sub: claudeDark.textSoft, string: "#b8a592", weight: claudeDark.textSoft,
        button: claudeDark.text, buttonText: claudeDark.bar, buttonHover: "#e8e6dc"
    }
};

declare module "@mui/material/styles" {
    interface Palette { claude: ClaudeTokens }
    interface PaletteOptions { claude?: ClaudeTokens }
}

export function makeTheme(mode: PaletteMode): Theme {
    if (mode === "light") {
        return createTheme({palette: {mode, claude: claudeLight}});
    }
    return createTheme({
        palette: {
            mode,
            claude: claudeDarkTokens,
            primary: {main: claudeDark.clay, dark: claudeDark.clayDeep, light: "#E59A7F", contrastText: "#FFFFFF"},
            secondary: {main: "#A8A29E"},
            background: {default: claudeDark.page, paper: claudeDark.card},
            text: {primary: claudeDark.text, secondary: claudeDark.textSoft, disabled: claudeDark.textFaint},
            divider: claudeDark.border,
            action: {hover: "rgba(222, 220, 209, 0.08)", selected: "rgba(222, 220, 209, 0.14)"}
        },
        components: {
            // claude.ai's surfaces are flat colours, not MUI's lighter-with-elevation overlay
            MuiPaper: {styleOverrides: {root: {backgroundImage: "none"}}},
            MuiAppBar: {styleOverrides: {colorPrimary: {backgroundColor: claudeDark.bar, color: claudeDark.text}}},
            MuiDialog: {styleOverrides: {paper: {border: `1px solid ${claudeDark.border}`}}},
            MuiMenu: {styleOverrides: {paper: {border: `1px solid ${claudeDark.border}`}}},
            // white on the clay accent reads better on its deeper shade, as Claude's own send button does
            MuiButton: {styleOverrides: {containedPrimary: {backgroundColor: claudeDark.clayDeep, "&:hover": {backgroundColor: "#B5552F"}}}},
            MuiFab: {styleOverrides: {primary: {backgroundColor: claudeDark.clayDeep, "&:hover": {backgroundColor: "#B5552F"}}}}
        }
    });
}

export function readColorChoice(): ColorChoice {
    try {
        const v = localStorage.getItem(colorChoiceKey);
        return v === "light" || v === "dark" ? v : "system";
    } catch {
        return "system";
    }
}

export const ColorModeContext = React.createContext<{choice: ColorChoice, mode: PaletteMode, setChoice: (c: ColorChoice) => void}>({
    choice: "system", mode: "light", setChoice: () => {}
});

/* Follows the device unless Jon picks Light or Dark; the pick is kept per device */
export function useColorModeState() {
    const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", {noSsr: true});
    const [choice, setChoiceState] = React.useState<ColorChoice>(readColorChoice);
    const mode: PaletteMode = choice === "system" ? (prefersDark ? "dark" : "light") : choice;
    const setChoice = React.useCallback((c: ColorChoice) => {
        try {
            if (c === "system") localStorage.removeItem(colorChoiceKey); else localStorage.setItem(colorChoiceKey, c);
        } catch { /* private window: the pick lasts this visit */ }
        setChoiceState(c);
    }, []);
    const theme = React.useMemo(() => makeTheme(mode), [mode]);
    // the loading screen, Bootstrap's leftovers and the browser's own bars follow along
    React.useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = mode;
        root.setAttribute("data-bs-theme", mode);
        root.style.colorScheme = mode;
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", mode === "dark" ? claudeDark.bar : "#dcebf5"));
    }, [mode]);
    return {choice, mode, setChoice, theme};
}

/* The Claude map's colours for the current mode, for the canvas and SVGs that can't take a palette path */
export const useClaudeColors = () => useTheme().palette.claude;

export const useColorMode = () => React.useContext(ColorModeContext);
