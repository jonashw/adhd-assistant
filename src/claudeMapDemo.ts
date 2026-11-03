import { ClaudeArtifact, ClaudeProject, ClaudeThread, ClaudeThreadState, claudeProjectUrl, claudeThreadUrl } from "./ClaudeMapTypes";

/* Sample data for /claude?demo, so the Claude map can be tried without a server. Each tick (a refresh)
   moves it along a little, the way real syncs would: states change, and now and then a thread starts. */
export function demoClaudeMap(tick = 0, now = Date.now()): ClaudeProject[] {
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
    const thread = (projectId: string, id: string, title: string, state: ClaudeThreadState, minutesAgo: number, inLatest = true): ClaudeThread => ({
        id, title, state, url: claudeThreadUrl(projectId, id),
        createdAt: at(minutesAgo + 60), lastActivityAt: at(minutesAgo), lastSeenAt: at(inLatest ? 2 : 300), inLatest
    });
    // seen = minutes since the map first saw it; the project joined 5000 minutes ago
    const artifact = (id: string, title: string, updatedMinutesAgo: number, seenMinutesAgo: number, openedMinutesAgo?: number): ClaudeArtifact => ({
        id, title, url: `https://claude.ai/artifact/${id}`, updatedAt: at(updatedMinutesAgo), firstSeenAt: at(seenMinutesAgo),
        openedAt: openedMinutesAgo === undefined ? undefined : at(openedMinutesAgo), inLatest: true
    });
    const project = (id: string, name: string, shortName: string | undefined, syncedMinutesAgo: number, threads: ClaudeThread[], artifacts: ClaudeArtifact[] = []): ClaudeProject => ({
        id, name, shortName, url: claudeProjectUrl(id), hidden: false,
        firstSeenAt: at(5000), lastSyncedAt: at(syncedMinutesAgo), threads, artifacts
    });
    return [
        project("demo_garden", "Back garden makeover", "Garden", 2, [
            thread("demo_garden", "demo_g1", "Price out raised beds", "blocked", 12),
            thread("demo_garden", "demo_g2", "Plan the watering schedule", tick % 3 === 2 ? "review_ready" : "working", 1),
            thread("demo_garden", "demo_g3", "Draft the shed layout", "review_ready", 30),
            thread("demo_garden", "demo_g4", "Pick hardy perennials", "done", 2000)
        ], [
            artifact("demo_a_shed", "Shed layout sketch", 25, 25),
            artifact("demo_a_plants", "Perennials shortlist", 90, 5000, 60 * 10)
        ]),
        project("demo_trip", "Summer trip planning", "Trip", 3, [
            thread("demo_trip", "demo_t1", "Compare train passes", "working", 3),
            thread("demo_trip", "demo_t2", "Book the first two nights", "blocked", 40),
            thread("demo_trip", "demo_t3", "Packing list", "failed", 90),
            thread("demo_trip", "demo_t4", "Old itinerary idea", "stopped", 400, false),
            ...extraTrips(tick).map((title, i) => thread("demo_trip", `demo_t_new${i}`, title, "working", 0))
        ], [
            artifact("demo_a_route", "Route map", 4000, 5000)
        ]),
        project("demo_taxes", "Taxes", undefined, 60 * 7, [
            thread("demo_taxes", "demo_x1", "Sort receipts by category", "working", 60 * 7),
            thread("demo_taxes", "demo_x2", "Estimate quarterly payment", "done", 60 * 30)
        ])
    ];
}

const newTrips = ["Find a dog sitter", "Check passport dates", "Pick a day trip"];
const extraTrips = (tick: number) => newTrips.slice(0, Math.min(newTrips.length, Math.floor(tick / 2)));
