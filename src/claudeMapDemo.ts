import { ClaudeArtifact, ClaudeCard, ClaudePr, ClaudeProject, ClaudeThread, ClaudeThreadState, claudeProjectUrl, claudeThreadUrl } from "./ClaudeMapTypes";

/* Sample data for /claude?demo, so the Claude map can be tried without a server. Each tick (a refresh)
   moves it along a little, the way real syncs would: states change, and now and then a thread starts. */
export function demoClaudeMap(tick = 0, now = Date.now()): ClaudeProject[] {
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
    const thread = (projectId: string, id: string, title: string, state: ClaudeThreadState, minutesAgo: number, inLatest = true): ClaudeThread => ({
        id, title, state, url: claudeThreadUrl(projectId, id),
        createdAt: at(minutesAgo + 60), lastActivityAt: at(minutesAgo), lastSeenAt: at(inLatest ? 2 : 300), inLatest
    });
    // made by the given threads; seen = minutes since the map first saw it (each project joined 5000 minutes ago)
    let artifactId = 0;
    const artifact = (title: string, threadIds: string[], updatedMinutesAgo: number, seenMinutesAgo: number, openedMinutesAgo?: number): ClaudeArtifact => ({
        id: ++artifactId, title, url: `https://claude.ai/artifact/demo-${artifactId}`, threadIds,
        updatedAt: at(updatedMinutesAgo), firstSeenAt: at(seenMinutesAgo),
        openedAt: openedMinutesAgo === undefined ? undefined : at(openedMinutesAgo)
    });
    const project = (id: string, name: string, shortName: string | undefined, syncedMinutesAgo: number, threads: ClaudeThread[], artifacts?: ClaudeArtifact[]): ClaudeProject => ({
        id, name, shortName, url: claudeProjectUrl(id), hidden: false,
        firstSeenAt: at(5000), lastSyncedAt: at(syncedMinutesAgo), threads: threads.map(t => artifacts ? {
            ...t, artifactIds: artifacts.filter(a => a.threadIds.includes(t.id)).map(a => a.id)
        } : t), artifacts
    });
    const glance = (t: ClaudeThread, card: Omit<ClaudeCard, "at">, minutesAgo: number, prs?: ClaudePr[], openedMinutesAgo?: number): ClaudeThread => ({
        ...t, card: {...card, at: at(minutesAgo)}, prs,
        openedAt: openedMinutesAgo === undefined ? undefined : at(openedMinutesAgo)
    });
    const pr = (number: number, title: string, state: ClaudePr["state"], ci?: ClaudePr["ci"]): ClaudePr => ({
        repo: "demo/garden", number, title, state, ci, url: `https://github.com/demo/garden/pull/${number}`
    });
    return [
        project("demo_garden", "Back garden makeover", "Garden", 2, [
            glance(thread("demo_garden", "demo_g1", "Price out raised beds", "blocked", 12), {
                headline: "Cedar beds come to $410 for three; composite is $640",
                ask: {kind: "decision", text: "Cedar or composite for the three raised beds?"},
                progress: {done: 3, total: 4, now: "Pick the material"},
                topic: "Raised beds for the vegetable patch: sizes and material prices",
                keywords: ["raised beds", "cedar", "vegetables"]
            }, 12),
            glance(thread("demo_garden", "demo_g2", "Plan the watering schedule", tick % 3 === 2 ? "review_ready" : "working", 1), {
                headline: tick % 3 === 2 ? "The schedule and the timer settings are ready" : "Working out drip zones for the beds",
                ask: tick % 3 === 2 ? {kind: "review", text: "Look over the zone timings before I order the timer"} : undefined,
                progress: {done: tick % 3 === 2 ? 5 : 2, total: 5, now: "Zone timings"},
                topic: "Drip irrigation zones and a timer schedule",
                keywords: ["watering", "drip", "timer"]
            }, 1),
            glance(thread("demo_garden", "demo_g3", "Draft the shed layout", "review_ready", 30), {
                headline: "Layout drawn: workbench on the north wall, bikes by the door",
                ask: {kind: "approval", text: "OK to merge the layout and order the shelving?"},
                progress: {done: 6, total: 6},
                artifact: {title: "Shed layout", url: "https://claude.ai/artifact/demo"},
                topic: "Shed interior layout with a workbench and bike storage",
                keywords: ["shed", "workbench", "robot mower dock"]
            }, 30, [pr(12, "Shed layout and shelving list", "open", "success")], 60),
            glance(thread("demo_garden", "demo_g4", "Pick hardy perennials", "done", 2000), {
                headline: "Picked eight perennials that survive zone 6 winters",
                topic: "Hardy perennials for the front border"
            }, 2000, [pr(9, "Perennial planting plan", "merged")], 1500),
            thread("demo_garden", "demo_g5", "Choose a compost bin", "blocked", 60 * 24 * 10),
            {...thread("demo_garden", "demo_g7", "Set up the drip timer", "working", 20), todos: [
                {id: "demo_todo1", text: "Turn the outdoor tap's water back on", addedAt: at(25), worth: 2, size: "minutes",
                    why: "The drip line test can't run dry", doneWhen: ["Water comes out of the tap"],
                    interest: {guess: "drawn", reason: "a quick hands-on win"}},
                {id: "demo_todo2", text: "Add the timer's Wi-Fi password in its app", link: "https://example.com/timer", addedAt: at(90),
                    worth: 2, size: "minutes", needs: ["The Wi-Fi password, on the router's sticker"], interest: {guess: "neutral"}},
                {id: "demo_todo3", text: "Watch the first drip run and check every bed gets wet", addedAt: at(20), worth: 3, size: "half_hour",
                    waitsOn: ["demo_todo1", "demo_todo2"], interest: {guess: "drawn", reason: "outside, watching it work"}},
                {id: "demo_todo4", text: "Send the HOA the shed permit form", addedAt: at(200), worth: 3, size: "half_hour",
                    delayClass: "fixed_date", dueOn: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
                    interest: {guess: "reluctant", reason: "forms"}}
            ]},
            thread("demo_garden", "demo_g6", "Measure the patio", "done", 60 * 5),
            thread("demo_garden", "demo_g7", "Find a hedge trimmer", "done", 60 * 26),
            thread("demo_garden", "demo_g8", "Test the soil pH", "done", 60 * 24 * 4)
        ], [
            artifact("Shed layout", ["demo_g3"], 30, 30),
            artifact("Shelving parts list", ["demo_g3"], 45, 4000, 60 * 20),
            artifact("Shed options compared", ["demo_g3"], 60 * 30, 4000, 60 * 24),
            artifact("Raised bed price sheet", ["demo_g1"], 14, 3000, 60),
            artifact("Perennials shortlist", ["demo_g4"], 2000, 4800, 1900),
            artifact("Front border planting plan", ["demo_g4"], 2100, 4800, 1900),
            artifact("Garden budget", [], 60 * 50, 4900, 60 * 49)
        ]),
        project("demo_trip", "Summer trip planning", "Trip", 3, [
            glance(thread("demo_trip", "demo_t1", "Compare train passes", "working", 3), {
                headline: "Three passes shortlisted; checking which cover the night train",
                progress: {done: 2, total: 5, now: "Check night train coverage"},
                topic: "Rail passes for the summer trip"
            }, 3, [{repo: "demo/trip", number: 4, title: "Fare table", state: "open", ci: "pending", url: "https://github.com/demo/trip/pull/4"}]),
            thread("demo_trip", "demo_t2", "Book the first two nights", "blocked", 40),
            // Jon put a pin in this one: it waits under Opens up later until its day
            {...glance(thread("demo_trip", "demo_t5", "Decide on travel insurance", "blocked", 30), {
                headline: "Pinned until next month, with the criteria to revisit",
                ask: {kind: "decision", text: "Decide whether to buy annual travel insurance"}
            }, 30), setAsideUntil: new Date(now + 30 * 864e5).toISOString().slice(0, 10), setAsideBy: "thread"},
            thread("demo_trip", "demo_t3", "Packing list", "failed", 90),
            thread("demo_trip", "demo_t4", "Old itinerary idea", "stopped", 400, false),
            ...extraTrips(tick).map((title, i) => thread("demo_trip", `demo_t_new${i}`, title, "working", 0))
        ], [
            artifact("Rail pass comparison", ["demo_t1"], 3, 900, 300)
        ]),
        project("demo_taxes", "Taxes", undefined, 60 * 7, [
            thread("demo_taxes", "demo_x1", "Sort receipts by category", "working", 60 * 7),
            thread("demo_taxes", "demo_x2", "Estimate quarterly payment", "done", 60 * 30)
        ]),
        // nothing waiting and nothing in weeks: Your move folds it away
        project("demo_bike", "Fix up the old bike", "Bike", 60 * 24 * 20, [
            thread("demo_bike", "demo_b1", "Find a chain that fits", "done", 60 * 24 * 21),
            thread("demo_bike", "demo_b2", "Price new brake pads", "working", 60 * 24 * 20)
        ])
    ];
}

const newTrips = ["Find a dog sitter", "Check passport dates", "Pick a day trip"];
const extraTrips = (tick: number) => newTrips.slice(0, Math.min(newTrips.length, Math.floor(tick / 2)));
