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
        case "none": return <img src="/Enso.svg" width={size * 0.7} height={size * 0.7} alt=""/>;
    }
}

/* who leads each map, as a short tag on its card */
const leadName: Record<CrewLead, string> = {
    tour: "Whole crew", dog: "Dog", spider: "Spider", squirrel: "Squirrel", sloth: "Sloth",
    rabbit: "Rabbit", claude: "Claude", none: "No crew"
};

const sectionId = (t: StarterTemplate) => `template-${t.id}`;

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

function SpeechBubble({text, lean, side = "top"}: {text: string, lean: number, side?: "top" | "left"}) {
    //the tail reaches back toward the speaker: up toward them over the row, or out to the left toward them atop the column
    const tip = Math.max(-36, Math.min(36, lean));
    const edge = "rgba(0,0,0,0.28)";
    return (
        <Box sx={{position: "relative", mt: side === "top" ? "20px" : 0, ml: side === "left" ? "18px" : 0.5, mr: 0.5}}>
            {side === "top"
                ? <Box component="svg" aria-hidden viewBox="-40 0 80 22" width={80} height={22}
                    sx={{position: "absolute", top: -20, left: "50%", ml: "-40px", overflow: "visible"}}>
                    <path d={`M-9 21 L${tip} 0 L9 21`} fill="white" stroke={edge} strokeWidth={1.5} strokeLinejoin="round"/>
                    <rect x={-10} y={20} width={20} height={4} fill="white"/>
                </Box>
                : <Box component="svg" aria-hidden viewBox="0 0 22 30" width={22} height={30}
                    sx={{position: "absolute", top: 4, left: -19, overflow: "visible"}}>
                    <path d={`M21 8 L0 ${-tip} L21 22`} fill="white" stroke={edge} strokeWidth={1.5} strokeLinejoin="round"/>
                    <rect x={20} y={7} width={4} height={16} fill="white"/>
                </Box>}
            <Paper variant="outlined" sx={{px: 1.25, py: 1, borderRadius: 3, borderWidth: 1.5, borderColor: edge, textAlign: "center"}}>
                <Typography variant="body2" sx={{fontStyle: "italic", lineHeight: 1.35}}>{text}</Typography>
            </Paper>
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
                <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{lineHeight: 1.3, textAlign: "center"}}>{template.name}</Typography>
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
    const n = starterTemplates.length;
    return (
        <Box>
            {/* you, asking; kept outside the sideways scroll so you stay in the middle of the screen */}
            <Box sx={{display: "flex", justifyContent: "center", mb: -0.5}}><Speaker size={96}/></Box>
            <Box sx={{overflowX: "auto", pb: 1, mx: -1, px: 1}}>
                <Box sx={{display: "grid", gridTemplateColumns: `repeat(${n}, minmax(120px, 1fr))`, columnGap: 1.25, rowGap: 1.5, minWidth: n * 130}}>
                    {starterTemplates.map((t, i) =>
                        <SpeechBubble key={`${t.id}-ask`} text={t.pickWhen} lean={((n - 1) / 2 - i) * 15}/>)}
                    {starterTemplates.map(t => <AnswerCard key={t.id} template={t} onPick={onPick} onUse={onUse}/>)}
                </Box>
            </Box>
        </Box>
    );
}

/* Small and mid screens: you stand top left, and the questions run down a column beside you, each over its answer */
function ComparisonStack({onPick, onUse}: {onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    return (
        <Box sx={{display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 1, alignItems: "start"}}>
            <Box sx={{position: "sticky", top: 72, pt: 0.5}}><Speaker size={88}/></Box>
            <Stack gap={2.5} sx={{maxWidth: 360}}>
                {starterTemplates.map((t, i) =>
                    <Stack key={t.id} gap={1}>
                        <SpeechBubble text={t.pickWhen} side="left" lean={Math.min(36, i * 6)}/>
                        <Box sx={{ml: "18px"}}><AnswerCard template={t} onPick={onPick} onUse={onUse}/></Box>
                    </Stack>)}
            </Stack>
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
                    <Stack direction={{xs: "column", sm: "row"}} gap={2} alignItems={{xs: "flex-start", sm: "center"}}>
                        <YouScene size={72} aloft={false}/>
                        <Box>
                            <Typography variant="body1">
                                Each starter map begins you somewhere different. Your crew comes along to every map: you with your
                                balloon head, the dog, the squirrel, the spider and the sloth at HOME. Each map puts one of them forward.
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>
                                Tap a map to read more about it. Each one below has a preview you can try full screen without saving anything.
                            </Typography>
                        </Box>
                    </Stack>
                    <Stack gap={1}>
                        <ToggleButtonGroup size="small" exclusive value={compare} onChange={(_, v: Compare | null) => v && setCompare(v)}
                            aria-label="Compare the maps" sx={{alignSelf: "flex-end"}}>
                            <ToggleButton value="columns" aria-label="As questions" title="As questions"><ViewColumn fontSize="small"/></ToggleButton>
                            <ToggleButton value="rows" aria-label="One per row" title="One map per row"><TableRows fontSize="small"/></ToggleButton>
                        </ToggleButtonGroup>
                        {compare === "rows"
                            ? <ComparisonTable onPick={jump} onUse={use}/>
                            : wide
                                ? <ComparisonColumns onPick={jump} onUse={use}/>
                                : <ComparisonStack onPick={jump} onUse={use}/>}
                    </Stack>
                    {starterTemplates.map(t => <TemplateSection key={t.id} template={t} onUse={use} onPreview={setPreviewing}/>)}
                </Stack>
            </Container>
        </Box>
    );
}
