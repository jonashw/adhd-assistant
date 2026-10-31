import { Box, Stack, Typography } from "@mui/material";
import { CrewAtRest, Dog, Jon, MindfulScene, Sloth, Spider, Squirrel, YouScene } from "./Crew";
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

export function CrewPreview() {
    return (
        <Box sx={{p: 2, maxWidth: 900, mx: "auto"}}>
            <Typography variant="h5" gutterBottom>The robot crew</Typography>
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
            <Typography variant="h6" sx={{mt: 3}}>The Mindful screen in What's next</Typography>
            <Mindful/>
        </Box>
    );
}
