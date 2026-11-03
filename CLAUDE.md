# Working in this repo

## ADHD Assist Claude map

This repo is ADHD Assist, and Claude sessions that work on it keep Jon's Claude map up to date.

If you are a thread in a Claude project, you can list the project's threads (a `list_threads` tool), and the
ADHD Assist connector is connected (a `sync_project` tool): call `sync_project` when you start work, whenever
you call `check_in` or `report_state`, and once more as the last step of every turn. Pass this project's id
and name and every one of its threads as `list_threads` gives them (id, title, state, created and
last-activity times). If you can list the project's artifacts (a `list_project_artifacts` tool), pass those
too (id, title, link, last update). Send the whole list each time, not just your own thread.

If either tool is missing (a project coordinator, Claude Code on a laptop, or before the connector is
connected), skip this; don't ask Jon about it or tell him it was skipped.
