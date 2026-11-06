import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { Pause, PlayArrow, SkipNext, SkipPrevious } from "@mui/icons-material";
import { MindfulScene, YouStage } from "./Crew";

/* A typical stretch of a day with the app, played as a loop. Each step is either a state you can be in
   (captioned with its name and the values you'd see) or a move between states (captioned "…ing…", since more
   is coming). A beat before each step ends, the next one is called out, so a change never arrives unannounced. */
type StageProps = Omit<React.ComponentProps<typeof YouStage>, "height">;
type Scene = {kind: "mindful"} | ({kind: "stage"} & StageProps);

type Step = {
    scene: Scene,
    /* a state's name, or a move in the present progressive with an ellipsis */
    title: string,
    /* the values you'd read in the app, for a state */
    detail?: string,
    /* a move between states: animated, captioned in italics */
    move?: boolean,
    ms: number
};

const at = "Fix back gate";
const stage = (props: StageProps): Scene => ({kind: "stage", ...props});
const reel = (out: number): Step => ({
    scene: stage({aloft: true, stringOut: out, motion: "reel"}), title: "Reeling in…", move: true, ms: 900
});

const steps: Step[] = [
    {scene: {kind: "mindful"}, title: "Mindful", detail: "At HOME, nothing set down (tap them)", ms: 4500},
    {scene: stage({aloft: false, doing: "walk", crew: "walk", walking: "to"}), title: `Walking to ${at}…`, move: true, ms: 2800},
    {scene: stage({aloft: false, doing: "pickup"}), title: "Picking up your work…", move: true, ms: 1800},
    {scene: stage({aloft: false}), title: "Tied off", detail: `Tied off at ${at} · both hands on the work`, ms: 4000},
    {scene: stage({aloft: false, doing: "setdown"}), title: "Setting your work down…", move: true, ms: 1800},
    {scene: stage({aloft: false, doing: "untying"}), title: "Untying…", move: true, ms: 2200},
    {scene: stage({aloft: true, stringOut: 1}), title: "Aloft", detail: `Aloft 2 min · string out 1 · set down: ${at}`, ms: 4000},
    {scene: stage({aloft: true, stringOut: 2, motion: "float"}), title: "Floating higher…", move: true, ms: 1300},
    {scene: stage({aloft: true, stringOut: 3, motion: "float"}), title: "Floating higher…", move: true, ms: 1300},
    {scene: stage({aloft: true, stringOut: 3, motion: "scout"}), title: "Scouting…", detail: `Aloft 20 min · string out 3 · set down: ${at}`, ms: 6400},
    {scene: stage({aloft: true, stringOut: 5, motion: "drift", inClouds: true, cloud: "rolling"}), title: "Drifting into the clouds…", move: true, ms: 2600},
    {scene: stage({aloft: true, stringOut: 5, inClouds: true}), title: "Head in the clouds", detail: `Aloft 50 min · string out 5 · set down: ${at}`, ms: 4000},
    {scene: stage({aloft: true, stringOut: 5, inClouds: true, spider: "climb"}), title: "The spider is climbing your string…", move: true, ms: 4200},
    {scene: stage({aloft: true, stringOut: 5, inClouds: true, spider: "tug", crew: "tug"}), title: "The crew is tugging…", detail: `Set down at your feet: ${at}`, move: true, ms: 4800},
    reel(4), reel(3), reel(2), reel(1),
    {scene: stage({aloft: false, doing: "tying"}), title: "Tying off…", move: true, ms: 2400},
    {scene: stage({aloft: false, doing: "pickup"}), title: "Picking up your work…", move: true, ms: 1800},
    {scene: stage({aloft: false}), title: "Tied off", detail: `Tied off at ${at} · back to work`, ms: 4000},
    {scene: stage({aloft: false, doing: "setdown"}), title: "Setting your work down…", move: true, ms: 1800},
    {scene: stage({aloft: false, doing: "standing", crew: "rouse"}), title: "The crew is getting up…", move: true, ms: 1800},
    {scene: stage({aloft: false, doing: "standing", crew: "rouse", facing: "left"}), title: "Turning for home…", move: true, ms: 1200},
    {scene: stage({aloft: false, doing: "walk", crew: "walk", facing: "left", walking: "home"}), title: "Walking home…", move: true, ms: 3000}
];

/* how long before a step ends that the next one is called out */
const cueMs = 1200;

/* the caption for the step after this one: consecutive moves of one kind read as one */
function nextTitle(i: number) {
    let j = (i + 1) % steps.length;
    while (steps[j].title === steps[i].title && j !== i) {
        j = (j + 1) % steps.length;
    }
    return steps[j].title;
}

function stageProps({kind, ...props}: Scene & {kind: "stage"}): StageProps {
    void kind;
    return props;
}

export function CrewDemo() {
    const [index, setIndex] = React.useState(0);
    const [playing, setPlaying] = React.useState(true);
    const [cue, setCue] = React.useState(false);
    const step = steps[index];
    const continuesSame = steps[(index + 1) % steps.length].title === step.title;

    React.useEffect(() => {
        setCue(false);
        if (!playing) {
            return;
        }
        const cueAt = setTimeout(() => setCue(true), Math.max(0, step.ms - cueMs));
        const next = setTimeout(() => setIndex(i => (i + 1) % steps.length), step.ms);
        return () => {
            clearTimeout(cueAt);
            clearTimeout(next);
        };
    }, [index, playing, step.ms]);

    const go = (delta: number) => {
        setPlaying(false);
        setIndex(i => (i + delta + steps.length) % steps.length);
    };

    return (
        <Box sx={{border: 1, borderColor: "divider", borderRadius: 2, p: 2, maxWidth: 520}} data-testid="crew-demo">
            <Box sx={{height: 130, display: "flex", alignItems: "flex-end", justifyContent: "center"}}>
                {step.scene.kind === "mindful"
                    ? <MindfulScene size={110}/>
                    : <YouStage height={120} {...stageProps(step.scene)}/>}
            </Box>
            <Box sx={{mt: 1.5, minHeight: 64, textAlign: "center"}} aria-live="polite">
                <Typography variant="h6" sx={{fontStyle: step.move ? "italic" : undefined}} data-testid="crew-demo-title">
                    {step.title}
                </Typography>
                {step.detail && <Typography variant="body2" color="text.secondary">{step.detail}</Typography>}
            </Box>
            {/* the heads-up: shown a beat before the change, never for a move that simply carries on */}
            <Typography
                variant="caption"
                component="div"
                sx={{
                    textAlign: "center", color: "primary.main", fontWeight: 700, height: 20,
                    opacity: cue && !continuesSame ? 1 : 0, transition: "opacity 300ms"
                }}
                data-testid="crew-demo-cue"
            >
                Next: {nextTitle(index)}
            </Typography>
            <Stack direction="row" alignItems="center" justifyContent="center" gap={1} sx={{mt: 1}}>
                <IconButton aria-label="Previous step" onClick={() => go(-1)}><SkipPrevious/></IconButton>
                <IconButton aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(p => !p)}>
                    {playing ? <Pause/> : <PlayArrow/>}
                </IconButton>
                <IconButton aria-label="Next step" onClick={() => go(1)}><SkipNext/></IconButton>
            </Stack>
            <Stack direction="row" justifyContent="center" gap={0.5} sx={{mt: 0.5}}>
                {steps.map((s, i) => (
                    <Box key={i} sx={{
                        width: s.move ? 6 : 10, height: 6, borderRadius: 3,
                        bgcolor: i === index ? "primary.main" : "divider"
                    }}/>
                ))}
            </Stack>
        </Box>
    );
}
