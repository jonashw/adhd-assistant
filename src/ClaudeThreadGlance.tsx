import { Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { CallMerge, Description } from "@mui/icons-material";
import { ClaudeCiState, ClaudePr, ClaudeThread, askLabels, isNewSince, standingAsk } from "./ClaudeMapTypes";

/* What a thread said about itself, at a glance: what it asks of Jon, its latest reply, how far along
   its checklist is, its PRs and its latest artifact. Answers "should I open it now?" without opening it. */

const ciColors: Record<ClaudeCiState, string> = {
    success: "#16A34A",
    failure: "#DC2626",
    pending: "#F59E0B",
    none: "#9CA3AF"
};

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
                sx={{width: 8, height: 8, borderRadius: "50%", bgcolor: ciColors[pr.ci], display: "inline-block"}}
            />}
        </Stack>}
        sx={{color: merged ? "#7C3AED" : undefined, borderColor: merged ? "#C4B5FD" : undefined}}
    />;
}

export function NewDot({thread}: {thread: ClaudeThread}) {
    return isNewSince(thread)
        ? <Chip size="small" label="New" sx={{bgcolor: "#D97757", color: "#fff", fontWeight: 600, height: 20}}/>
        : null;
}

export function ClaudeThreadGlance({thread}: {thread: ClaudeThread}) {
    const card = thread.card;
    const ask = standingAsk(thread);
    const prs = thread.prs ?? [];
    if (!card && !prs.length) {
        return <Typography variant="caption" color="text.secondary" display="block" sx={{mt: 1}}>
            This thread hasn't sent a card yet.
        </Typography>;
    }
    return <Stack gap={1} sx={{mt: 1.25}}>
        {ask && <Box sx={{bgcolor: "#FEF3C7", borderLeft: "3px solid #F59E0B", px: 1.25, py: 0.75, borderRadius: 1}}>
            <Typography variant="caption" sx={{fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.4}}>
                {askLabels[ask.kind]}
            </Typography>
            <Typography variant="body2" sx={{color: "#1F1300"}}>{ask.text}</Typography>
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
                sx={{height: 4, borderRadius: 2, bgcolor: "#F1E4DA", "& .MuiLinearProgress-bar": {bgcolor: "#D97757"}}}
            />
        </Box>}
        {(prs.length > 0 || card?.artifact) && <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
            {prs.map(pr => <PrChip key={`${pr.repo}#${pr.number}`} pr={pr}/>)}
            {card?.artifact && <Chip
                size="small"
                variant="outlined"
                component="a"
                href={card.artifact.url}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                icon={<Description sx={{fontSize: 16}}/>}
                label={card.artifact.title}
                sx={{maxWidth: 260}}
            />}
        </Stack>}
        {card?.topic && <Typography variant="caption" color="text.secondary" sx={{fontStyle: "italic"}}>
            {card.topic}
            {card.keywords?.length ? <> · {card.keywords.join(", ")}</> : null}
        </Typography>}
    </Stack>;
}

