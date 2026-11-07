# Yanchi's faces: LDAED

These GIFs are Jon's **Low-Density Auto-Emotive Display** faces, drawn in March 2015: expressions on a 24 by 16 LED grid. The originals live in Jon's Google Drive folder with an index sheet, `Low-Density-Auto-Emotive-Display.png`. Seventeen of the 22 are here. Not copied yet: `goofy-alt.gif` and `goofy-alt-2.gif`, plus `KILL.gif`, `sadistic.gif` and `pissed.gif`, which are kept out of a calm app.

Yanchi, the radio robot (`src/crew/Yanchi.tsx`), wears them. Each face plays every frame of its GIF at Jon's own timing, drawn as round LED dots.

## Influences

What Jon gave as the idea and its influences, in his words where he wrote them:

- **The faces' original purpose.** "These faces were meant for the sort of primitive futurism robot that might use the quaint voice synthesis that Stephen Hawking used and that I used in my soundboard app. Maybe we could conjure another helpful robot character within the app to use these faces."
- **Robots with a screen for a face.** GERTY from the film *Moon*, and Jailbot from *Superjail!*.
- **The LED style.** "I really like your led variation for the balloon and would like to explore that pixel style with my designs." That is the "LED head" balloon in the face workshop, which was itself a nod to deadmau5's LED helmet, one of Jon's references for the balloon face.
- **The name.** "I'd like to name the robot after John von Neumann, perhaps with a diminutive nickname." Von Neumann's family called him Jancsi, the Hungarian pet form of János. Jon chose to spell it the way it sounds: **Yanchi**. Von Neumann's self-reproducing automaton was a grid of cells, each switching between states, much like this display.

## The proposal

The full proposal, with the face for each app state and the voice question, is in the artifact "Yanchi, the Radio Robot" (https://claude.ai/artifact/RvCsf48jXuubrArtP2g7c2). In short, Yanchi would be the crew's radio operator: his face says whether anything on the Claude side needs you. For now, at Jon's request, he lives only on the Meet the crew page (`/crew`).

## Changing a face

Edit or add a GIF here (any pixel editor; keep the 24 by 16 grid, lit LEDs dark on a light background), then run:

```
python3 scripts/ldaed-decode.py
```

It rewrites `src/crew/ldaed.generated.ts`. It needs Pillow, and it isn't part of `npm run build`, because the faces change rarely.
