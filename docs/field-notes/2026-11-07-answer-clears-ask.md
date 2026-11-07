---
date: 2026-11-07
repo: jonashw/adhd-assistant
kind: preference
area: ui-ux
---

Situation: Jon answers a Go-ahead or Needs you item from What's next / Your move, but the item stays until the answered thread's end-of-turn sync.

Jon said: "sometimes when I react to a Go-Ahead or Needs You item in What's Next, I don't immediately see that my involvement has satisfied the requirement. Perhaps we should instruct agents to update ADHD Assist when they get my go ahead and start working?"

Observed: asks already clear once any sync shows the thread working, but the woken thread synced only at turn end; report_state flares on the map needed the thread to call report_state "working".

Inferred (my reading): Jon needs immediate confirmation that an answer landed; an ask that lingers after he acted reads as "you still owe this", which is the kind of nagging the app is meant to remove.
