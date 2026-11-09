---
date: 2026-11-09
repo: jonashw/adhd-assistant
kind: preference
area: ui-ux
---

Situation: Your move showed 8 Ready items under the 3 Start here items; Jon asked for a work mode and a domain filter.

Jon said: "isn't it counter to "the fewer options presented to our ADHD user, the better" to show 8 "Ready" items when we'd actually prefer the user to focus on the "Start here" items?  Could we limit that to 3, or 6 instead."

Jon said: "when I filter to a project, I would see 'START HERE' and 'READY' items."

Observed: Ready cut to 3 (same size as Start here); a focus on a domain or project recomputes Start here and Ready from that slice with the same Leverage model; the work mode only re-weights, never hides.

Inferred (my reading): "fewer options" applies to every visible list, not only Start here; filters should narrow the input to the model, not change the model.
