import React from "react";
import { Box, Button, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { CallMerge, Description } from "@mui/icons-material";
import {
    ClaudeArtifact, ClaudeCiState, ClaudePr, ClaudeProject, ClaudeThread, artifactFlag, artifactsOf, askLabels, isNewSince, standingAsk
} from "./ClaudeMapTypes";
import { Pill, artifactLinkProps, artifactPill } from "./claudeArtifacts";

/* What a thread said about itself, at a glance: what it asks of Jon, its latest reply, how far along
   its checklist is, its PRs and every artifact it made. Answers "should I open it now?" without opening it. */

const ciWords: Record<ClaudeCiState, string> = {
    success: "checks passed",
    failure: "checks failed",
    pending: "checks running",
    none: "no checks"
};

export function PrChip({pr}: {pr: ClaudePr}) {
    const merged = pr.state === "merged";
    return <Chip
        size="small"
        variant="outlined"
        component="a"
        href={pr.url}
        target="_blank"
        rel="noopener noreferrer"
        clickable
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        icon={<CallMerge sx={{fontSize: 16}}/>}
        title={`${pr.title} (${pr.state}${pr.ci ? `, ${ciWords[pr.ci]}` : ""})`}
        label={<Stack direction="row" alignItems="center" gap={0.5}>
            <span>#{pr.number}</span>
            {pr.state !== "open" && <span style={{opacity: 0.7}}>{pr.state}</span>}
            {pr.ci && !merged && pr.state !== "closed" && <Box
                component="span"
                aria-label={ciWords[pr.ci]}
                sx={{width: 8, height: 8, borderRadius: "50%", bgcolor: `claude.ci.${pr.ci}`, display: "inline-block"}}
            />}
        </Stack>}
        sx={{color: merged ? "claude.artifact" : undefined, borderColor: merged ? "claude.artifactEdge" : undefined}}
    />;
}

export function PillChip({pill}: {pill: Pill}) {
    return <Chip
        size="small"
        label={pill.text}
        sx={{bgcolor: `claude.${pill.bg}`, color: pill.fg === "white" ? "#fff" : `claude.${pill.fg}`, fontWeight: 600, height: 20, ...(pill.outline ? {border: 1, borderColor: `claude.${pill.outline}`} : {})}}
    />;
}

export function ArtifactChip({artifact, project, onOpen}: {artifact: ClaudeArtifact, project: ClaudeProject, onOpen?: (a: ClaudeArtifact) => void}) {
    const flag = artifactFlag(artifact, project);
    return <Chip
        size="small"
        variant={flag ? "filled" : "outlined"}
        {...artifactLinkProps(artifact.url)}
        clickable
        onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onOpen?.(artifact);
        }}
        icon={<Description sx={{fontSize: 16, color: flag ? "inherit" : undefined}}/>}
        title={`${artifact.title} (${artifactPill(artifact, flag).text.toLowerCase()})`}
        label={flag === "new" ? `${artifact.title} · New` : flag === "updated" ? `${artifact.title} · Updated` : artifact.title}
        sx={{
            maxWidth: 280,
            ...(flag === "new" ? {bgcolor: "claude.artifact", color: "#fff"} : flag === "updated" ? {bgcolor: "claude.artifactSoft", color: "claude.artifactText", border: 1, borderColor: "claude.artifact"} : {})
        }}
    />;
}

/* How many of a thread's artifacts its card shows before "Show all" */
const artifactsAtFirst = 4;

export function NewDot({thread}: {thread: ClaudeThread}) {
    return isNewSince(thread)
        ? <Chip size="small" label="New" sx={{bgcolor: "claude.ring", color: "#fff", fontWeight: 600, height: 20}}/>
        : null;
}

export function ClaudeThreadGlance({thread, project, onOpenArtifact}: {
    thread: ClaudeThread, project: ClaudeProject, onOpenArtifact?: (a: ClaudeArtifact) => void
}) {
    const card = thread.card;
    const ask = standingAsk(thread);
    const prs = thread.prs ?? [];
    const [allArtifacts, setAllArtifacts] = React.useState(false);
    const own = artifactsOf(thread, project);
    // a card from before the map kept every artifact still names its latest one
    const latestOnly = !own.length && card?.artifact ? card.artifact : undefined;
    const artifacts = allArtifacts ? own : own.slice(0, artifactsAtFirst);
    if (!card && !prs.length && !own.length) {
        return <Typography variant="caption" color="text.secondary" display="block" sx={{mt: 1}}>
            This thread hasn't sent a card yet.
        </Typography>;
    }
    return <Stack gap={1} sx={{mt: 1.25}}>
        {ask && <Box sx={{bgcolor: "claude.askBg", borderLeft: 3, borderLeftColor: "claude.askEdge", px: 1.25, py: 0.75, borderRadius: 1}}>
            <Typography variant="caption" sx={{fontWeight: 700, color: "claude.askLabel", textTransform: "uppercase", letterSpacing: 0.4}}>
                {askLabels[ask.kind]}
            </Typography>
            <Typography variant="body2" sx={{color: "claude.askText"}}>{ask.text}</Typography>
        </Box>}
        {card?.headline && <Stack direction="row" alignItems="flex-start" gap={1}>
            <Typography variant="body2" color="text.secondary" sx={{flexGrow: 1}}>{card.headline}</Typography>
            <NewDot thread={thread}/>
        </Stack>}
        {card?.progress && <Box>
            <Stack direction="row" justifyContent="space-between" gap={1}>
                <Typography variant="caption" color="text.secondary" noWrap sx={{minWidth: 0}}>
                    {card.progress.now && card.progress.done < card.progress.total ? `Now: ${card.progress.now}` : "Checklist"}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{flexShrink: 0}}>
                    {card.progress.done} of {card.progress.total}
                </Typography>
            </Stack>
            <LinearProgress
                variant="determinate"
                value={100 * card.progress.done / card.progress.total}
                sx={{height: 4, borderRadius: 2, bgcolor: "claude.track", "& .MuiLinearProgress-bar": {bgcolor: "claude.ring"}}}
            />
        </Box>}
        {prs.length > 0 && <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
            {prs.map(pr => <PrChip key={`${pr.repo}#${pr.number}`} pr={pr}/>)}
        </Stack>}
        {(own.length > 0 || latestOnly) && <Box>
            {own.length > 1 && <Typography variant="caption" color="text.secondary" display="block" sx={{mb: 0.5}}>
                {own.length} artifacts, newest first
            </Typography>}
            <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                {artifacts.map(a => <ArtifactChip key={a.id} artifact={a} project={project} onOpen={onOpenArtifact}/>)}
                {latestOnly && <Chip
                    size="small"
                    variant="outlined"
                    {...artifactLinkProps(latestOnly.url)}
                    clickable
                    icon={<Description sx={{fontSize: 16}}/>}
                    label={latestOnly.title}
                    sx={{maxWidth: 280}}
                />}
                {own.length > artifactsAtFirst && <Button size="small" onClick={() => setAllArtifacts(v => !v)} sx={{color: "claude.artifactText"}}>
                    {allArtifacts ? "Fewer" : `All ${own.length}`}
                </Button>}
            </Stack>
        </Box>}
        {card?.topic && <Typography variant="caption" color="text.secondary" sx={{fontStyle: "italic"}}>
            {card.topic}
            {card.keywords?.length ? <> · {card.keywords.join(", ")}</> : null}
        </Typography>}
    </Stack>;
}

