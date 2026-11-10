---
date: 2026-11-10
repo: jonashw/adhd-assistant
kind: preference
area: architecture
---
Situation: Before merging Art Practice, House Party and House and Home into the ADHD Support project, Jon asked for an impact analysis.

Jon said: "be sure to touch on the merging of project settings, particularly environment variables and secrets, which have been authored in isolation under assumptions that they would stay isolated."

He added: "Perhaps you're able to send queries to other project threads directly through one of the other discoveries we made in this project."

Observed: The projects use four cloud environments. Three each add a Cloudflare token for the same host, and today's tokens already reach across projects in one Cloudflare account. Art keeps its Modal secret as a plain variable. A House Party thread and Art's project chat, asked through scheduled tasks, both answered within about a minute.

Inferred (my reading): Jon treats each secret's original reach as a design assumption the merge must keep or change on purpose, not as an implementation detail. He wants the cross-project tools to do the legwork before he is asked to dig through settings.
