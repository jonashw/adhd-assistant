# Working in this repo

## ADHD Assist Claude map

This repo is ADHD Assist, and Claude sessions that work on it keep Jon's Claude map up to date.

If you are a thread in a Claude project, you can list the project's threads (a `list_threads` tool), and the
ADHD Assist connector is connected (a `sync_project` tool): call `sync_project` when you start work, first thing
in any turn where Jon answers you (a reply, go-ahead, decision or review), whenever you call `check_in` or
`report_state`, and once more as the last step of every turn. Pass this project's id
and its current name (Jon renames projects, so take it from your newest message) and every one of its threads as a fresh `list_threads` call gives them (id, title, state, created and
last-activity times, and its session id). Send the whole list, not just your own thread, unless the connector's instructions say
it may be left out; and send your own glance card (`this_thread`, with every artifact you made or updated), the project's PRs and its
artifacts as those instructions say. In the last sync of
a turn, set `this_thread.state` to the state you leave your thread in (done when you resolve it), because the
platform's list still shows you as working until the turn ends.

When Jon answers you, do that first sync before the work itself, with your card's ask left off (and `report_state`
"working" if you had reported "waiting"). It is what clears his Needs you or Go-ahead item; until it lands, the
item still reads as waiting on him and he can't tell his answer landed.

The connector's rules are versioned: if a tool reply carries `protocol_update`, follow it over your instructions.
To change a rule for every thread, add it to `protocolChanges` in `worker/src/protocol.ts` and update the instructions
in `worker/src/mcp.ts` to match; don't ask Jon to paste anything.

If either tool is missing (a project coordinator, Claude Code on a laptop, or before the connector is
connected), skip this; don't ask Jon about it or tell him it was skipped.
