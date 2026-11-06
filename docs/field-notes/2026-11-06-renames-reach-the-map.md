---
date: 2026-11-06
repo: jonashw/adhd-assistant
kind: preference
area: architecture
---
Situation: Jon renamed the Multitask project to "ADHD Support (App)" and renamed a thread; the Claude map kept showing "Multitask".
Jon said: "rename events are not presently captured by the app. I renamed the Multitask project to "ADHD Support (App)". I also renamed a thread... I expect these to make it to the ADHD app"
Then: "I'd like an event log tab in the main UI. It would show a sequence of events that occurred in Claude, most recent at the top." and "...it could also be a debugging tool"
Observed: the project name had landed; the label stayed because short_name stuck forever and the project instructions still give "Multitask". Thread titles were guarded by a time the self-reported state had pushed ahead of the platform's.
Inferred (my reading): Jon expects the map to mirror Claude faithfully, including edits he makes in Claude itself, and wants to see what the sync saw so he can tell when it falls behind.
