# Working in this repo

## ADHD Assist Claude map

This repo is ADHD Assist, and Claude sessions that work on it keep Jon's Claude map up to date.

If you are in a Claude project where you can list the project's threads (a `list_threads` tool) and the
ADHD Assist connector is connected (a `sync_project` tool): whenever you call `check_in` or `report_state`,
and at the end of every turn as the project's coordinator, call `sync_project` with this project's id and
name and every one of its threads as `list_threads` gives them (id, title, state, created and last-activity
times). Send the whole list each time, not just your own thread.

If either tool is missing (for example in Claude Code on a laptop, or before the connector is connected),
skip this; don't ask Jon about it.
