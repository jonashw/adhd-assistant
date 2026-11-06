# Drawing the crew in Inkscape

**Status:** the balloon and the face are live. Every balloon in the app is drawn from `you/balloon.svg` and wears `you/face.svg`. `you/body.svg` is a starter and isn't wired in yet: the body now has more poses than it lists (untying, tying off, picking up, setting down, walking), so it comes next. The other crew members are still drawn in code.

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
2. **Layers are states.** A layer (`inkscape:groupmode="layer"`) whose ID starts with `face-` or `pose-` is one state. The app shows one at a time, so hide the others when you save if you like; the app doesn't care which are visible. Today the face uses `face-calm` most of the time and `face-blink` for the moment of a blink.
3. **Anchors are marks, not art.** The hidden `anchors` layer holds small shapes whose IDs start with `anchor-`. The app reads their position and size and never draws them:
   - `anchor-face` (in the balloon) is the box the face is fitted into, centre to centre.
   - `anchor-string` (in the balloon) is where the string ties on.
   - `anchor-head-tied` and `anchor-hand-string` (in the body) are where the head floats when tied off, and the hand that holds the string aloft.
   - `anchor-belt-knot` (in the body) is the knot at your belt.

   Reshape the balloon and move its anchors with it, and the string and face follow. Keep anchors free of transforms (no rotate or scale on them or on their layer); if Inkscape adds one, *Object › Transform* with "Apply to each object" or Preferences › Behavior › Transforms › *Store transformation: Optimized* clears it. The build tells you if one slips in.
4. **Named parts can move.** The app animates a few parts by ID: `eyes` (blinks), `mouth`, `knot`, `arm-string`. Keep those IDs on the matching group if you want the motion; the motion itself stays in code, so you don't key-frame it.
5. **What the app can't take** (the checker refuses it): bitmaps (`<image>`), live text (use *Path › Object to Path*), filters such as blur or drop shadow, scripts, and links to outside files. Keep each file under 60 KB.
6. **Colours** are yours. If we later want themes (dark mode), the build will swap colours that match the palette in `crew.css` for theme variables, so reusing those colours keeps that door open. It isn't required.

## The workflow

1. **You draw.** Open a file from `art/` in Inkscape, restyle it, and save.
2. **You check.** Run `npm run art:check`. It names any rule a file breaks and the Inkscape menu that fixes it.
3. **You hand it over.** Commit the file on a branch, or drop it in the project's files and ask me. I open a PR with your file and screenshots of every scene it touches, taken from `/crew`.
4. **The app picks it up.** `npm run art` (and every build) checks the files, then writes `src/crew/art.generated.ts`, which the crew components draw from. Your drawing replaces the code-drawn one, and the code keeps only the motion: where the head floats, the sway, the blink. Until a file exists for a crew member, the code-drawn version stays. To see your change right away, run `npm run art` with `npm run dev` open, then look at `/crew`.

## Open questions

- **Expressions:** `face.svg` has `face-calm` and `face-blink` to start. Which others do you want? Candidates are worried (in the clouds), focused (tied off), and sleepy (Mindful).
- **Animation:** should anything move that isn't a named part, such as a frame-by-frame mouth? If so, frames become layers (`face-talk-1`, `face-talk-2`…) and the code steps through them.
