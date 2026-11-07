import React from "react";
import { Box, Button, Chip, IconButton, List, ListItem, ListItemButton, ListItemText, Tooltip, Typography } from "@mui/material";
import { OpenInNew } from "@mui/icons-material";
import { ThumbDown, ThumbDownOffAlt, ThumbUp, ThumbUpOffAlt } from "@mui/icons-material";
import { ClaudeProject, ClaudeThread, ClaudeTodo, InterestAnswer, askLabels, badgeFor, claudeBadges, standingAsk } from "./ClaudeMapTypes";
import { LeverageInput, reasonLine, scoreAll } from "./leverage";

/* What a project needs from Jon, for its card on the Claude map and on Your move: the questions, decisions and reviews
   its threads are waiting on, and the to-dos they left him, in Leverage order (src/leverage.ts). What he can do now
   comes first; a to-do still waiting on another goes last. */

export type ForYouItem = {
    key: string,
    /* the chip: an ask's kind, "Needs you" for a waiting thread that didn't say why, or "To-do" */
    label: string,
    color: string,
    textColor: string,
    text: string,
    thread: ClaudeThread,
    /* where a to-do is done, when its thread gave a link */
    link?: string,
    todo?: ClaudeTodo,
    /* "a few minutes · opens 2 · a Claude thread waits": the page shows this, never the number */
    reason: string,
    leverage: number,
    ready: boolean
};

const askChip = {
    question: claudeBadges.blocked, decision: claudeBadges.blocked, approval: claudeBadges.working, review: claudeBadges.review_ready
};

export function forYou(project: ClaudeProject, now = Date.now()): ForYouItem[] {
    const waiting = project.threads
        .filter(t => t.state === "blocked" || t.state === "review_ready")
        .map(t => ({t, badge: badgeFor(t, project, now)}))
        .filter(({badge}) => badge !== "gone");
    const todos = project.threads.flatMap(t => (t.todos ?? []).map(todo => ({todo, t})));
    // an ask: a Claude thread waits on it. A review takes longer than an answer; a "Someday?" ask has no cost to waiting.
    const askInput = ({t, badge}: typeof waiting[number]): LeverageInput => ({
        id: `ask:${t.id}`, worth: 2, claudeWaits: true,
        size: standingAsk(t)?.kind === "review" || (!standingAsk(t) && t.state === "review_ready") ? "half_hour" : "minutes",
        delayClass: badge === "someday" ? "intangible" : "standard"
    });
    const asks = waiting.map(askInput);
    const scores = scoreAll([...asks, ...todos.map(({todo}) => ({...todo, id: todo.id}))], now);
    const items = [
        ...waiting.map((w, i): ForYouItem => {
            const {t} = w;
            const ask = standingAsk(t);
            const style = ask ? askChip[ask.kind] : t.state === "review_ready" ? claudeBadges.review_ready : claudeBadges.blocked;
            const scored = scores.get(asks[i].id)!;
            return {
                key: `ask:${t.id}`,
                label: ask ? askLabels[ask.kind] : claudeBadges[t.state].label,
                color: style.color,
                textColor: style.text,
                text: ask?.text ?? t.title,
                thread: t,
                reason: reasonLine({size: asks[i].size, claudeWaits: true}, scored),
                leverage: scored.leverage,
                ready: scored.ready
            };
        }),
        ...todos.map(({todo, t}): ForYouItem => {
            const scored = scores.get(todo.id)!;
            return {
                key: `todo:${todo.id}`, label: "To-do", color: "#F3ECE2", textColor: "#3D2B1F", text: todo.text, thread: t, link: todo.link,
                todo, reason: reasonLine(todo, scored), leverage: scored.leverage, ready: scored.ready
            };
        })
    ];
    return items.sort((a, b) => Number(b.ready) - Number(a.ready) || b.leverage - a.leverage);
}

/* Claude's guess at whether Jon wants to do it, dashed until he answers with a thumb */
export function InterestThumbs({todo, onAnswer}: {todo: ClaudeTodo, onAnswer: (answer: InterestAnswer | undefined) => void}) {
    const interest = todo.interest;
    if (!interest) {
        return null;
    }
    const answered = interest.answer;
    const guessWords = {drawn: "You'll likely enjoy this", neutral: "Neither here nor there", reluctant: "Might be a slog"}[interest.guess];
    const thumb = (answer: InterestAnswer) => <IconButton
        size="small"
        aria-label={answer === "up" ? "I'd like to do this" : "I'd rather not"}
        aria-pressed={answered === answer}
        onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onAnswer(answered === answer ? undefined : answer);
        }}
        sx={{p: 0.25, color: answered === answer ? "#3D2B1F" : "#9C8B7A"}}
    >
        {answer === "up"
            ? answered === "up" ? <ThumbUp sx={{fontSize: 16}}/> : <ThumbUpOffAlt sx={{fontSize: 16}}/>
            : answered === "down" ? <ThumbDown sx={{fontSize: 16}}/> : <ThumbDownOffAlt sx={{fontSize: 16}}/>}
    </IconButton>;
    return <Box component="span" sx={{display: "inline-flex", alignItems: "center", gap: 0.25, mt: 0.25}}>
        <Tooltip title={answered ? "You said" : "Claude's guess. Tap a thumb to say."}>
            <Typography component="span" variant="caption" sx={{
                px: 0.75, borderRadius: 1, color: "#5B4636",
                border: answered ? "1px solid #C9B8A6" : "1px dashed #C9B8A6"
            }}>
                {answered ? (answered === "up" ? "You want to" : "You'd rather not") : guessWords}
                {!answered && interest.reason ? ` (${interest.reason})` : ""}
            </Typography>
        </Tooltip>
        {thumb("up")}
        {thumb("down")}
    </Box>;
}

export function ProjectForYou({project, threadLinkProps, onOpenThread, onInterest, firstShown = 4, heading = true}: {
    /* Jon's thumb on an interest guess */
    onInterest?: (todo: ClaudeTodo, answer: InterestAnswer | undefined) => void,
    project: ClaudeProject,
    /* how many rows show before "Show N more" */
    firstShown?: number,
    /* the "For you" heading and the empty line; Your move leaves both out, since its project header says it */
    heading?: boolean,
    /* props that make a row a link to its thread, in the way Jon chose to open Claude */
    threadLinkProps: (thread: ClaudeThread) => object,
    onOpenThread: (thread: ClaudeThread) => void
}) {
    const items = forYou(project);
    const [all, setAll] = React.useState(false);
    if (items.length === 0) {
        return !heading ? null : <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>Nothing here needs you.</Typography>;
    }
    const shown = all ? items : items.slice(0, firstShown);
    return <Box data-testid="project-for-you" sx={{mt: heading ? 1 : 0}}>
        {heading && <Typography variant="overline" sx={{lineHeight: 1.6}}>For you</Typography>}
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
                        secondary={<>
                            <Box component="span" sx={{display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                {[item.reason, item.label === "To-do" || item.text !== item.thread.title ? item.thread.title : undefined].filter(Boolean).join(" · ")}
                            </Box>
                            {item.todo && onInterest && <InterestThumbs todo={item.todo} onAnswer={answer => onInterest(item.todo!, answer)}/>}
                        </>}
                        primaryTypographyProps={{sx: {overflowWrap: "anywhere", opacity: item.ready ? 1 : 0.6}}}
                        secondaryTypographyProps={{component: "div"}}
                    />
                </ListItemButton>
            </ListItem>)}
        </List>
        {items.length > firstShown && <Button size="small" onClick={() => setAll(!all)} sx={{color: "#3D2B1F"}}>
            {all ? "Show fewer" : `Show ${items.length - firstShown} more`}
        </Button>}
    </Box>;
}

/* A project goes quiet when nothing in it waits on Jon, nothing is stuck, and no thread has moved for two weeks.
   Your move folds quiet projects away on its own, so Jon never has to hide one to tidy the list. */
export const quietDays = 14;

export function lastMoved(project: ClaudeProject): string {
    return project.threads.map(t => t.lastActivityAt ?? t.lastSeenAt).filter(Boolean).sort().at(-1) ?? project.lastSyncedAt;
}

export function isQuiet(project: ClaudeProject, now = Date.now()): boolean {
    return forYou(project, now).length === 0
        && !project.threads.some(t => badgeFor(t, project, now) === "failed")
        && now - Date.parse(lastMoved(project)) > quietDays * 864e5;
}
