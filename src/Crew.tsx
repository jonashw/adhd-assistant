/* The robot crew. Each crew member is its own component in src/crew, drawn as SVG in code and moved with CSS,
   so any one of them can be swapped for a Rive or Lottie file later without touching the screens that use them. */
import { Dog, DogDoing } from "./crew/Dog";
import { Spider, SpiderDoing } from "./crew/Spider";
import { Squirrel, SquirrelDoing } from "./crew/Squirrel";
import { Sloth } from "./crew/Sloth";

export { Dog, Spider, Squirrel, Sloth };
export type { DogDoing, SpiderDoing, SquirrelDoing };

type Who = "dog" | "spider" | "squirrel" | "sloth";

/* One crew member by name, at a given height in px */
export function CrewIcon({who, size = 24}: {who: Who, size?: number}) {
    switch (who) {
        case "dog": return <Dog size={size}/>;
        case "spider": return <Spider size={size}/>;
        case "squirrel": return <Squirrel size={size}/>;
        case "sloth": return <Sloth size={size}/>;
    }
}

/* Mindful: the dog curled up, the squirrel curled on the dog, the spider curled on the squirrel */
export function CrewAtRest({size = 48}: {size?: number}) {
    const u = size / 48;
    return (
        <span style={{position: "relative", display: "inline-block", width: 64 * u, height: 48 * u}} data-testid="crew-at-rest">
            <span style={{position: "absolute", left: 0, top: 0}}><Dog size={size} doing="curled"/></span>
            <span style={{position: "absolute", left: 13 * u, top: -2 * u}}><Squirrel size={34 * u} doing="curled"/></span>
            <span style={{position: "absolute", left: 22 * u, top: 0.5 * u}}><Spider size={16 * u} doing="curled"/></span>
        </span>
    );
}
