import { ClaudeCard, ClaudePr, ClaudeProject, ClaudeThread, ClaudeThreadState, claudeProjectUrl, claudeThreadUrl } from "./ClaudeMapTypes";

/* Sample data for /claude?demo, so the Claude map can be tried without a server. Each tick (a refresh)
   moves it along a little, the way real syncs would: states change, and now and then a thread starts. */
export function demoClaudeMap(tick = 0, now = Date.now()): ClaudeProject[] {
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
    const thread = (projectId: string, id: string, title: string, state: ClaudeThreadState, minutesAgo: number, inLatest = true): ClaudeThread => ({
        id, title, state, url: claudeThreadUrl(projectId, id),
        createdAt: at(minutesAgo + 60), lastActivityAt: at(minutesAgo), lastSeenAt: at(inLatest ? 2 : 300), inLatest
    });
    const project = (id: string, name: string, shortName: string | undefined, syncedMinutesAgo: number, threads: ClaudeThread[]): ClaudeProject => ({
        id, name, shortName, url: claudeProjectUrl(id), hidden: false,
        firstSeenAt: at(5000), lastSyncedAt: at(syncedMinutesAgo), threads
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
            }, 2000, [pr(9, "Perennial planting plan", "merged")], 1500)
        ]),
        project("demo_trip", "Summer trip planning", "Trip", 3, [
            glance(thread("demo_trip", "demo_t1", "Compare train passes", "working", 3), {
                headline: "Three passes shortlisted; checking which cover the night train",
                progress: {done: 2, total: 5, now: "Check night train coverage"},
                topic: "Rail passes for the summer trip"
            }, 3, [{repo: "demo/trip", number: 4, title: "Fare table", state: "open", ci: "pending", url: "https://github.com/demo/trip/pull/4"}]),
            thread("demo_trip", "demo_t2", "Book the first two nights", "blocked", 40),
            thread("demo_trip", "demo_t3", "Packing list", "failed", 90),
            thread("demo_trip", "demo_t4", "Old itinerary idea", "stopped", 400, false),
            ...extraTrips(tick).map((title, i) => thread("demo_trip", `demo_t_new${i}`, title, "working", 0))
        ]),
        project("demo_taxes", "Taxes", undefined, 60 * 7, [
            thread("demo_taxes", "demo_x1", "Sort receipts by category", "working", 60 * 7),
            thread("demo_taxes", "demo_x2", "Estimate quarterly payment", "done", 60 * 30)
        ])
    ];
}

const newTrips = ["Find a dog sitter", "Check passport dates", "Pick a day trip"];
const extraTrips = (tick: number) => newTrips.slice(0, Math.min(newTrips.length, Math.floor(tick / 2)));
