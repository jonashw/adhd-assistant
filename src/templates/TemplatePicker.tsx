import React from "react";
import { useNavigate } from "react-router-dom";
import {
    AppBar, Box, Button, Card, CardActions, CardContent, CardHeader, Chip, Container, Divider, Grid, IconButton,
    List, ListItem, ListItemIcon, ListItemText, MobileStepper, Paper, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Toolbar, Typography
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import { ArrowBack, CheckCircleOutline, KeyboardArrowLeft, KeyboardArrowRight, RemoveCircleOutline, Replay } from "@mui/icons-material";
import { Dog, Spider, Squirrel, YouScene } from "../Crew";
import { ClaudeMapIcon } from "../ClaudeMapIcon";
import { RabbitHoles } from "./RabbitHoles";
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
        case "rabbit": return <RabbitHoles size={size}/>;
        case "claude": return <ClaudeMapIcon size={size * 0.7}/>;
        case "sloth":
        case "none": return <img src="/Enso.svg" width={size * 0.7} height={size * 0.7} alt=""/>;
    }
}

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

function Walkthrough({template}: {template: StarterTemplate}) {
    const [step, setStep] = React.useState(0);
    const steps = template.walkthrough;
    const graph = React.useMemo(() => graphAtStep(template, step), [template, step]);
    const last = step === steps.length - 1;
    return (
        <Stack gap={1}>
            <Paper variant="outlined" sx={{p: 1, overflowX: "auto"}}>
                <TemplatePreview graph={graph} focus={steps[step].focus} title={template.name}/>
            </Paper>
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
            <PreviewLegend/>
        </Stack>
    );
}

function TemplateSection({template, onUse}: {template: StarterTemplate, onUse: (t: StarterTemplate) => void}) {
    return (
        <Card id={sectionId(template)} variant="outlined" sx={{scrollMarginTop: 72}}>
            <CardHeader
                avatar={<Box sx={{width: 56, display: "flex", justifyContent: "center"}}><CrewFace crew={template.crew} size={48}/></Box>}
                title={<Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="h6" component="h2">{template.name}</Typography>
                    {template.badge && <Chip label={template.badge} size="small" color="primary"/>}
                </Stack>}
                subheader={`Pick it when you're thinking ${template.pickWhen}`}
            />
            <CardContent sx={{pt: 0}}>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={7}>
                        <Walkthrough template={template}/>
                    </Grid>
                    <Grid item xs={12} md={5}>
                        <Stack gap={1.5}>
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
            <CardActions sx={{justifyContent: "flex-end", px: 2}}>
                <Typography variant="body2" color="text.secondary" sx={{mr: "auto"}}>
                    {placeCount(template)} places · {template.keep}
                </Typography>
                <Button variant="contained" onClick={() => onUse(template)}>Start with this map</Button>
            </CardActions>
        </Card>
    );
}

export function TemplatePicker() {
    const navigate = useNavigate();
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
                                Tap a row to read more and try the map out before you start it.
                            </Typography>
                        </Box>
                    </Stack>
                    <ComparisonTable onPick={jump} onUse={use}/>
                    {starterTemplates.map(t => <TemplateSection key={t.id} template={t} onUse={use}/>)}
                </Stack>
            </Container>
        </Box>
    );
}
