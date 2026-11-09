import React from "react";
import { Chip, Divider, ListItemText, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { CenterFocusStrong, Work } from "@mui/icons-material";
import { ServerApi } from "./ServerApi";
import { useRing } from "./live";
import { ClaudeProject } from "./ClaudeMapTypes";
import {
    Domain, Focus, FocusScope, WorkShare, currentFocus, defaultDomains, domainOf, focusUntil, modeNames, scopeName, workShares
} from "./focus";

/* The mode and focus chips on Your move ("I'm in Work mode · Focus on ADHD Support"), and the hook that keeps them.
   The rules live in src/focus.ts. Both chips show what holds now; a tap opens the choices, the × goes back to
   mixed mode or to everything. Both wear off at 4 in the morning. */

export function useFocus(demo: boolean) {
    const [domains, setDomains] = React.useState<Domain[]>(defaultDomains);
    const [saved, setSaved] = React.useState<Focus>();
    const [, setTick] = React.useState(0);
    const load = React.useCallback(() => {
        if (demo) return;
        ServerApi.focus().then(f => {
            if (f.domains.length) setDomains(f.domains);
            setSaved(f.now);
        }).catch(() => undefined);
    }, [demo]);
    React.useEffect(load, [load]);
    useRing("claude", undefined, load, !demo);
    // it wears off by the clock
    React.useEffect(() => {
        const timer = window.setInterval(() => setTick(t => t + 1), 60000);
        return () => window.clearInterval(timer);
    }, []);
    const now = currentFocus(saved);
    const workShare: WorkShare = now?.workShare ?? 0.5;
    const scope = now?.scope;

    const set = (next: {workShare: WorkShare, scope?: FocusScope}) => {
        const plain = next.workShare === 0.5 && !next.scope;
        const focus: Focus | undefined = plain ? undefined
            : {...next, setAt: new Date().toISOString(), until: focusUntil().toISOString()};
        setSaved(focus);
        if (!demo) ServerApi.setFocus(focus ?? null).catch(load);
    };
    return {
        domains, workShare, scope, until: now?.until,
        setMode: (share: WorkShare) => set({workShare: share, scope}),
        setScope: (next?: FocusScope) => set({workShare, scope: next})
    };
}

export type FocusState = ReturnType<typeof useFocus>;

const onChip = {bgcolor: "claude.ring", color: "#fff", "& .MuiChip-icon, & .MuiChip-deleteIcon": {color: "#fff"}};
const offChip = {color: "claude.ink", borderColor: "claude.line"};

export function FocusChips({focus, projects, projectName}: {
    focus: FocusState,
    /* every project, so Jon can focus on one that has nothing for him right now too */
    projects: ClaudeProject[],
    projectName: (p: ClaudeProject) => string
}) {
    const [modeAnchor, setModeAnchor] = React.useState<HTMLElement | null>(null);
    const [scopeAnchor, setScopeAnchor] = React.useState<HTMLElement | null>(null);
    const {domains, workShare, scope} = focus;
    const leaning = workShare !== 0.5;
    const focusName = scopeName(domains, projects, scope, projectName);
    const pickScope = (next?: FocusScope) => {
        setScopeAnchor(null);
        focus.setScope(next);
    };
    return <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{minWidth: 0}}>
        <Typography variant="body2" sx={{color: "claude.inkSoft", whiteSpace: "nowrap"}}>I'm in</Typography>
        <Chip
            icon={<Work fontSize="small"/>}
            label={leaning ? modeNames[workShare] : "mixed mode"}
            variant={leaning ? "filled" : "outlined"}
            onClick={e => setModeAnchor(e.currentTarget)}
            onDelete={leaning ? () => focus.setMode(0.5) : undefined}
            data-testid="mode-picker"
            sx={leaning ? onChip : offChip}
        />
        <Menu anchorEl={modeAnchor} open={!!modeAnchor} onClose={() => setModeAnchor(null)}>
            {[...workShares].reverse().map(share => <MenuItem key={share} selected={share === workShare} onClick={() => {
                setModeAnchor(null);
                focus.setMode(share);
            }}>
                <ListItemText primary={modeNames[share]} secondary={
                    share === 1 ? "work first; personal sinks to the bottom"
                        : share === 0 ? "personal first; work sinks to the bottom"
                        : share === 0.5 ? "the plain order, no lean"
                        : share > 0.5 ? "work lifted, personal still in the mix" : "personal lifted, work still in the mix"
                }/>
            </MenuItem>)}
            <Divider/>
            <MenuItem disabled><ListItemText secondary="Until 4 in the morning"/></MenuItem>
        </Menu>
        <Typography variant="body2" sx={{color: "claude.inkSoft", whiteSpace: "nowrap"}}>focused on</Typography>
        <Chip
            icon={<CenterFocusStrong fontSize="small"/>}
            label={focusName ?? "everything"}
            variant={focusName ? "filled" : "outlined"}
            onClick={e => setScopeAnchor(e.currentTarget)}
            onDelete={scope ? () => focus.setScope(undefined) : undefined}
            data-testid="focus-picker"
            sx={focusName ? onChip : offChip}
        />
        <Menu anchorEl={scopeAnchor} open={!!scopeAnchor} onClose={() => setScopeAnchor(null)}>
            <MenuItem selected={!scope} onClick={() => pickScope(undefined)}>
                <ListItemText primary="Everything" secondary="no filter"/>
            </MenuItem>
            {domains.flatMap(d => {
                const own = projects.filter(p => domainOf(domains, p).id === d.id);
                return [
                    <MenuItem key={d.id} selected={scope?.kind === "domain" && scope.id === d.id}
                        onClick={() => pickScope({kind: "domain", id: d.id})}>
                        <ListItemText primary={d.name} secondary={`${own.length} project${own.length === 1 ? "" : "s"}`}/>
                    </MenuItem>,
                    ...own.map(p => <MenuItem key={p.id} sx={{pl: 4}} selected={scope?.kind === "project" && scope.id === p.id}
                        onClick={() => pickScope({kind: "project", id: p.id})}>
                        <ListItemText primary={projectName(p)}/>
                    </MenuItem>)
                ];
            })}
        </Menu>
    </Stack>;
}
