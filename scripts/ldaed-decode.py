"""Reads Jon's LDAED face GIFs in art/ldaed/ and writes src/crew/ldaed.generated.ts.

Each GIF is a 24 x 16 LED grid scaled up (420 x 280 px, 17.5 px per LED). We sample the centre of every cell
in every frame and keep Jon's own frame timings. Run it after adding or editing a GIF:

    python3 scripts/ldaed-decode.py

It needs Pillow (pip install pillow). It isn't part of npm run build, because the faces change rarely.
"""
import json
import os
from PIL import Image, ImageSequence

COLS, ROWS = 24, 16
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "..", "art", "ldaed")
out = os.path.join(here, "..", "src", "crew", "ldaed.generated.ts")

faces = {}
for name in sorted(os.listdir(src)):
    if not name.lower().endswith(".gif"):
        continue
    im = Image.open(os.path.join(src, name))
    frames = []
    for frame in ImageSequence.Iterator(im):
        rgb = frame.convert("RGB")
        w, h = rgb.size
        cw, ch = w / COLS, h / ROWS
        rows = []
        for r in range(ROWS):
            bits = 0
            for c in range(COLS):
                px = rgb.getpixel((int(c * cw + cw / 2), int(r * ch + ch / 2)))
                # lit LEDs are the dark (blue) ones on the white sheet
                if px[0] < 128:
                    bits |= 1 << (COLS - 1 - c)
            rows.append("%06x" % bits)
        frames.append({"rows": rows, "ms": frame.info.get("duration") or 0})
    faces[name[:-4]] = frames

lines = [
    "/* Made by scripts/ldaed-decode.py from Jon's GIFs in art/ldaed/. Don't edit: change the GIF and run the script. */",
    "/* Each frame is 16 rows of a 24-LED grid, as 6 hex digits per row (leftmost LED = highest bit), and how long it shows. */",
    "export type LdaedFrame = {rows: string[], ms: number};",
    "export const ldaedFaces: Record<string, LdaedFrame[]> = " + json.dumps(faces, indent=1) + ";",
    "",
]
with open(out, "w") as f:
    f.write("\n".join(lines))
print("wrote", len(faces), "faces to", os.path.relpath(out))
