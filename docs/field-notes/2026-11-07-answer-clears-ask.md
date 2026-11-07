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

Follow-up, Jon said: "Is there a way we could avoid this moment again, when we have to have deliver no instructions to all projects about how to interact with ADHD Assist mCP? Surely we can build this protocol definition*inside* our model context protocol?!??!?"
Inferred (my reading): rules for threads belong in the connector, never in per-project pastes; running threads must pick up rule changes without a restart.

Follow-up, Jon said: "Please consider the ongoing"needs you" badge despite putting a pin in the thread and waiting for*it* to revisit the topic"
Inferred (my reading): a deferral is an answer too; once Jon defers, the item must leave his list until its day.
