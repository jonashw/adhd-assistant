import React from "react";
import { Box, Button, Chip, IconButton, List, ListItemButton, ListItemText, ListSubheader, Menu, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { Close, OpenInNew, PushPin, PushPinOutlined, Snooze } from "@mui/icons-material";
import { ClaudeProject, ClaudeThread, ClaudeTodo, InterestAnswer, dayLabel, isSetAside, standingAsk } from "./ClaudeMapTypes";
import { ForYouItem, InterestThumbs, forYou } from "./ClaudeProjectFocus";
import { useClaudeColors } from "./theme";
import { OpenState, Spot, byName, fits, hoursLine, openState } from "./spots";
import { WhereChip, WhereLocation, WherePicker, WhereSuggestion } from "./WhereYouAre";
import { FocusChips, FocusState } from "./FocusPicker";
import { domainOf, inScope, modeWeight, scopeName } from "./focus";

/* The top of Your move: everything every project needs from Jon, in one Leverage order.

   Start here is one key and two alternates (Ramsay and Rostain: a long menu stalls an ADHD brain; a short one with a
   way out doesn't). Ready is the rest he can do now. Opens up later is what waits on another to-do,
   or on someone outside the list (Netlify support) until the day to check on them, faded.
   One click opens an item's card: why it matters, what he needs, when it's done, what it opens. A double click goes
   straight to its thread. Two cards can be pinned side by side, half and half.

   Where Jon is (src/spots.ts): when he says where he is ("Right now I'm: In bed"), Start here only offers what he can
   do from there, and Ready folds the rest into "Not from here". A spot that is closed now (the library after hours)
   sends its items to Opens up later, with the time it opens.

   What Jon is focused on (src/focus.ts): the mode ("Mostly work mode") lifts one domain's Leverage and sinks the other's;
   the focus (Work, or one project) narrows the page to that slice, and Start here and Ready come from it alone. */

export type MoveItem = ForYouItem & {project: ClaudeProject};

const alternates = 2;
/* Fewer options is the rule: Ready shows as many as Start here does, and the rest wait behind "Show more" */
const readyShown = 3;

/* weight: how much the mode lifts or sinks a project's items (src/focus.ts), 1 for no lean */
export function moveItems(projects: ClaudeProject[], now = Date.now(), weight: (p: ClaudeProject) => number = () => 1): MoveItem[] {
    return projects
        .flatMap(project => forYou(project, now).map(item => ({...item, project, leverage: item.leverage * weight(project)})))
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

/* A day n days from now, as YYYY-MM-DD in Jon's own time zone */
const dayFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* "Put a pin in it" from Your move: the ask leaves Start here until the day Jon picks, then comes back by itself */
function LaterButton({thread, onSetAside}: {thread: ClaudeThread, onSetAside: (t: ClaudeThread, until: string | null) => void}) {
    const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
    const [picking, setPicking] = React.useState(false);
    const choose = (until: string | null) => {
        setAnchor(null);
        setPicking(false);
        onSetAside(thread, until);
    };
    if (isSetAside(thread)) {
        return <Button size="small" variant="outlined" sx={{color: "claude.ink", borderColor: "claude.line"}} onClick={() => choose(null)}>
            Bring it back now
        </Button>;
    }
    return <>
        <Button size="small" variant="outlined" startIcon={<Snooze/>} sx={{color: "claude.ink", borderColor: "claude.line"}}
            onClick={e => setAnchor(e.currentTarget)}>
            Later
        </Button>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => {
            setAnchor(null);
            setPicking(false);
        }}>
            <MenuItem onClick={() => choose(dayFromNow(1))}>Tomorrow</MenuItem>
            <MenuItem onClick={() => choose(dayFromNow(7))}>In a week</MenuItem>
            <MenuItem onClick={() => choose(dayFromNow(30))}>In a month</MenuItem>
            {picking
                ? <Box sx={{px: 2, py: 1}}>
                    <TextField type="date" size="small" label="Until" InputLabelProps={{shrink: true}} inputProps={{min: dayFromNow(1)}}
                        onChange={e => e.target.value && choose(e.target.value)}/>
                </Box>
                : <MenuItem onClick={() => setPicking(true)}>Pick a day…</MenuItem>}
        </Menu>
    </>;
}

function Section({title, children}: {title: string, children: React.ReactNode}) {
    return <Box sx={{mt: 1}}>
        <Typography variant="overline" sx={{lineHeight: 1.6, color: "claude.inkSoft"}}>{title}</Typography>
        {children}
    </Box>;
}

function ItemCard({item, all, pinned, half, onPin, onClose, threadLinkProps, onOpenThread, onInterest, onSetAside, projectName, spots, hours, onWhere}: {
    item: MoveItem,
    spots: Spot[],
    /* the spot it needs, open or not right now */
    hours: OpenState,
    onWhere: (item: MoveItem, where: string) => void,
    /* sharing the screen with a pinned card: on a phone they stack, so each gets less height */
    half: boolean,
    all: MoveItem[],
    pinned: boolean,
    onPin: () => void,
    onClose: () => void,
    threadLinkProps: (t: ClaudeThread) => object,
    onOpenThread: (t: ClaudeThread) => void,
    onInterest: (todo: ClaudeTodo, answer: InterestAnswer | undefined) => void,
    onSetAside: (t: ClaudeThread, until: string | null) => void,
    projectName: (p: ClaudeProject) => string
}) {
    const {opens, waitsOn} = links(item, all);
    const todo = item.todo;
    const ask = standingAsk(item.thread);
    return <Paper elevation={6} data-testid="move-card" sx={{p: 2, borderTop: 4, borderTopColor: "claude.ring", minWidth: 0, overflowY: "auto", maxHeight: {xs: half ? "30dvh" : "42dvh", sm: "46dvh"}}}>
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
        {spots.length > 0 && <Section title="Where">
            <WhereChip spots={spots} where={item.where} whereBy={item.whereBy} onChange={where => onWhere(item, where)}/>
            {hoursLine(hours) && <Typography variant="body2" sx={{mt: 0.5}}>{hoursLine(hours)}</Typography>}
        </Section>}
        {(todo?.why || (!todo && item.thread.card?.headline)) && <Section title="Why it matters">
            <Typography variant="body2">{todo?.why ?? item.thread.card?.headline}</Typography>
        </Section>}
        {!todo && ask && !isSetAside(item.thread) && <Section title="Claude is waiting on">
            <Typography variant="body2">Your {ask.kind === "approval" ? "go-ahead" : ask.kind}, in the thread.</Typography>
        </Section>}
        {!todo && isSetAside(item.thread) && <Section title="Set aside">
            <Typography variant="body2">
                {item.thread.setAsideBy === "thread" ? "You put a pin in it" : "You set it aside"} until {dayLabel(item.thread.setAsideUntil!)}.
                It comes back to Start here that morning.
            </Typography>
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
        {(waitsOn.length > 0 || todo?.waitingFor) && <Section title="Waits on">
            <Box component="ul" sx={{m: 0, pl: 2.5}}>
                {todo?.waitingFor && <Typography component="li" variant="body2">
                    {todo.waitingFor.who}, outside your list{todo.waitingFor.checkBackOn ? ` (check on them ${dayLabel(todo.waitingFor.checkBackOn)})` : ""}
                </Typography>}
                {waitsOn.map((n, i) => <Typography component="li" variant="body2" key={i}>{n}</Typography>)}
            </Box>
        </Section>}
        {todo && <Box sx={{mt: 1}}><InterestThumbs todo={todo} onAnswer={answer => onInterest(todo, answer)}/></Box>}
        <Stack direction="row" gap={1} sx={{mt: 1.5}} flexWrap="wrap">
            {item.link && <Button size="small" variant="outlined" endIcon={<OpenInNew/>} href={item.link} target="_blank" rel="noopener noreferrer"
                sx={{color: "claude.ink", borderColor: "claude.line"}}>
                Where you do it
            </Button>}
            <Button
                size="small"
                variant="contained"
                endIcon={<OpenInNew/>}
                sx={{bgcolor: "claude.ring", "&:hover": {bgcolor: "claude.ringHover"}}}
                {...threadLinkProps(item.thread)}
                onClick={() => onOpenThread(item.thread)}
            >
                {todo ? "Open the thread" : "Answer in Claude"}
            </Button>
            {!todo && <LaterButton thread={item.thread} onSetAside={onSetAside}/>}
        </Stack>
    </Paper>;
}


const heatOf = (h: number) => h > 0.66 ? 3 : h > 0.4 ? 2 : h > 0.18 ? 1 : 0;

/* Why this order: the to-dos that wait on each other, left to right ("done here opens that"), coloured by Leverage.
   The key has the heavy border; what still waits is dashed. Items with no links are left off: the list has them. */
function OrderGraph({all, keyItem, selected, onSelect}: {
    all: MoveItem[], keyItem?: string, selected: string[], onSelect: (key: string) => void
}) {
    const c = useClaudeColors();
    const todos = all.filter(i => i.todo);
    const byTodo = new Map(todos.map(i => [i.todo!.id, i]));
    const waits = (i: MoveItem) => (i.todo?.waitsOn ?? []).filter(id => byTodo.has(id));
    const linked = todos.filter(i => waits(i).length > 0 || todos.some(j => waits(j).includes(i.todo!.id)));
    if (linked.length === 0) {
        return <Typography variant="body2" color="text.secondary" sx={{px: 2, py: 2}}>
            Nothing here waits on anything else yet, so the order is just Leverage: quick, worthwhile things first.
        </Typography>;
    }
    // column = the longest chain of waits behind it
    const column = new Map<string, number>();
    const depth = (i: MoveItem, seen: Set<string>): number => {
        if (column.has(i.key)) return column.get(i.key)!;
        const d = Math.max(0, ...waits(i).filter(id => !seen.has(id)).map(id => 1 + depth(byTodo.get(id)!, new Set([...seen, id]))));
        column.set(i.key, d);
        return d;
    };
    linked.forEach(i => depth(i, new Set([i.todo!.id])));
    const columns: MoveItem[][] = [];
    linked.forEach(i => (columns[column.get(i.key)!] ??= []).push(i));
    columns.forEach(c => c.sort((a, b) => b.leverage - a.leverage));
    const w = 190, h = 54, gapX = 56, gapY = 14, pad = 8;
    const pos = new Map<string, {x: number, y: number}>();
    columns.forEach((c, ci) => c.forEach((i, ri) => pos.set(i.key, {x: pad + ci * (w + gapX), y: pad + ri * (h + gapY)})));
    const width = pad * 2 + columns.length * w + (columns.length - 1) * gapX;
    const height = pad * 2 + Math.max(...columns.map(c => c.length)) * (h + gapY) - gapY;
    const max = Math.max(...all.map(i => i.leverage), 0.001);
    const {heat, line: edge, ink} = c;
    const short = (t: string, n: number) => t.length > n ? `${t.slice(0, n - 1)}…` : t;
    return <Box sx={{px: 1, pb: 1}}>
        <Box sx={{overflowX: "auto"}}>
            <svg data-testid="order-graph" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Which to-dos open which">
                {linked.flatMap(i => waits(i).map(id => {
                    const from = pos.get(byTodo.get(id)!.key)!, to = pos.get(i.key)!;
                    const x1 = from.x + w, y1 = from.y + h / 2, x2 = to.x, y2 = to.y + h / 2;
                    return <path key={`${id}-${i.key}`} d={`M${x1} ${y1} C${x1 + gapX / 2} ${y1} ${x2 - gapX / 2} ${y2} ${x2} ${y2}`}
                        fill="none" stroke={edge} strokeWidth={1.5} markerEnd="url(#order-arrow)"/>;
                }))}
                <defs>
                    <marker id="order-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0 0 L8 4 L0 8 z" fill={edge}/>
                    </marker>
                </defs>
                {linked.map(i => {
                    const {x, y} = pos.get(i.key)!;
                    const level = heatOf(i.leverage / max);
                    const isKey = i.key === keyItem;
                    const words = short(i.text, 52);
                    const cut = words.length > 26 ? words.lastIndexOf(" ", 26) : -1;
                    const lines = cut > 0 ? [words.slice(0, cut), words.slice(cut + 1)] : [words];
                    return <g key={i.key} role="button" tabIndex={0} style={{cursor: "pointer"}} onClick={() => onSelect(i.key)}
                        onKeyDown={e => (e.key === "Enter" || e.key === " ") && onSelect(i.key)} aria-label={i.text}>
                        <rect x={x} y={y} width={w} height={h} rx={8} fill={heat[level]}
                            stroke={isKey || selected.includes(i.key) ? ink : edge}
                            strokeWidth={isKey ? 3.5 : selected.includes(i.key) ? 2 : 1}
                            strokeDasharray={i.ready ? undefined : "5 4"}/>
                        {lines.map((line, li) => <text key={li} x={x + 10} y={y + 20 + li * 16} fontSize={12.5}
                            fill={level === 3 ? "#fff" : ink} fontWeight={isKey ? 700 : 400}>{line}</text>)}
                    </g>;
                })}
            </svg>
        </Box>
        <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{mt: 0.5, px: 1}}>
            {[["most leverage", 3], ["some", 1], ["little", 0]].map(([label, level]) => <Stack key={label} direction="row" gap={0.5} alignItems="center">
                <Box sx={{width: 14, height: 14, borderRadius: 0.5, bgcolor: c.heat[level as number], border: 1, borderColor: "claude.line"}}/>
                <Typography variant="caption">{label}</Typography>
            </Stack>)}
            <Typography variant="caption">heavy border: start here · dashed: still waiting · arrow: done here opens that</Typography>
        </Stack>
    </Box>;
}

export function YourMoveSections({projects, allProjects, focus, threadLinkProps, openThread, onOpenThread, onInterest, onSetAside, projectName, spots, here, hereUntil, onPick, onEditSpots, onWhere, location, onArrivalAlerts}: {
    /* the projects in view (not quiet, not hidden), before the focus narrows them */
    projects: ClaudeProject[],
    /* every project there is, for the focus menu */
    allProjects: ClaudeProject[],
    focus: FocusState,
    /* where Jon can be, and where he said he is (until when) */
    spots: Spot[],
    here?: Spot,
    hereUntil?: string,
    onPick: (spot: Spot | undefined) => void,
    onEditSpots: () => void,
    onWhere: (item: MoveItem, where: string) => void,
    /* suggesting a spot from where the phone is */
    location?: WhereLocation,
    onArrivalAlerts?: () => void,
    threadLinkProps: (t: ClaudeThread) => object,
    /* goes to the thread (a double click), the way Jon chose to open Claude */
    openThread: (t: ClaudeThread) => void,
    onOpenThread: (t: ClaudeThread) => void,
    onInterest: (todo: ClaudeTodo, answer: InterestAnswer | undefined) => void,
    onSetAside: (t: ClaudeThread, until: string | null) => void,
    projectName: (p: ClaudeProject) => string
}) {
    const {domains, workShare, scope} = focus;
    const all = moveItems(projects.filter(p => inScope(domains, p, scope)), Date.now(),
        p => modeWeight(domainOf(domains, p).kind, workShare));
    // what the focus leaves out, so it never silently hides work
    const outside = scope ? moveItems(projects.filter(p => !inScope(domains, p, scope))).filter(i => i.ready).length : 0;
    const focusName = scopeName(domains, allProjects, scope, projectName);
    const clock = new Date();
    const hoursOf = new Map(all.map(i => [i.key, openState(spots, i.where, clock)]));
    const isOpen = (i: MoveItem) => hoursOf.get(i.key)!.open;
    const ready = all.filter(i => i.ready && isOpen(i) && fits(spots, i.where, here));
    // ready, but not from where Jon is: folded under "Not from here"
    const elsewhere = all.filter(i => i.ready && isOpen(i) && !fits(spots, i.where, here));
    // a closed spot's items wait with the to-dos that wait on other to-dos
    const later = all.filter(i => !i.ready || !isOpen(i));
    const [showElsewhere, setShowElsewhere] = React.useState(false);
    const [selected, setSelected] = React.useState<string>();
    const [pinned, setPinned] = React.useState<string[]>([]);
    const [allReady, setAllReady] = React.useState(false);
    const [why, setWhy] = React.useState(false);
    const byKey = new Map(all.map(i => [i.key, i]));
    // pinned cards stay; the one just tapped joins them; two at most, half and half
    const cards = [...new Set([...pinned, ...(selected ? [selected] : [])])].filter(k => byKey.has(k)).slice(-2);
    const pin = (key: string) => setPinned(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key].slice(-2));
    const close = (key: string) => {
        setPinned(p => p.filter(k => k !== key));
        if (selected === key) setSelected(undefined);
    };

    const picker = <WherePicker spots={spots} here={here} until={hereUntil} onPick={onPick} onEdit={onEditSpots} location={location} onAlerts={onArrivalAlerts}/>;
    const chips = <Box sx={{px: 2, pt: 1}}><FocusChips focus={focus} projects={allProjects} projectName={projectName}/></Box>;
    const outsideLine = outside > 0 && <Typography variant="body2" color="text.secondary" sx={{px: 2, pt: 1}} data-testid="outside-focus">
        {outside} more ready outside {focusName ?? "this focus"}.{" "}
        <Button size="small" sx={{color: "claude.ink", textTransform: "none", p: 0, minWidth: 0, verticalAlign: "baseline"}}
            onClick={() => focus.setScope(undefined)}>Show everything</Button>
    </Typography>;
    if (all.length === 0) {
        return <Box>
            {chips}
            <Box sx={{px: 2, py: 3}}>
                <Typography sx={{fontWeight: 600}}>{focusName ? `Nothing in ${focusName} waits on you right now.` : "Nothing waits on you right now."}</Typography>
                <Typography variant="body2" color="text.secondary">When a thread asks you something or leaves you a to-do, it shows up here.</Typography>
            </Box>
            {outsideLine}
        </Box>;
    }

    // the spot it needs, unless a phone will do; and the hours line when it matters
    const whereWords = (item: MoveItem) => {
        const spot = byName(spots, item.where);
        return spot?.parentId ? spot.name : undefined;
    };
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
            border: kind === "key" ? 3 : 1, borderColor: kind === "key" ? "claude.ring" : kind === "alt" ? "claude.cardEdge" : "transparent",
            opacity: kind === "later" ? 0.6 : 1, bgcolor: kind === "key" ? "claude.keyCardBg" : undefined
        }}
    >
        <Chip size="small" label={item.label} sx={{bgcolor: item.color, color: item.textColor, fontWeight: 600, mt: 0.25, flexShrink: 0}}/>
        <ListItemText
            primary={item.text}
            secondary={[hoursLine(hoursOf.get(item.key)!, clock), whereWords(item), item.reason, projectName(item.project)].filter(Boolean).join(" · ")}
            primaryTypographyProps={{sx: {overflowWrap: "anywhere", fontWeight: kind === "key" ? 600 : undefined}}}
            secondaryTypographyProps={{noWrap: true}}
            sx={{minWidth: 0, my: 0.25}}
        />
    </ListItemButton>;

    const start = ready.slice(0, 1 + alternates);
    const rest = ready.slice(1 + alternates);
    return <Box data-testid="your-move-sections">
        {chips}
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{px: 2, pt: 1}}>
            {picker}
            <ToggleButtonGroup size="small" exclusive value={why ? "why" : "list"} onChange={(_, v) => v && setWhy(v === "why")}>
                <ToggleButton value="list" sx={{textTransform: "none", py: 0.25}}>In order</ToggleButton>
                <ToggleButton value="why" sx={{textTransform: "none", py: 0.25}}>Why this order</ToggleButton>
            </ToggleButtonGroup>
        </Stack>
        {location && <WhereSuggestion location={location}/>}
        {outsideLine}
        {why && <OrderGraph all={all} keyItem={start[0]?.key} selected={cards} onSelect={setSelected}/>}
        {!why && <List dense disablePadding>
            {start.length > 0 && <ListSubheader sx={{bgcolor: "claude.surface", lineHeight: "32px", fontWeight: 600, color: "claude.ink"}}>Start here</ListSubheader>}
            {start.map((item, i) => row(item, i === 0 ? "key" : "alt"))}
            {here && start.length === 0 && <Typography variant="body2" color="text.secondary" sx={{px: 2, py: 1.5}} data-testid="nothing-here">
                Nothing waiting on you fits {here.name}.{elsewhere.length ? ` ${elsewhere.length} more can wait for another spot.` : ""}
            </Typography>}
            {rest.length > 0 && <ListSubheader sx={{bgcolor: "claude.surface", lineHeight: "32px", fontWeight: 600, color: "claude.ink", mt: 1}}>Ready</ListSubheader>}
            {(allReady ? rest : rest.slice(0, readyShown)).map(item => row(item, "ready"))}
            {rest.length > readyShown && <Button size="small" sx={{ml: 2, color: "claude.ink"}} onClick={() => setAllReady(!allReady)}>
                {allReady ? "Show fewer" : `Show ${rest.length - readyShown} more`}
            </Button>}
            {elsewhere.length > 0 && <Button size="small" data-testid="not-from-here" sx={{ml: 2, mt: 0.5, color: "claude.ink", textTransform: "none"}}
                onClick={() => setShowElsewhere(!showElsewhere)}>
                {showElsewhere ? `Hide the ${elsewhere.length} not from here` : `Not from here (${elsewhere.length})`}
            </Button>}
            {showElsewhere && elsewhere.map(item => row(item, "later"))}
            {later.length > 0 && <ListSubheader sx={{bgcolor: "claude.surface", lineHeight: "32px", fontWeight: 600, color: "claude.ink", mt: 1}}>Opens up later</ListSubheader>}
            {later.map(item => row(item, "later"))}
        </List>}
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
                onSetAside={onSetAside}
                projectName={projectName}
                spots={spots}
                hours={hoursOf.get(key)!}
                onWhere={onWhere}
            />)}
        </Box>}
    </Box>;
}
