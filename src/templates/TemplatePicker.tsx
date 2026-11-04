import React from "react";
import { useNavigate } from "react-router-dom";
import {
    AppBar, Box, Button, Card, CardActionArea, CardActions, CardContent, CardHeader, Chip, Container, Divider, Grid, IconButton,
    List, ListItem, ListItemIcon, ListItemText, MobileStepper, Paper, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Toolbar, Typography
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import { alpha } from "@mui/material/styles";
import { ArrowBack, CheckCircleOutline, PlaceOutlined, TableRows, ViewColumn, KeyboardArrowLeft, KeyboardArrowRight, RemoveCircleOutline, Replay } from "@mui/icons-material";
import { Dog, Spider, Squirrel, YouScene } from "../Crew";
import { ClaudeMapIcon } from "../ClaudeMapIcon";
import { RabbitBurrow, RabbitBurrowLoop } from "../crew/Rabbit";
import { Speaker } from "../crew/Speaker";
import { useLocalStorage } from "../useLocalStorage";
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

function SpeechBubble({text, lean}: {text: string, lean: number}) {
    //the tail leans toward the speaker, who stands over the middle of the table
    const tip = Math.max(-36, Math.min(36, lean));
    return (
        <Box sx={{position: "relative", mt: "20px", mx: 0.5}}>
            <Box component="svg" aria-hidden viewBox="-40 0 80 22" width={80} height={22}
                sx={{position: "absolute", top: -20, left: "50%", ml: "-40px", overflow: "visible"}}>
                <path d={`M-9 21 L${tip} 0 L9 21`} fill="white" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round"
                    style={{color: "rgba(0,0,0,0.28)"}}/>
                <rect x={-10} y={20} width={20} height={4} fill="white"/>
            </Box>
            <Paper variant="outlined" sx={{px: 1.25, py: 1, borderRadius: 3, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.28)", textAlign: "center"}}>
                <Typography variant="body2" sx={{fontStyle: "italic", lineHeight: 1.35}}>{text}</Typography>
            </Paper>
        </Box>
    );
}

function ComparisonColumns({onPick, onUse}: {onPick: (t: StarterTemplate) => void, onUse: (t: StarterTemplate) => void}) {
    const n = starterTemplates.length;
    const fact = (label: string, text: React.ReactNode) =>
        <Box>
            <Typography variant="overline" color="text.secondary" sx={{lineHeight: 1.4, display: "block"}}>{label}</Typography>
            <Typography variant="body2">{text}</Typography>
        </Box>;
    return (
        <Box>
            {/* you, asking; kept outside the sideways scroll so you stay in the middle of the screen */}
            <Box sx={{display: "flex", justifyContent: "center", mb: -0.5}}><Speaker size={96}/></Box>
            <Box sx={{overflowX: "auto", pb: 1, mx: -1, px: 1}}>
                <Box sx={{display: "grid", gridTemplateColumns: `repeat(${n}, minmax(128px, 1fr))`, columnGap: 1.25, rowGap: 1.5, minWidth: n * 138}}>
                    {/* the question you ask yourself, outside the cards */}
                    {starterTemplates.map((t, i) =>
                        <SpeechBubble key={`${t.id}-ask`} text={t.pickWhen} lean={((n - 1) / 2 - i) * 15}/>)}
                    {/* and the map that answers it, one card each */}
                    {starterTemplates.map(t =>
                        <Card key={t.id} variant="outlined" aria-label={t.name}
                            sx={{display: "flex", flexDirection: "column", bgcolor: theme => alpha(theme.palette.primary.main, 0.06)}}>
                            <CardActionArea onClick={() => onPick(t)} sx={{flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start"}}>
                                <Box sx={{display: "flex", justifyContent: "center", alignItems: "center", height: 76, pt: 1.5}}>
                                    <CrewFace crew={t.crew} size={56}/>
                                </Box>
                                <Box sx={{px: 1.5, pt: 1, pb: 1, textAlign: "center"}}>
                                    <Typography variant="subtitle2" component="h3" sx={{lineHeight: 1.3}}>{t.name}</Typography>
                                    <Stack direction="row" gap={0.5} justifyContent="center" flexWrap="wrap" sx={{mt: 0.75, minHeight: 22}}>
                                        {t.badge && <Chip label={t.badge} size="small" color="primary" sx={{height: 20}}/>}
                                        <Chip label={leadName[t.crew]} size="small" variant="outlined" sx={{height: 20, bgcolor: "background.paper"}}/>
                                    </Stack>
                                </Box>
                                <Paper variant="outlined" sx={{mx: 1, mb: 1, p: 1.25, borderRadius: 2, flexGrow: 1}}>
                                    <Stack gap={1}>
                                        {fact("Teaches", t.teaches)}
                                        {fact("Afterwards", t.keep)}
                                    </Stack>
                                </Paper>
                            </CardActionArea>
                            <Divider/>
                            <CardActions sx={{bgcolor: "background.paper", justifyContent: "space-between", px: 1.25, gap: 0.5}}>
                                <Stack direction="row" alignItems="center" gap={0.25} sx={{color: "text.secondary"}} title={`${placeCount(t)} places`} aria-label={`${placeCount(t)} places`}>
                                    <PlaceOutlined sx={{fontSize: 16}}/>
                                    <Typography variant="caption">{placeCount(t)}</Typography>
                                </Stack>
                                <Button size="small" variant="contained" aria-label={`Start with ${t.name}`} onClick={() => onUse(t)}>Start</Button>
                            </CardActions>
                        </Card>)}
                </Box>
            </Box>
        </Box>
    );
}

function Walkthrough({template}: {template: StarterTemplate}) {
    const [step, setStep] = React.useState(0);
    const steps = template.walkthrough;
    const graph = React.useMemo(() => graphAtStep(template, step), [template, step]);
    const last = step === steps.length - 1;
    return (
        <Paper variant="outlined" sx={{p: 1.5, borderRadius: 2, height: "100%"}}>
        <Stack gap={1}>
            <Box sx={{overflowX: "auto"}}>
                {template.crew === "rabbit"
                    ? <RabbitBurrow size={260} graph={graph} at={steps[step].focus}/>
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
            {template.crew === "rabbit"
                ? <Typography variant="caption" color="text.secondary">
                    Each place is a chamber under its parent. A lit lantern means active, faded means someday,
                    and backfilled means done. What a note holds lies on the chamber floor.
                </Typography>
                : <PreviewLegend/>}
        </Stack>
        </Paper>
    );
}

function TemplateSection({template, onUse}: {template: StarterTemplate, onUse: (t: StarterTemplate) => void}) {
    return (
        <Card id={sectionId(template)} variant="outlined"
            sx={{scrollMarginTop: 72, bgcolor: theme => alpha(theme.palette.primary.main, 0.06)}}>
            <CardHeader
                avatar={<Box sx={{width: 56, display: "flex", justifyContent: "center"}}><CrewFace crew={template.crew} size={48}/></Box>}
                title={<Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="h6" component="h2">{template.name}</Typography>
                    {template.badge && <Chip label={template.badge} size="small" color="primary"/>}
                </Stack>}
                subheader={`Pick it when you're thinking ${template.pickWhen}`}
            />
            <CardContent sx={{pt: 0}}>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={7}>
                        <Walkthrough template={template}/>
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
                <Typography variant="body2" color="text.secondary" sx={{mr: "auto"}}>
                    {placeCount(template)} places · {template.keep}
                </Typography>
                <Button variant="contained" onClick={() => onUse(template)}>Start with this map</Button>
            </CardActions>
        </Card>
    );
}

type Compare = "columns" | "rows";

export function TemplatePicker() {
    const navigate = useNavigate();
    const [compare, setCompare] = useLocalStorage<Compare>("columns", "adhd.templateCompare", v => v, v => v === "rows" ? "rows" : "columns");
    const GraphContext = React.useContext(GraphRepositoryContext);
    const use = (template: StarterTemplate) => {
        const graph = MindMap.normalize({...instantiate(template), id: crypto.randomUUID()});
        GraphContext.saveGraph(graph);
        navigate(`/graph/${graph.id}`);
    };
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
                                Tap a map to read more and try it out before you start it.
                            </Typography>
                        </Box>
                    </Stack>
                    <Stack gap={1}>
                        <ToggleButtonGroup size="small" exclusive value={compare} onChange={(_, v: Compare | null) => v && setCompare(v)}
                            aria-label="Compare the maps" sx={{alignSelf: "flex-end"}}>
                            <ToggleButton value="columns" aria-label="Side by side" title="Maps side by side"><ViewColumn fontSize="small"/></ToggleButton>
                            <ToggleButton value="rows" aria-label="One per row" title="One map per row"><TableRows fontSize="small"/></ToggleButton>
                        </ToggleButtonGroup>
                        {compare === "columns"
                            ? <ComparisonColumns onPick={jump} onUse={use}/>
                            : <ComparisonTable onPick={jump} onUse={use}/>}
                    </Stack>
                    {starterTemplates.map(t => <TemplateSection key={t.id} template={t} onUse={use}/>)}
                </Stack>
            </Container>
        </Box>
    );
}
