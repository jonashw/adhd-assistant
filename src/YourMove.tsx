import React from "react";
import { Box, Button, Chip, IconButton, List, ListItemButton, ListItemText, ListSubheader, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { Close, OpenInNew, PushPin, PushPinOutlined } from "@mui/icons-material";
import { ClaudeProject, ClaudeThread, ClaudeTodo, InterestAnswer, standingAsk } from "./ClaudeMapTypes";
import { ForYouItem, InterestThumbs, forYou } from "./ClaudeProjectFocus";

/* The top of Your move: everything every project needs from Jon, in one Leverage order.

   Start here is one key and two alternates (Ramsay and Rostain: a long menu stalls an ADHD brain; a short one with a
   way out doesn't). Ready is the rest he can do now. Opens up later is what waits on another to-do, faded.
   One click opens an item's card: why it matters, what he needs, when it's done, what it opens. A double click goes
   straight to its thread. Two cards can be pinned side by side, half and half. */

export type MoveItem = ForYouItem & {project: ClaudeProject};

const alternates = 2;
const readyShown = 8;

export function moveItems(projects: ClaudeProject[], now = Date.now()): MoveItem[] {
    return projects
        .flatMap(project => forYou(project, now).map(item => ({...item, project})))
        .sort((a, b) => Number(b.ready) - Number(a.ready) || b.leverage - a.leverage);
}

/* what a to-do opens, and what it waits on, by text */
function links(item: MoveItem, all: MoveItem[]) {
    const id = item.todo?.id;
    const todos = all.filter(i => i.todo).map(i => i.todo!) as ClaudeTodo[];
    return {
        opens: id ? todos.filter(t => t.waitsOn?.includes(id)).map(t => t.text) : [],
        waitsOn: (item.todo?.waitsOn ?? []).map(w => todos.find(t => t.id === w)?.text).filter((t): t is string => !!t)
    };
}

/* a URL in a needs line becomes a link */
function withLinks(line: string) {
    const parts = line.split(/(https?:\/\/\S+)/g);
    return parts.map((part, i) => /^https?:\/\//.test(part)
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
        : <React.Fragment key={i}>{part}</React.Fragment>);
}

function Section({title, children}: {title: string, children: React.ReactNode}) {
    return <Box sx={{mt: 1}}>
        <Typography variant="overline" sx={{lineHeight: 1.6, color: "#5B4636"}}>{title}</Typography>
        {children}
    </Box>;
}

function ItemCard({item, all, pinned, half, onPin, onClose, threadLinkProps, onOpenThread, onInterest, projectName}: {
    item: MoveItem,
    /* sharing the screen with a pinned card: on a phone they stack, so each gets less height */
    half: boolean,
    all: MoveItem[],
    pinned: boolean,
    onPin: () => void,
    onClose: () => void,
    threadLinkProps: (t: ClaudeThread) => object,
    onOpenThread: (t: ClaudeThread) => void,
    onInterest: (todo: ClaudeTodo, answer: InterestAnswer | undefined) => void,
    projectName: (p: ClaudeProject) => string
}) {
    const {opens, waitsOn} = links(item, all);
    const todo = item.todo;
    const ask = standingAsk(item.thread);
    return <Paper elevation={6} data-testid="move-card" sx={{p: 2, borderTop: "4px solid #D97757", minWidth: 0, overflowY: "auto", maxHeight: {xs: half ? "30dvh" : "42dvh", sm: "46dvh"}}}>
        <Stack direction="row" alignItems="flex-start" gap={1}>
            <Chip size="small" label={item.label} sx={{bgcolor: item.color, color: item.textColor, fontWeight: 600, mt: 0.25}}/>
            <Typography sx={{flexGrow: 1, fontWeight: 600, overflowWrap: "anywhere"}}>{item.text}</Typography>
            <Tooltip title={pinned ? "Unpin" : "Pin, to keep it open beside another"}>
                <IconButton size="small" aria-label={pinned ? "Unpin this card" : "Pin this card"} onClick={onPin}>
                    {pinned ? <PushPin fontSize="small"/> : <PushPinOutlined fontSize="small"/>}
                </IconButton>
            </Tooltip>
            <IconButton size="small" aria-label="Close this card" onClick={onClose}><Close fontSize="small"/></IconButton>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block">{projectName(item.project)} · {item.thread.title}</Typography>
        {item.reason && <Typography variant="body2" sx={{mt: 0.5}}>{item.reason}</Typography>}
        {(todo?.why || (!todo && item.thread.card?.headline)) && <Section title="Why it matters">
            <Typography variant="body2">{todo?.why ?? item.thread.card?.headline}</Typography>
        </Section>}
        {!todo && ask && <Section title="Claude is waiting on">
            <Typography variant="body2">Your {ask.kind === "approval" ? "go-ahead" : ask.kind}, in the thread.</Typography>
        </Section>}
        {todo?.needs?.length ? <Section title="You'll need">
            <Box component="ul" sx={{m: 0, pl: 2.5}}>{todo.needs.map((n, i) => <Typography component="li" variant="body2" key={i}>{withLinks(n)}</Typography>)}</Box>
        </Section> : null}
        {todo?.doneWhen?.length ? <Section title="Done when">
            <Box component="ul" sx={{m: 0, pl: 2.5}}>{todo.doneWhen.map((n, i) => <Typography component="li" variant="body2" key={i}>{n}</Typography>)}</Box>
        </Section> : null}
        {opens.length > 0 && <Section title="Opens up">
            <Box component="ul" sx={{m: 0, pl: 2.5}}>{opens.map((n, i) => <Typography component="li" variant="body2" key={i}>{n}</Typography>)}</Box>
        </Section>}
        {waitsOn.length > 0 && <Section title="Waits on">
            <Box component="ul" sx={{m: 0, pl: 2.5}}>{waitsOn.map((n, i) => <Typography component="li" variant="body2" key={i}>{n}</Typography>)}</Box>
        </Section>}
        {todo && <Box sx={{mt: 1}}><InterestThumbs todo={todo} onAnswer={answer => onInterest(todo, answer)}/></Box>}
        <Stack direction="row" gap={1} sx={{mt: 1.5}} flexWrap="wrap">
            {item.link && <Button size="small" variant="outlined" endIcon={<OpenInNew/>} href={item.link} target="_blank" rel="noopener noreferrer"
                sx={{color: "#3D2B1F", borderColor: "#C9B8A6"}}>
                Where you do it
            </Button>}
            <Button
                size="small"
                variant="contained"
                endIcon={<OpenInNew/>}
                sx={{bgcolor: "#D97757", "&:hover": {bgcolor: "#C4623F"}}}
                {...threadLinkProps(item.thread)}
                onClick={() => onOpenThread(item.thread)}
            >
                {todo ? "Open the thread" : "Answer in Claude"}
            </Button>
        </Stack>
    </Paper>;
}

export function YourMoveSections({projects, threadLinkProps, openThread, onOpenThread, onInterest, projectName}: {
    projects: ClaudeProject[],
    threadLinkProps: (t: ClaudeThread) => object,
    /* goes to the thread (a double click), the way Jon chose to open Claude */
    openThread: (t: ClaudeThread) => void,
    onOpenThread: (t: ClaudeThread) => void,
    onInterest: (todo: ClaudeTodo, answer: InterestAnswer | undefined) => void,
    projectName: (p: ClaudeProject) => string
}) {
    const all = moveItems(projects);
    const ready = all.filter(i => i.ready);
    const later = all.filter(i => !i.ready);
    const [selected, setSelected] = React.useState<string>();
    const [pinned, setPinned] = React.useState<string[]>([]);
    const [allReady, setAllReady] = React.useState(false);
    const byKey = new Map(all.map(i => [i.key, i]));
    // pinned cards stay; the one just tapped joins them; two at most, half and half
    const cards = [...new Set([...pinned, ...(selected ? [selected] : [])])].filter(k => byKey.has(k)).slice(-2);
    const pin = (key: string) => setPinned(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key].slice(-2));
    const close = (key: string) => {
        setPinned(p => p.filter(k => k !== key));
        if (selected === key) setSelected(undefined);
    };

    if (all.length === 0) {
        return <Box sx={{px: 2, py: 3}}>
            <Typography sx={{fontWeight: 600}}>Nothing waits on you right now.</Typography>
            <Typography variant="body2" color="text.secondary">When a thread asks you something or leaves you a to-do, it shows up here.</Typography>
        </Box>;
    }

    const row = (item: MoveItem, kind: "key" | "alt" | "ready" | "later") => <ListItemButton
        key={item.key}
        selected={cards.includes(item.key)}
        onClick={() => setSelected(item.key)}
        onDoubleClick={() => {
            onOpenThread(item.thread);
            openThread(item.thread);
        }}
        sx={{
            gap: 1.5, alignItems: "flex-start", mx: 1, my: kind === "key" ? 0.5 : 0, borderRadius: 1.5,
            border: kind === "key" ? "3px solid #D97757" : kind === "alt" ? "1px solid #E7D9CB" : "1px solid transparent",
            opacity: kind === "later" ? 0.6 : 1, bgcolor: kind === "key" ? "#FFF8F3" : undefined
        }}
    >
        <Chip size="small" label={item.label} sx={{bgcolor: item.color, color: item.textColor, fontWeight: 600, mt: 0.25, flexShrink: 0}}/>
        <ListItemText
            primary={item.text}
            secondary={[item.reason, projectName(item.project)].filter(Boolean).join(" · ")}
            primaryTypographyProps={{sx: {overflowWrap: "anywhere", fontWeight: kind === "key" ? 600 : undefined}}}
            secondaryTypographyProps={{noWrap: true}}
            sx={{minWidth: 0, my: 0.25}}
        />
    </ListItemButton>;

    const start = ready.slice(0, 1 + alternates);
    const rest = ready.slice(1 + alternates);
    return <Box data-testid="your-move-sections">
        <List dense disablePadding>
            {start.length > 0 && <ListSubheader sx={{bgcolor: "#fff", lineHeight: "32px", fontWeight: 600, color: "#3D2B1F"}}>Start here</ListSubheader>}
            {start.map((item, i) => row(item, i === 0 ? "key" : "alt"))}
            {rest.length > 0 && <ListSubheader sx={{bgcolor: "#fff", lineHeight: "32px", fontWeight: 600, color: "#3D2B1F", mt: 1}}>Ready</ListSubheader>}
            {(allReady ? rest : rest.slice(0, readyShown)).map(item => row(item, "ready"))}
            {rest.length > readyShown && <Button size="small" sx={{ml: 2, color: "#3D2B1F"}} onClick={() => setAllReady(!allReady)}>
                {allReady ? "Show fewer" : `Show ${rest.length - readyShown} more`}
            </Button>}
            {later.length > 0 && <ListSubheader sx={{bgcolor: "#fff", lineHeight: "32px", fontWeight: 600, color: "#3D2B1F", mt: 1}}>Opens up later</ListSubheader>}
            {later.map(item => row(item, "later"))}
        </List>
        {cards.length > 0 && <Box sx={{
            position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 10, maxWidth: cards.length > 1 ? 1100 : 560, mx: "auto",
            display: "grid", gap: 1.5, gridTemplateColumns: {xs: "1fr", sm: cards.length > 1 ? "1fr 1fr" : "1fr"}
        }}>
            {cards.map(key => <ItemCard
                key={key}
                item={byKey.get(key)!}
                all={all}
                pinned={pinned.includes(key)}
                half={cards.length > 1}
                onPin={() => pin(key)}
                onClose={() => close(key)}
                threadLinkProps={threadLinkProps}
                onOpenThread={onOpenThread}
                onInterest={onInterest}
                projectName={projectName}
            />)}
        </Box>}
    </Box>;
}
