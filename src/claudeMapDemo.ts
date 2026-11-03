import { ClaudeProject, ClaudeThread, ClaudeThreadState, claudeProjectUrl, claudeThreadUrl } from "./ClaudeMapTypes";

/* Sample data for /claude?demo, so the Claude map can be tried without a server */
export function demoClaudeMap(now = Date.now()): ClaudeProject[] {
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
    const thread = (projectId: string, id: string, title: string, state: ClaudeThreadState, minutesAgo: number, inLatest = true): ClaudeThread => ({
        id, title, state, url: claudeThreadUrl(projectId, id),
        createdAt: at(minutesAgo + 60), lastActivityAt: at(minutesAgo), lastSeenAt: at(inLatest ? 2 : 300), inLatest
    });
    const project = (id: string, name: string, shortName: string | undefined, syncedMinutesAgo: number, threads: ClaudeThread[]): ClaudeProject => ({
        id, name, shortName, url: claudeProjectUrl(id), hidden: false,
        firstSeenAt: at(5000), lastSyncedAt: at(syncedMinutesAgo), threads
    });
    return [
        project("demo_garden", "Back garden makeover", "Garden", 2, [
            thread("demo_garden", "demo_g1", "Price out raised beds", "blocked", 12),
            thread("demo_garden", "demo_g2", "Plan the watering schedule", "working", 1),
            thread("demo_garden", "demo_g3", "Draft the shed layout", "review_ready", 30),
            thread("demo_garden", "demo_g4", "Pick hardy perennials", "done", 2000)
        ]),
        project("demo_trip", "Summer trip planning", "Trip", 3, [
            thread("demo_trip", "demo_t1", "Compare train passes", "working", 3),
            thread("demo_trip", "demo_t2", "Book the first two nights", "blocked", 40),
            thread("demo_trip", "demo_t3", "Packing list", "failed", 90),
            thread("demo_trip", "demo_t4", "Old itinerary idea", "stopped", 400, false)
        ]),
        project("demo_taxes", "Taxes", undefined, 60 * 7, [
            thread("demo_taxes", "demo_x1", "Sort receipts by category", "working", 60 * 7),
            thread("demo_taxes", "demo_x2", "Estimate quarterly payment", "done", 60 * 30)
        ])
    ];
}
