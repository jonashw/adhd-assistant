import { Box, Stack, Typography } from "@mui/material";
import { CrewAtRest, Dog, Sloth, Spider, Squirrel } from "./Crew";
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
                <Tile title="Dog"><Dog size={72}/></Tile>
                <Tile title="Dog trailing you"><Dog size={72} doing="trail"/></Tile>
                <Tile title="Dog settling at your feet"><Dog size={72} doing="settle"/></Tile>
                <Tile title="Dog curled up"><Dog size={72} doing="curled"/></Tile>
                <Tile title="Flying squirrel"><Squirrel size={72}/></Tile>
                <Tile title="Squirrel gliding to chart"><Squirrel size={72} doing="glide"/></Tile>
                <Tile title="Squirrel curled up"><Squirrel size={72} doing="curled"/></Tile>
                <Tile title="Spider"><Spider size={72}/></Tile>
                <Tile title="Spider tugging"><Spider size={72} doing="tug"/></Tile>
                <Tile title="Spider asking"><Spider size={72} doing="ask"/></Tile>
                <Tile title="Spider climbing"><Spider size={72} doing="climb"/></Tile>
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
