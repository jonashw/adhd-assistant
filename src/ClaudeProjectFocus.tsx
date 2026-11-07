import React from "react";
import { Box, Button, Chip, IconButton, List, ListItem, ListItemButton, ListItemText, Tooltip, Typography } from "@mui/material";
import { OpenInNew } from "@mui/icons-material";
import { ClaudeProject, ClaudeThread, askLabels, badgeFor, badgeOrder, claudeBadges, standingAsk } from "./ClaudeMapTypes";

/* What a project needs from Jon, for its card on the Claude map: the questions, decisions and reviews its threads are
   waiting on, then the to-dos they left him. For now asks come first, most urgent badge first, then to-dos newest first;
   the Leverage order replaces this once to-dos carry worth, size and what they wait on. */

export type ForYouItem = {
    key: string,
    /* the chip: an ask's kind, "Needs you" for a waiting thread that didn't say why, or "To-do" */
    label: string,
    color: string,
    textColor: string,
    text: string,
    thread: ClaudeThread,
    /* where a to-do is done, when its thread gave a link */
    link?: string
};

const askChip = {
    question: claudeBadges.blocked, decision: claudeBadges.blocked, approval: claudeBadges.working, review: claudeBadges.review_ready
};

export function forYou(project: ClaudeProject, now = Date.now()): ForYouItem[] {
    const waiting = project.threads
        .filter(t => t.state === "blocked" || t.state === "review_ready")
        .map(t => ({t, badge: badgeFor(t, project, now)}))
        .filter(({badge}) => badge !== "gone")
        .sort((a, b) => badgeOrder.indexOf(a.badge) - badgeOrder.indexOf(b.badge)
            || (b.t.lastActivityAt ?? "").localeCompare(a.t.lastActivityAt ?? ""))
        .map(({t}): ForYouItem => {
            const ask = standingAsk(t);
            const style = ask ? askChip[ask.kind] : t.state === "review_ready" ? claudeBadges.review_ready : claudeBadges.blocked;
            return {
                key: `ask:${t.id}`,
                label: ask ? askLabels[ask.kind] : claudeBadges[t.state].label,
                color: style.color,
                textColor: style.text,
                text: ask?.text ?? t.title,
                thread: t
            };
        });
    const todos = project.threads
        .flatMap(t => (t.todos ?? []).map(todo => ({todo, t})))
        .sort((a, b) => b.todo.addedAt.localeCompare(a.todo.addedAt))
        .map(({todo, t}): ForYouItem => ({
            key: `todo:${todo.id}`, label: "To-do", color: "#F3ECE2", textColor: "#3D2B1F", text: todo.text, thread: t, link: todo.link
        }));
    return [...waiting, ...todos];
}

const firstShown = 4;

export function ProjectForYou({project, threadLinkProps, onOpenThread}: {
    project: ClaudeProject,
    /* props that make a row a link to its thread, in the way Jon chose to open Claude */
    threadLinkProps: (thread: ClaudeThread) => object,
    onOpenThread: (thread: ClaudeThread) => void
}) {
    const items = forYou(project);
    const [all, setAll] = React.useState(false);
    if (items.length === 0) {
        return <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>Nothing here needs you.</Typography>;
    }
    const shown = all ? items : items.slice(0, firstShown);
    return <Box data-testid="project-for-you" sx={{mt: 1}}>
        <Typography variant="overline" sx={{lineHeight: 1.6}}>For you</Typography>
        <List dense disablePadding>
            {shown.map(item => <ListItem
                key={item.key}
                disablePadding
                secondaryAction={item.link && <Tooltip title="Open where you do it">
                    <IconButton size="small" edge="end" href={item.link} target="_blank" rel="noopener noreferrer" aria-label={`Open the link for ${item.text}`}>
                        <OpenInNew sx={{fontSize: 16}}/>
                    </IconButton>
                </Tooltip>}
            >
                <ListItemButton {...threadLinkProps(item.thread)} onClick={() => onOpenThread(item.thread)} sx={{gap: 1, alignItems: "flex-start", px: 1, borderRadius: 1}}>
                    <Chip size="small" label={item.label} sx={{bgcolor: item.color, color: item.textColor, fontWeight: 600, mt: 0.25, flexShrink: 0}}/>
                    <ListItemText
                        primary={item.text}
                        secondary={item.label === "To-do" || item.text !== item.thread.title ? item.thread.title : undefined}
                        primaryTypographyProps={{sx: {overflowWrap: "anywhere"}}}
                        secondaryTypographyProps={{noWrap: true}}
                    />
                </ListItemButton>
            </ListItem>)}
        </List>
        {items.length > firstShown && <Button size="small" onClick={() => setAll(!all)} sx={{color: "#3D2B1F"}}>
            {all ? "Show fewer" : `Show ${items.length - firstShown} more`}
        </Button>}
    </Box>;
}
