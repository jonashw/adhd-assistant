# Drawing the crew in Inkscape

**Status: a proposal for Jon to react to.** The files here are starters, traced from the art the app draws today. Nothing in the app reads them yet. Once we agree on the format, step 2 below wires them in.

## The idea: one asset, one file, used everywhere

Each thing you'd want to restyle once and see everywhere gets its own Inkscape file:

| File | What it is | Used in |
|---|---|---|
| `you/face.svg` | your face, one layer per expression | every balloon, at every size, in every scene |
| `you/balloon.svg` | the balloon your face sits on | the stage, the demo, the tug, the weather check, Mindful |
| `you/body.svg` | your body, one layer per pose (tied, aloft, mindful) | the same places |

The app builds each scene by putting these together, the way an Inkscape clone (`<use>`) works within one file. So the face is drawn once, and every balloon in the app is a clone of it. Edit `face.svg` and every balloon changes. Later, the dog, squirrel, spider and sloth get files of their own, made the same way.

## The format

Every file is a plain Inkscape SVG (save as *Inkscape SVG*; *Optimized SVG* is fine too). The app finds things by **ID**, which you set in *Object › Object Properties*. Only these rules matter:

1. **Keep the frame.** Each file has a fixed `viewBox` (*Document Properties › Viewbox*), listed in `manifest.json`. The app places the art by that frame, so changing it moves your drawing in the app. Draw anything you like *inside* it.
2. **Layers are states.** A layer (`inkscape:groupmode="layer"`) whose ID starts with `face-` or `pose-` is one state. The app shows one at a time, so hide the others when you save if you like; the app doesn't care which are visible.
3. **Anchors are marks, not art.** The hidden `anchors` layer holds small shapes whose IDs start with `anchor-`. The app reads their position and size and never draws them:
   - `anchor-face` (in the balloon) is the box the face is fitted into, centre to centre.
   - `anchor-string` (in the balloon) is where the string ties on.
   - `anchor-head-tied` and `anchor-hand-string` (in the body) are where the head floats when tied off, and the hand that holds the string aloft.
   - `anchor-belt-knot` (in the body) is the knot at your belt.

   Reshape the balloon and move its anchors with it, and the string and face follow.
4. **Named parts can move.** The app animates a few parts by ID: `eyes` (blinks), `mouth`, `knot`, `arm-string`. Keep those IDs on the matching group if you want the motion; the motion itself stays in code, so you don't key-frame it.
5. **What the app can't take** (the checker refuses it): bitmaps (`<image>`), live text (use *Path › Object to Path*), filters such as blur or drop shadow, scripts, and links to outside files. Keep each file under 60 KB.
6. **Colours** are yours. If we later want themes (dark mode), the build will swap colours that match the palette in `crew.css` for theme variables, so reusing those colours keeps that door open. It isn't required.

## The workflow

1. **You draw.** Open a file from `art/` in Inkscape, restyle it, and save.
2. **You check.** Run `npm run art:check`. It names any rule a file breaks and the Inkscape menu that fixes it.
3. **You hand it over.** Commit the file on a branch, or drop it in the project's files and ask me. I open a PR with your file and screenshots of every scene it touches, taken from `/crew`.
4. **The app picks it up.** *(step 2, not built yet)* A build step reads `art/`, checks it the same way, and turns each file into the component the app already uses (`src/crew/Jon.tsx` and friends). Your drawing replaces the code-drawn one, and the code keeps only the motion: where the head floats, the sway, the blink. Until a file exists for a crew member, the code-drawn version stays.

## Open questions

- **Expressions:** `face.svg` has `face-calm` and `face-blink` to start. Which others do you want? Candidates are worried (in the clouds), focused (tied off), and sleepy (Mindful).
- **Animation:** should anything move that isn't a named part, such as a frame-by-frame mouth? If so, frames become layers (`face-talk-1`, `face-talk-2`…) and the code steps through them.
