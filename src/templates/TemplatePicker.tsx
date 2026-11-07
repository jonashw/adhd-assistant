import React from "react";
import { useNavigate } from "react-router-dom";
import {
    AppBar, Box, Button, Card, CardActionArea, CardActions, Dialog, CardContent, CardHeader, Chip, Container, Divider, Grid, IconButton,
    List, ListItem, ListItemIcon, ListItemText, MobileStepper, Paper, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Toolbar, Typography, useMediaQuery, useTheme
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import { alpha } from "@mui/material/styles";
import { ArrowBack, CheckCircleOutline, Close, Fullscreen, TableRows, ViewColumn, KeyboardArrowLeft, KeyboardArrowRight, RemoveCircleOutline, Replay } from "@mui/icons-material";
import { Dog, Spider, Squirrel, YouScene } from "../Crew";
import { ClaudeMapIcon } from "../ClaudeMapIcon";
import { RabbitBurrow, RabbitBurrowLoop } from "../crew/Rabbit";
import { Speaker } from "../crew/Speaker";
import { BalloonTrail } from "../crew/BalloonTrail";
import { MapEmblem } from "./MapEmblem";
import { useLocalStorage } from "../useLocalStorage";
import MindMapGraph from "../MindMapGraph";
import { NavigatorProvider } from "../NavigatorContext";
import { memoryTrailStore } from "../Trail";
import { GraphRepositoryContext } from "../GraphRepositoryContext";
import { MindMap } from "../MindMap";
import { CrewLead, StarterTemplate, graphAtStep, instantiate, placeCount, starterTemplates } from "./templates";
import { PreviewLegend, TemplatePreview } from "./TemplatePreview";

/* "Help me pick": every starter map side by side in a table, then each one in full,
   with a preview of its tree and a walkthrough of the edits you'd typically make on it */

function CrewFace({crew, size = 40}: {crew: CrewLead, size?: number}) {
    switch (crew) {
        case "tour": return <YouScene size={size} aloft={false}/>;
        case "dog": return <Dog size={size * 0.8}/>;
        case "spider": return <Spider size={size * 0.6}/>;
        case "squirrel": return <Squirrel size={size * 0.7}/>;
        case "rabbit": return <RabbitBurrowLoop size={size}/>;
        case "claude": return <ClaudeMapIcon size={size * 0.7}/>;
        case "sloth":
        case "none": return <img className="line-art" src="/Enso.svg" width={size * 0.7} height={size * 0.7} alt=""/>;
        case "review": return <img className="line-art" src="/review.svg" width={size * 0.7} height={size * 0.7} alt=""/>;
    }
}

/* who leads each map, as a short tag on its card */
const leadName: Record<CrewLead, string> = {
    tour: "Whole crew", dog: "Dog", spider: "Spider", squirrel: "Squirrel", sloth: "Sloth", review: "No crew",
    rabbit: "Rabbit", claude: "Claude", none: "No crew"
};

const sectionId = (t: StarterTemplate) => `template-${t.id}`;

/* the maps that each answer a question in their own picture; the rest are smaller variations, listed after */
const secondary = new Set(["base-camp"]);
const featured = starterTemplates.filter(t => !secondary.has(t.id));
const others = starterTemplates.filter(t => secondary.has(t.id));

function MoreMaps({onPick, onUse}: {onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    return (
        <Stack gap={1}>
            <Typography variant="overline" color="text.secondary">More starter maps</Typography>
            <Box sx={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 1}}>
                {others.map(t =>
                    <Card key={t.id} variant="outlined" sx={{display: "flex", alignItems: "center", pl: 2, pr: 0.75, py: 0.5,
                        bgcolor: theme => alpha(theme.palette.primary.main, 0.06)}}>
                        <Typography variant="body2" sx={{flexGrow: 1}}>{t.name}</Typography>
                        <Button size="small" sx={{minWidth: 0}} onClick={() => onPick(t)} aria-label={`Read more about ${t.name}`}>More</Button>
                        <Button size="small" sx={{minWidth: 0, ml: 0.5}} variant="contained" onClick={() => onUse(t)} aria-label={`Start with ${t.name}`}>Start</Button>
                    </Card>)}
            </Box>
        </Stack>
    );
}

function ComparisonTable({onPick, onUse}: {onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    const wide = {display: {xs: "none", sm: "table-cell"}};
    return (
        <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Starter maps compared">
                <TableHead>
                    <TableRow>
                        <TableCell>Map</TableCell>
                        <TableCell>Pick it when</TableCell>
                        <TableCell sx={wide}>What it teaches</TableCell>
                        <TableCell align="right" sx={wide}>Places</TableCell>
                        <TableCell sx={wide}>Afterwards</TableCell>
                        <TableCell align="right"><Box component="span" sx={visuallyHidden}>Start</Box></TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {starterTemplates.map(t =>
                        <TableRow key={t.id} hover sx={{cursor: "pointer"}} onClick={() => onPick(t)}>
                            <TableCell>
                                <Stack direction="row" alignItems="center" gap={1}>
                                    <Box sx={{width: 48, display: "flex", justifyContent: "center", flexShrink: 0}}><CrewFace crew={t.crew} size={32}/></Box>
                                    <Stack>
                                        <Typography variant="body2" fontWeight={500}>{t.name}</Typography>
                                        {t.badge && <Chip label={t.badge} size="small" color="primary" sx={{alignSelf: "flex-start", height: 20}}/>}
                                    </Stack>
                                </Stack>
                            </TableCell>
                            <TableCell>{t.pickWhen}</TableCell>
                            <TableCell sx={wide}>{t.teaches}</TableCell>
                            <TableCell align="right" sx={wide}>{placeCount(t)}</TableCell>
                            <TableCell sx={wide}>{t.keep}</TableCell>
                            <TableCell align="right">
                                <Button size="small" variant="outlined" aria-label={`Start with ${t.name}`}
                                    onClick={e => { e.stopPropagation(); onUse(t); }}>
                                    Start
                                </Button>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

/* The same comparison turned on its side: you ask yourself a question up top, each map's question floats in
   a speech bubble pointing back at you, and below it, framed apart, the map that answers it. No header row. */

/* where the speaker's open mouth is on screen, so every bubble's tail can point at it, even while the speaker
   rides down the page beside the questions */
type MouthRef = React.RefObject<HTMLElement>;
const mouthAt = (speaker: HTMLElement) => {
    const r = speaker.getBoundingClientRect();
    //the mouth sits at (24, 48.5) on the speaker's 52 x 96 drawing
    return {x: r.left + r.width * 24 / 52, y: r.top + r.height * 48.5 / 96};
};

function useTail(bubble: React.RefObject<HTMLElement>, mouth: MouthRef, side: "top" | "left") {
    const [tail, setTail] = React.useState<{base: number, tip: [number, number]}>();
    React.useEffect(() => {
        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const b = bubble.current?.getBoundingClientRect();
                const m = mouth.current ? mouthAt(mouth.current) : undefined;
                if (!b || !m) {
                    return;
                }
                //the tail leaves the bubble's edge at the point nearest the mouth, and reaches a short way toward it
                const base = side === "left"
                    ? Math.max(12, Math.min(b.height - 12, m.y - b.top))
                    : Math.max(18, Math.min(b.width - 18, m.x - b.left));
                const from: [number, number] = side === "left" ? [0, base] : [base, 0];
                const dx = m.x - (b.left + from[0]), dy = m.y - (b.top + from[1]);
                const dist = Math.max(1, Math.hypot(dx, dy));
                const len = Math.min(side === "left" ? 22 : 30, dist - 8);
                setTail({base, tip: [from[0] + dx / dist * len, from[1] + dy / dist * len]});
            });
        };
        update();
        window.addEventListener("scroll", update, {passive: true, capture: true});
        window.addEventListener("resize", update);
        const observer = new ResizeObserver(update);
        if (bubble.current) {
            observer.observe(bubble.current);
        }
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", update, {capture: true});
            window.removeEventListener("resize", update);
            observer.disconnect();
        };
    }, [bubble, mouth, side]);
    return tail;
}

function SpeechBubble({text, mouth, side = "top"}: {text: string, mouth: MouthRef, side?: "top" | "left"}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const tail = useTail(ref, mouth, side);
    // the tail is filled with the bubble's own paper, so it joins seamlessly in light and dark
    const theme = useTheme();
    const paper = theme.palette.background.paper;
    const edge = theme.palette.mode === "dark" ? "rgba(222,220,209,0.35)" : "rgba(0,0,0,0.28)";
    const w = 8;
    const points = tail && (side === "left"
        ? [[1.5, tail.base - w], tail.tip, [1.5, tail.base + w]]
        : [[tail.base - w, 1.5], tail.tip, [tail.base + w, 1.5]]);
    return (
        <Box sx={{position: "relative", mt: side === "top" ? "30px" : 0, ml: side === "left" ? "18px" : 0.5, mr: 0.5}}>
            <Paper ref={ref} variant="outlined" sx={{px: 1.25, py: 1, borderRadius: 3, borderWidth: 1.5, borderColor: edge, textAlign: "center"}}>
                <Typography variant="body2" sx={{fontStyle: "italic", lineHeight: 1.35}}>{text}</Typography>
            </Paper>
            {/* the tail, drawn over the bubble's edge so the gap where it joins is white */}
            {points && <Box component="svg" aria-hidden width={1} height={1}
                sx={{position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none"}}>
                <path d={`M${points.map(p => p.join(" ")).join(" L")}`} fill={paper} stroke={edge} strokeWidth={1.5} strokeLinejoin="round"/>
                <path d={side === "left" ? `M1.5 ${tail.base - w + 1.5} L1.5 ${tail.base + w - 1.5}` : `M${tail.base - w + 1.5} 1.5 L${tail.base + w - 1.5} 1.5`}
                    stroke={paper} strokeWidth={3}/>
            </Box>}
        </Box>
    );
}

/* The answer to one question: the map's one character, its name, and a footer to read more or start it */
function AnswerCard({template, onPick, onUse}: {template: StarterTemplate, onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    return (
        <Card variant="outlined" aria-label={template.name}
            sx={{display: "flex", flexDirection: "column", bgcolor: theme => alpha(theme.palette.primary.main, 0.06)}}>
            <CardActionArea onClick={() => onPick(template)} title={`Read more about ${template.name}`}
                sx={{flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", px: 1.5, pt: 1.5, pb: 1.5, gap: 1}}>
                <Box sx={{height: 64, display: "flex", alignItems: "center", justifyContent: "center"}}><MapEmblem crew={template.crew} size={60}/></Box>
                <Typography variant="subtitle2" component="h3" fontWeight={400} sx={{lineHeight: 1.3, textAlign: "center"}}>{template.name}</Typography>
            </CardActionArea>
            <Divider/>
            <CardActions sx={{bgcolor: "background.paper", justifyContent: "space-between", px: 0.75, gap: 0.5, "& > :not(style) ~ :not(style)": {ml: 0}}}>
                <Button size="small" sx={{minWidth: 0, px: 0.75}} onClick={() => onPick(template)} aria-label={`Read more about ${template.name}`}>More</Button>
                <Button size="small" sx={{minWidth: 0, px: 1.25}} variant="contained" aria-label={`Start with ${template.name}`} onClick={() => onUse(template)}>Start</Button>
            </CardActions>
        </Card>
    );
}

/* Wide screens: you stand over a row of questions, each answered by the card under it */
function ComparisonColumns({onPick, onUse}: {onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    const n = featured.length;
    const mouth = React.useRef<HTMLDivElement>(null);
    return (
        <Box>
            {/* you, asking; kept outside the sideways scroll so you stay in the middle of the screen */}
            <Box sx={{display: "flex", justifyContent: "center", mb: -0.5}}><Box ref={mouth} sx={{lineHeight: 0}}><Speaker size={96}/></Box></Box>
            <Box sx={{overflowX: "auto", pb: 1, mx: -1, px: 1}}>
                <Box sx={{display: "grid", gridTemplateColumns: `repeat(${n}, minmax(120px, 1fr))`, columnGap: 1.25, rowGap: 1.5, minWidth: n * 130}}>
                    {featured.map(t =>
                        <SpeechBubble key={`${t.id}-ask`} text={t.pickWhen} mouth={mouth}/>)}
                    {featured.map(t => <AnswerCard key={t.id} template={t} onPick={onPick} onUse={onUse}/>)}
                </Box>
            </Box>
        </Box>
    );
}

/* Small and mid screens: you stand top left, and the questions run down a column beside you, each over its answer */
function ComparisonStack({onPick, onUse}: {onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    const mouth = React.useRef<HTMLDivElement>(null);
    return (
        <Box sx={{display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 1, alignItems: "start"}}>
            {/* raised so your mouth is level with the first question; it rides down the page as you scroll */}
            <Box ref={mouth} sx={{position: "sticky", top: 64, mt: "-24px", lineHeight: 0}}><Speaker size={88}/></Box>
            {/* one column of questions on a phone, two side by side when there's room */}
            <Box sx={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", columnGap: 2, rowGap: 2.5}}>
                {featured.map(t =>
                    <Stack key={t.id} gap={1}>
                        <SpeechBubble text={t.pickWhen} side="left" mouth={mouth}/>
                        <Box sx={{ml: "18px"}}><AnswerCard template={t} onPick={onPick} onUse={onUse}/></Box>
                    </Stack>)}
            </Box>
        </Box>
    );
}

/* the width a box has to draw in */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
    const ref = React.useRef<T>(null);
    const [width, setWidth] = React.useState(0);
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
        observer.observe(el);
        setWidth(Math.floor(el.getBoundingClientRect().width));
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

function Walkthrough({template, onPreview}: {template: StarterTemplate, onPreview: (t: StarterTemplate) => void}) {
    const [step, setStep] = React.useState(0);
    const steps = template.walkthrough;
    const graph = React.useMemo(() => graphAtStep(template, step), [template, step]);
    const last = step === steps.length - 1;
    const scene = template.graph.nodes.find(n => n.type === "HOME")?.scene;
    const [box, width] = useWidth<HTMLDivElement>();
    return (
        <Paper variant="outlined" sx={{p: 1.5, borderRadius: 2, height: "100%"}}>
        <Stack gap={1}>
            {/* the preview draws the map the way it opens, and opens full screen from here */}
            <Stack direction="row" alignItems="center" sx={{mt: -0.75, mb: -0.5}}>
                <Typography variant="overline" color="text.secondary" sx={{flexGrow: 1, lineHeight: 1.5}}>
                    {scene === "burrow" ? "Opens as rabbit holes" : scene === "crew" ? "Opens as Balloon-head" : "Opens as a graph"}
                </Typography>
                <Button size="small" startIcon={<Fullscreen/>} onClick={() => onPreview(template)}
                    aria-label={`Try ${template.name} full screen`}>Try it</Button>
            </Stack>
            <Box ref={box} sx={{overflowX: "auto", borderRadius: 1}}>
                {scene === "burrow"
                    ? <RabbitBurrow size={260} graph={graph} at={steps[step].focus}/>
                    : scene === "crew"
                        ? width > 0 && <BalloonTrail width={width} height={300} graph={graph} at={steps[step].focus} selected={steps[step].focus}/>
                        : <TemplatePreview graph={graph} focus={steps[step].focus} title={template.name}/>}
            </Box>
            <Divider/>
            <Typography variant="overline" color="text.secondary" sx={{lineHeight: 1.5}}>
                Try it · step {step + 1} of {steps.length}
            </Typography>
            <Typography variant="body2" sx={{minHeight: "3em"}} aria-live="polite">{steps[step].caption}</Typography>
            <MobileStepper variant="dots" steps={steps.length} position="static" activeStep={step}
                sx={{px: 0, bgcolor: "transparent"}}
                backButton={
                    <Button size="small" onClick={() => setStep(s => s - 1)} disabled={step === 0} startIcon={<KeyboardArrowLeft/>}>Back</Button>
                }
                nextButton={last
                    ? <Button size="small" onClick={() => setStep(0)} startIcon={<Replay/>}>Again</Button>
                    : <Button size="small" onClick={() => setStep(s => s + 1)} endIcon={<KeyboardArrowRight/>}>Next</Button>}
            />
            {scene === "burrow"
                ? <Typography variant="caption" color="text.secondary">
                    Each place is a chamber under its parent. A lit lantern means active, faded means someday,
                    and backfilled means done. What a note holds lies on the chamber floor.
                </Typography>
                : scene === "crew"
                    ? <Typography variant="caption" color="text.secondary">
                        The places under HOME stand on the ground in a ring for your feet to walk. Each step deeper floats your
                        head up to a cloud, and the cloud you're at lights the way.
                    </Typography>
                    : <PreviewLegend/>}
        </Stack>
        </Paper>
    );
}

function TemplateSection({template, onUse, onPreview}: {template: StarterTemplate, onUse: (t: StarterTemplate) => void, onPreview: (t: StarterTemplate) => void}) {
    return (
        <Card id={sectionId(template)} variant="outlined"
            sx={{scrollMarginTop: 72, bgcolor: theme => alpha(theme.palette.primary.main, 0.06)}}>
            <CardHeader
                avatar={<Box sx={{width: 56, display: "flex", justifyContent: "center"}}><MapEmblem crew={template.crew} size={52}/></Box>}
                title={<Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="h6" component="h2">{template.name}</Typography>
                    {template.badge && <Chip label={template.badge} size="small" color="primary"/>}
                    <Chip label={`Led by: ${leadName[template.crew]}`} size="small" variant="outlined" sx={{bgcolor: "background.paper"}}/>
                </Stack>}
                subheader={<>
                    <Box component="span" sx={{display: "block"}}>{`Pick it when you're thinking ${template.pickWhen}`}</Box>
                    <Box component="span" sx={{display: "block"}}>{`Teaches: ${template.teaches}`}</Box>
                </>}
            />
            <CardContent sx={{pt: 0}}>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={7}>
                        <Walkthrough template={template} onPreview={onPreview}/>
                    </Grid>
                    <Grid item xs={12} md={5}>
                        <Stack gap={1.5} component={Paper} variant="outlined" sx={{p: 2, borderRadius: 2, height: "100%"}}>
                            <Typography variant="body1">{template.summary}</Typography>
                            <Box>
                                <Typography variant="overline" color="text.secondary">Why pick it</Typography>
                                <Typography variant="body2">{template.why}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="overline" color="text.secondary">Pros</Typography>
                                <List dense disablePadding>
                                    {template.pros.map(p =>
                                        <ListItem key={p} disableGutters sx={{alignItems: "flex-start"}}>
                                            <ListItemIcon sx={{minWidth: 32, mt: 0.5}}><CheckCircleOutline color="success" fontSize="small"/></ListItemIcon>
                                            <ListItemText primary={p}/>
                                        </ListItem>)}
                                </List>
                            </Box>
                            <Box>
                                <Typography variant="overline" color="text.secondary">Cons</Typography>
                                <List dense disablePadding>
                                    {template.cons.map(c =>
                                        <ListItem key={c} disableGutters sx={{alignItems: "flex-start"}}>
                                            <ListItemIcon sx={{minWidth: 32, mt: 0.5}}><RemoveCircleOutline color="action" fontSize="small"/></ListItemIcon>
                                            <ListItemText primary={c}/>
                                        </ListItem>)}
                                </List>
                            </Box>
                        </Stack>
                    </Grid>
                </Grid>
            </CardContent>
            <Divider/>
            <CardActions sx={{justifyContent: "flex-end", px: 2, bgcolor: "background.paper"}}>
                <Typography variant="body2" color="text.secondary" sx={{mr: "auto"}}>{template.keep}</Typography>
                <Button variant="contained" onClick={() => onUse(template)}>Start with this map</Button>
            </CardActions>
        </Card>
    );
}

type Compare = "columns" | "rows";

/* The map itself, full screen, to try out before you start it: nothing is saved, and closing throws it away */
function TemplatePreviewDialog({template, onClose, onUse}: {template: StarterTemplate, onClose: () => void, onUse: (t: StarterTemplate) => void}) {
    const [graph, setGraph] = React.useState(() => MindMap.normalize({...instantiate(template), id: `preview-${template.id}`}));
    const trailStore = React.useMemo(() => memoryTrailStore(), []);
    return (
        <Dialog fullScreen open onClose={onClose} aria-label={`Preview of ${template.name}`}>
            <NavigatorProvider graph={graph} trailStore={trailStore}>
                <MindMapGraph value={graph} onChange={g => setGraph(current => ({...g, id: current.id}))} onBack={onClose}
                    banner={<Stack direction="row" alignItems="center" gap={1}
                        sx={{px: 2, py: 0.75, bgcolor: "warning.light", color: "warning.contrastText"}} data-testid="preview-banner">
                        <Typography variant="body2" sx={{flexGrow: 1}}>
                            <b>Preview: {template.name}.</b> Try anything; nothing is saved.
                        </Typography>
                        <Button size="small" variant="contained" color="primary" onClick={() => onUse(template)}>Start with this map</Button>
                        <IconButton size="small" color="inherit" edge="end" onClick={onClose} aria-label="Close the preview" title="Close (Esc)">
                            <Close/>
                        </IconButton>
                    </Stack>}/>
            </NavigatorProvider>
        </Dialog>
    );
}

export function TemplatePicker() {
    const navigate = useNavigate();
    const [compare, setCompare] = useLocalStorage<Compare>("columns", "adhd.templateCompare", v => v, v => v === "rows" ? "rows" : "columns");
    const GraphContext = React.useContext(GraphRepositoryContext);
    const use = (template: StarterTemplate) => {
        const graph = MindMap.normalize({...instantiate(template), id: crypto.randomUUID()});
        GraphContext.saveGraph(graph);
        navigate(`/graph/${graph.id}`);
    };
    const [previewing, setPreviewing] = React.useState<StarterTemplate>();
    const wide = useMediaQuery(useTheme().breakpoints.up("md"));
    const jump = (template: StarterTemplate) =>
        document.getElementById(sectionId(template))?.scrollIntoView({behavior: "smooth", block: "start"});
    return (
        <Box sx={{minHeight: "100svh", bgcolor: "background.default"}}>
            <AppBar position="sticky" enableColorOnDark>
                <Toolbar sx={{gap: 1}}>
                    <IconButton edge="start" color="inherit" aria-label="Back to your maps" onClick={() => navigate("/")}>
                        <ArrowBack/>
                    </IconButton>
                    <Typography variant="h6" component="h1">Help me pick a map</Typography>
                </Toolbar>
            </AppBar>
            {previewing && <TemplatePreviewDialog template={previewing} onClose={() => setPreviewing(undefined)}
                onUse={t => { setPreviewing(undefined); use(t); }}/>}
            <Container maxWidth="md" sx={{py: 3}}>
                <Stack gap={3}>
                    <Stack direction="row" gap={2} alignItems="center">
                        <YouScene size={72} aloft={false}/>
                        <Typography variant="body1">Each starter map begins you somewhere different.</Typography>
                    </Stack>
                    <Stack gap={1}>
                        <ToggleButtonGroup size="small" exclusive value={compare} onChange={(_, v: Compare | null) => v && setCompare(v)}
                            aria-label="Compare the maps" sx={{alignSelf: "flex-end"}}>
                            <ToggleButton value="columns" aria-label="As questions" title="As questions"><ViewColumn fontSize="small"/></ToggleButton>
                            <ToggleButton value="rows" aria-label="One per row" title="One map per row"><TableRows fontSize="small"/></ToggleButton>
                        </ToggleButtonGroup>
                        {compare === "rows"
                            ? <ComparisonTable onPick={jump} onUse={use}/>
                            : <>
                                {wide
                                    ? <ComparisonColumns onPick={jump} onUse={use}/>
                                    : <ComparisonStack onPick={jump} onUse={use}/>}
                                <MoreMaps onPick={jump} onUse={use}/>
                            </>}
                    </Stack>
                    {starterTemplates.map(t => <TemplateSection key={t.id} template={t} onUse={use} onPreview={setPreviewing}/>)}
                </Stack>
            </Container>
        </Box>
    );
}
