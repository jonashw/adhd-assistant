---
date: 2026-11-08
repo: jonashw/adhd-assistant
kind: correction
area: ui-ux
---
Situation: the domain-move thread left six to-dos for Jon. Only the last had a waits_on link, so "At Name.com, change jonashw.dev's nameservers" topped Start here on Your move while the whole chain was still waiting on a Netlify support ticket.

Jon said: "I'm annoyed that this item at the top of my to-do list is blocked by Netlify support. I thought I had made that clear already, but there appears to be a to-do item that is deferred. Instead, help me understand why this item hasn't been pushed to the periphery, awaiting a third party."

Observed: to-dos could only wait on other to-dos; nothing expressed a third-party wait, and a thread couldn't change waits_on after adding an item.

Inferred (my reading): anything blocked by someone outside Jon's list belongs in Opens up later, never in Start here, and once Jon has said "we wait" a thread should model that wait rather than leave it to the ordering. Fix: to-dos get waiting_for + check_back_on, and re-sending a to-do updates its waits.
