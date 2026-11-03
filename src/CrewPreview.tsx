import React from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, ButtonGroup, IconButton, Stack, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { CrewAtRest, Dog, Jon, MindfulScene, RabbitBurrow, RabbitBurrowLoop, Sloth, Spider, Squirrel, YouScene } from "./Crew";
import { burrowDepths } from "./crew/Rabbit";
import { Mindful } from "./WhatsNextDialog";

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

/* Drive the rabbit by hand: down a hole, back up one, or pick up a piece of work */
function RabbitControls() {
    const [depth, setDepth] = React.useState(0);
    const [carrying, setCarrying] = React.useState(false);
    return (
        <Stack alignItems="center" gap={1} sx={{p: 2, border: 1, borderColor: "divider", borderRadius: 2}}>
            <RabbitBurrow size={200} depth={depth} carrying={carrying}/>
            <ButtonGroup size="small">
                <Button onClick={() => setDepth(d => Math.max(0, d - 1))} disabled={depth === 0}>Up a hole</Button>
                <Button onClick={() => setDepth(d => Math.min(burrowDepths, d + 1))} disabled={depth === burrowDepths}>Down a hole</Button>
                <Button onClick={() => setDepth(0)} disabled={depth === 0}>All the way home</Button>
            </ButtonGroup>
            <Button size="small" variant={carrying ? "contained" : "outlined"} onClick={() => setCarrying(c => !c)}>
                {carrying ? "Set the work down" : "Pick up a piece of work"}
            </Button>
            <Typography variant="caption" color="text.secondary">
                {depth === 0 ? "At the surface by HOME" : `${depth} hole${depth === 1 ? "" : "s"} down`}{carrying ? ", carrying work" : ", resting"}
            </Typography>
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
                Its string is tied at HOME and follows it down every hole and back up again.
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-start">
                <RabbitControls/>
                <Tile title="Resting at the surface"><RabbitBurrow size={110} depth={0}/></Tile>
                <Tile title="Three holes down"><RabbitBurrow size={110} depth={3}/></Tile>
                <Tile title="Carrying a piece of work"><RabbitBurrow size={110} depth={2} carrying/></Tile>
                <Tile title="On a loop, as on the page"><RabbitBurrowLoop size={110}/></Tile>
                <Tile title="Small, as in the table"><RabbitBurrowLoop size={32}/></Tile>
            </Stack>
            <Typography variant="h6" sx={{mt: 3}}>The Mindful screen in What's next</Typography>
            <Mindful/>
        </Box>
    );
}
