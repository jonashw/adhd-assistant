import React from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Chip, IconButton, Stack, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { CrewAtRest, Dog, Jon, MindfulScene, RabbitBurrow, RabbitBurrowLoop, Sloth, Spider, Squirrel, Yanchi, YanchiFace, YouScene, YouStage } from "./Crew";
import { burrowDemoGraph } from "./crew/burrowDemo";
import { ldaedFaces } from "./crew/ldaed.generated";

const yanchiFaces = Object.keys(ldaedFaces) as YanchiFace[];
import { Mindful } from "./WhatsNextDialog";
import { CrewDemo } from "./CrewDemo";

/* /crew: every crew member in every move, to review the art without hunting for the screen it lives on */
function Tile({title, children}: {title: string, children: React.ReactNode}) {
    return (
        <Stack alignItems="center" justifyContent="flex-end" gap={1}
            sx={{p: 2, border: 1, borderColor: "divider", borderRadius: 2, minWidth: 140, minHeight: 150}}>
            {children}
            <Typography variant="caption" color="text.secondary">{title}</Typography>
        </Stack>
    );
}

/* Drive the rabbit by hand: tap a chamber to send it there, or pick up a piece of work */
function RabbitControls() {
    const [at, setAt] = React.useState("HOME");
    const [carrying, setCarrying] = React.useState(false);
    const label = burrowDemoGraph.nodes.find(n => n.id === at)?.label;
    return (
        <Stack alignItems="center" gap={1} sx={{p: 2, border: 1, borderColor: "divider", borderRadius: 2}}>
            <RabbitBurrow size={240} graph={burrowDemoGraph} at={at} carrying={carrying} onPick={setAt}/>
            <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="center">
                <Button size="small" variant="outlined" onClick={() => setAt("HOME")} disabled={at === "HOME"}>All the way home</Button>
                <Button size="small" variant={carrying ? "contained" : "outlined"} onClick={() => setCarrying(c => !c)}>
                    {carrying ? "Set the work down" : "Pick up a piece of work"}
                </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
                Tap a chamber to send the rabbit there. Now: {at === "HOME" ? "at the surface by HOME" : label}{carrying ? ", carrying work" : ""}
            </Typography>
        </Stack>
    );
}

/* Yanchi with a face picker: every face is one of Jon's 2015 LDAED GIFs, played at his own timing */
function YanchiControls() {
    const [face, setFace] = React.useState<YanchiFace>("relaxing");
    return (
        <Stack alignItems="center" gap={1.5} sx={{p: 2, border: 1, borderColor: "divider", borderRadius: 2}}>
            <Yanchi size={200} face={face}/>
            <Stack direction="row" gap={0.75} flexWrap="wrap" justifyContent="center" sx={{maxWidth: 520}}>
                {yanchiFaces.map(f => (
                    <Chip key={f} label={f} size="small" color={f === face ? "primary" : "default"}
                        variant={f === face ? "filled" : "outlined"} onClick={() => setFace(f)}/>
                ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">Pick a face. He changes with a pixel dissolve, like an old LED sign.</Typography>
        </Stack>
    );
}

export function CrewPreview() {
    const navigate = useNavigate();
    return (
        <Box sx={{p: 2, maxWidth: 900, mx: "auto"}}>
            <Stack direction="row" alignItems="center" gap={1}>
                <IconButton edge="start" aria-label="Back to your maps" title="Back to your maps" onClick={() => navigate("/")}><ArrowBack/></IconButton>
                <Typography variant="h5">The robot crew</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                Each one fidgets on its own clock. With reduced motion on, they all hold still.
            </Typography>
            <Typography variant="h6" gutterBottom>A typical stretch of your day</Typography>
            <Box sx={{mb: 3}}><CrewDemo/></Box>
            <Typography variant="h6" gutterBottom>Every illustration</Typography>
            <Stack direction="row" flexWrap="wrap" gap={2}>
                <Tile title="You, tied off"><Jon size={110} doing="tied"/></Tile>
                <Tile title="You, aloft, 1 step out"><Jon size={110} doing="aloft" stringOut={1} spider="wrist"/></Tile>
                <Tile title="You, aloft, 4 steps out"><Jon size={110} doing="aloft" stringOut={4} spider="wrist"/></Tile>
                <Tile title="Spider climbing your string"><Jon size={110} doing="aloft" stringOut={3} spider="climb"/></Tile>
                <Tile title="Spider tugging your string"><Jon size={110} doing="aloft" stringOut={3} spider="tug"/></Tile>
                <Tile title="Spider asking: Gusty up there?"><Jon size={110} doing="aloft" stringOut={3} spider="ask"/></Tile>
                <Tile title="You, Mindful"><MindfulScene size={110}/></Tile>
                <Tile title="You strip, tied off"><YouScene size={56} aloft={false}/></Tile>
                <Tile title="You strip, aloft"><YouScene size={56} aloft={true} stringOut={2}/></Tile>
                <Tile title="Dog"><Dog size={72}/></Tile>
                <Tile title="Dog trailing you"><Dog size={72} doing="trail"/></Tile>
                <Tile title="Dog settling at your feet"><Dog size={72} doing="settle"/></Tile>
                <Tile title="Dog curled up"><Dog size={72} doing="curled"/></Tile>
                <Tile title="Flying squirrel"><Squirrel size={72}/></Tile>
                <Tile title="Squirrel gliding to chart"><Squirrel size={72} doing="glide"/></Tile>
                <Tile title="Squirrel curled up"><Squirrel size={72} doing="curled"/></Tile>
                <Tile title="Spider"><Spider size={72}/></Tile>
                <Tile title="Spider curled up"><Spider size={72} doing="curled"/></Tile>
                <Tile title="Sloth at HOME"><Sloth size={72}/></Tile>
                <Tile title="Mindful"><CrewAtRest size={72}/></Tile>
                <Tile title="Small, as in the app">
                    <Stack direction="row" gap={1} alignItems="flex-end">
                        <Spider size={18}/><Squirrel size={20}/><Dog size={24}/>
                    </Stack>
                </Tile>
            </Stack>
            <Typography variant="h6" sx={{mt: 3}}>The rabbit, for the rabbit-hole map</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                The burrow is the map: HOME is the surface, each place a chamber under its parent. The string is tied at HOME and follows the rabbit down and back up, along the breadcrumbs.
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-start">
                <RabbitControls/>
                <Tile title="Resting at the surface"><RabbitBurrow size={110} graph={burrowDemoGraph} labels={false}/></Tile>
                <Tile title="Four holes down"><RabbitBurrow size={110} graph={burrowDemoGraph} at="bikes" labels={false}/></Tile>
                <Tile title="Carrying a piece of work"><RabbitBurrow size={110} graph={burrowDemoGraph} at="wrench" carrying labels={false}/></Tile>
                <Tile title="On a loop, as on the page"><RabbitBurrowLoop size={110}/></Tile>
                <Tile title="Small, as in the table"><RabbitBurrowLoop size={32}/></Tile>
            </Stack>
            <Typography variant="h6" sx={{mt: 3}}>Yanchi, the radio robot</Typography>
            <Typography variant="body2" color="text.secondary" sx={{mb: 2, maxWidth: 640}}>
                The newest crew member wears Jon's own LDAED pixel faces from 2015, drawn as round LED dots.
                He's named after John von Neumann, whose family called him Jancsi. For now he lives here only.
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-start">
                <YanchiControls/>
                <Tile title="Small, as in a top bar"><Yanchi size={48} face="nerdy"/></Tile>
            </Stack>
            <Typography variant="h6" sx={{mt: 3}}>The stage, as the day demo draws it</Typography>
            <Stack gap={1} sx={{maxWidth: 360}}>
                {([
                    ["Tied off", false, 0, false],
                    ["Aloft, 1 step out", true, 1, false],
                    ["Aloft, 3 steps out, head in the clouds", true, 3, true],
                    ["Aloft, 5 steps out, head in the clouds", true, 5, true]
                ] as const).map(([title, aloft, out, clouds]) => (
                    <Box key={title} sx={{borderBottom: 1, borderColor: "divider", pb: 1}}>
                        <YouStage height={96} aloft={aloft} stringOut={out} inClouds={clouds}/>
                        <Typography variant="caption" color="text.secondary">{title}</Typography>
                    </Box>
                ))}
            </Stack>
            <Typography variant="h6" sx={{mt: 3}}>The Mindful screen in What's next</Typography>
            <Mindful/>
        </Box>
    );
}
