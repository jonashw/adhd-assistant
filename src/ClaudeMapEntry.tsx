import React from "react";
import { useNavigate } from "react-router-dom";
import { Chip, ListItemButton, ListItemText, Paper, Stack, Typography } from "@mui/material";
import { ClaudeProject, artifactFlag, badgeFor } from "./ClaudeMapTypes";
import { ServerApi } from "./ServerApi";
import { BadgeChip, claudeStyle } from "./ClaudeMap";

/* The Claude map's row on the map list, with what needs Jon at a glance */
export function ClaudeMapEntry() {
    const navigate = useNavigate();
    const [projects, setProjects] = React.useState<ClaudeProject[]>();
    React.useEffect(() => {
        ServerApi.claudeMap().then(setProjects).catch(() => setProjects([]));
    }, []);
    const shown = (projects ?? []).filter(p => !p.hidden);
    const badges = shown.flatMap(p => p.threads.map(t => badgeFor(t, p)));
    const count = (kind: string) => badges.filter(b => b === kind).length;
    const needsYou = count("blocked"), ready = count("review_ready"), working = count("working");
    const fresh = shown.flatMap(p => (p.artifacts ?? []).filter(a => artifactFlag(a, p) === "new")).length;
    return <Paper elevation={0} sx={{m: 1, border: `1px solid ${claudeStyle.ring}`, bgcolor: claudeStyle.fill}}>
        <ListItemButton onClick={() => navigate("/claude")}>
            <ListItemText
                primary={<Typography sx={{fontFamily: claudeStyle.font, fontWeight: 600, color: claudeStyle.ink}}>Claude map</Typography>}
                secondary={projects === undefined ? "Loading…"
                    : shown.length === 0 ? "Kept by Claude. Opted-in projects show up here."
                    : `${shown.length} project${shown.length === 1 ? "" : "s"}, kept by Claude`}
            />
            <Stack direction="row" gap={0.5} flexWrap="wrap" justifyContent="flex-end">
                {needsYou > 0 && <BadgeChip kind="blocked" text={`${needsYou} need${needsYou === 1 ? "s" : ""} you`}/>}
                {ready > 0 && <BadgeChip kind="review_ready" text={`${ready} ready`}/>}
                {working > 0 && <BadgeChip kind="working" text={`${working} working`}/>}
                {fresh > 0 && <Chip size="small" label={`${fresh} new artifact${fresh === 1 ? "" : "s"}`} sx={{bgcolor: "#7C3AED", color: "#fff", fontWeight: 600}}/>}
            </Stack>
        </ListItemButton>
    </Paper>;
}
