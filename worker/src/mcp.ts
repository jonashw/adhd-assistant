import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";
import { Env } from "./env";
import { HttpError } from "./http";
import { checkIn, reportState, suggestPlace } from "./items";
import { findPlaces, parsePlace, readPlace, whatsNextEverywhere } from "./places";
import { LinkedItem, threadStates } from "../../src/TrailTypes";
import { claudeAskKinds, claudeCiStates, claudePrStates, claudeThreadStates } from "../../src/ClaudeMapTypes";
import { syncProject } from "./claude";
import { logMonologue, monologueMaxChars } from "./monologues";
import { LiveRing, ring } from "./live";
import { addChecklistItems, completeChecklistItem, listChecklistItems } from "./checklist";
import { checklistMaxPerCall } from "../../src/TrailTypes";

/* The Claude connector: a stateless MCP server at /mcp. Claude can check a thread in, report its state, log Jon's dictation,
   leave Jon to-dos at a place, and read Jon's map. It can't change places, statuses or links. */

export type ConnectorProps = {email: string};

const instructions = `ADHD Assist is Jon's attention navigator: a map of the places (projects, areas, tasks) he cares about.
Your thread's state shows up as a signal on his map, so he knows when you need him without checking every thread.

- When you start work for Jon, call check_in with this thread's title and, if you know it, its link. Keep the thread_id it returns.
- Name the place this thread serves: call find_places with a few words, and pass the best match as place. Regions right under HOME can't be targets; pick a place inside one.
- If no place fits, check in without one, then call suggest_place with new names under the closest existing place (a map's HOME if nothing is close). Don't force the work into a place that doesn't fit; Jon charts the suggestion himself.
- Call report_state whenever your state changes: "waiting" when you end a turn needing Jon's answer, review or approval; "working" when you resume; "done" when the work is finished; "failed" when you are stuck on an error. Add a one-line note in plain words.
- Never report on Jon's behalf, and never report "waiting" just to get attention.
- To-dos for Jon: when your work leaves steps only Jon can do (create an account, add a secret, merge a PR), call list_checklist_items, then add_checklist_items with the ones not there yet, at this thread's place (or its suggested place). They show in his What's next until he checks them off. Never add your own steps. Check one off with complete_checklist_item only when you saw it happen yourself, like a PR merged.
- Claude map: if this thread is in a Claude project and you can list the project's threads, call sync_project when you start work, whenever you call check_in or report_state, and as the last step of every turn.
  - Call list_threads again just before each sync, and take the project's name from the newest message you got, not from when your session started: Jon renames projects and threads, and the map only learns a new name from a sync.
  - threads: send the whole list the first time, and whenever any thread's title or state in that fresh list differs from your last sync (a rename counts). Otherwise leave threads out; that means "unchanged" and saves writing the list.
  - this_thread: your own thread id and card (headline, ask, progress, topic, keywords), whenever any of them changed, which is usually every turn. Send the whole card; a field left out is cleared.
  - this_thread.state: in your last sync of a turn, the state you leave your own thread in: "done" if you resolve it this turn, "blocked" if you end waiting on Jon, "review_ready" if you hand him finished work. Claude's own list still shows you as working until your turn ends, so without this your badge stays a turn behind.
  - prs: the project's PR list (list_prs) when it changed since your last sync. Set each PR's thread_id to the thread whose session id ends the same way.
  - artifacts: the project's artifacts (list_project_artifacts), if you can list them. Leave out if you can't list them; stored artifacts stay as they are.
  - short_name: only if the project instructions give one; leave it out otherwise, and the map shows the project's name.
  - If nothing changed at all, skip the call. A changed project name counts as a change.
- Monologues: when Jon sends you dictation (spoken words, often several topics in a row) or asks you to log what he said, call log_monologue with his words exactly as he sent them, unedited, plus this thread's link or thread_id. The app turns it into a map he can replay. Don't log your own words or anything he pasted from elsewhere.`;

const text = (value: unknown) => ({content: [{type: "text" as const, text: JSON.stringify(value, null, 2)}]});

const describeThread = (item: LinkedItem) => {
    const primary = item.places.find(p => p.primary);
    return {
        thread_id: item.id,
        title: item.title,
        state: item.state,
        place: primary ? "set" : "not set: if no existing place fits, call suggest_place; otherwise Jon will be asked to pick one",
    };
};

/* Runs a tool. A tool that writes names what it changed, and every open tab of the app hears it at once. */
async function run<T>(work: () => Promise<T>, after?: {env: Env, rings: LiveRing[]}) {
    try {
        const result = await work();
        if (after) {
            await ring(after.env, after.rings);
        }
        return text(result);
    } catch (e) {
        if (e instanceof HttpError) {
            return {content: [{type: "text" as const, text: e.message}], isError: true};
        }
        throw e;
    }
}

function buildServer(env: Env): McpServer {
    const server = new McpServer(
        {name: "adhd-assist", title: "ADHD Assist", version: "1.0.0"},
        {instructions, jsonSchemaValidator: new CfWorkerJsonSchemaValidator()}
    );
    // what each kind of write changed, for the tabs that are open
    const trail = {env, rings: [{topic: "trail"}] as LiveRing[]};
    const threads = {env, rings: [{topic: "trail"}, {topic: "claude"}] as LiveRing[]};
    const claude = {env, rings: [{topic: "claude"}] as LiveRing[]};
    const monologues = {env, rings: [{topic: "monologues"}] as LiveRing[]};
    const place = z.string().describe("A place value from find_places, like \"<map id>/<place id>\"");

    server.registerTool("check_in", {
        title: "Check in",
        description: "Register this Claude thread with Jon's map, or update it. Call it when work starts. The same link or thread_id updates the same thread.",
        inputSchema: {
            title: z.string().min(1).max(200).describe("This thread's title, in Jon's words"),
            url: z.string().max(2000).optional().describe("This thread's link, if you know it"),
            thread_id: z.string().optional().describe("The thread_id an earlier check_in returned"),
            place: place.optional().describe("The one place this thread serves; its signals land there"),
            also_at: z.array(place).max(10).optional().describe("Other places this thread touches (optional)")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => describeThread(await checkIn(env, {
        title: args.title, url: args.url, threadId: args.thread_id,
        place: args.place ? parsePlace(args.place) : undefined,
        alsoAt: args.also_at?.map(parsePlace)
    })), threads));

    server.registerTool("report_state", {
        title: "Report state",
        description: "Say how this thread is doing. waiting = needs Jon (raises a flare at its place); working = clears it; done = leaves fresh tracks; failed = raises smoke.",
        inputSchema: {
            thread_id: z.string().describe("The thread_id check_in returned"),
            state: z.enum(threadStates),
            note: z.string().max(240).optional().describe("One line in plain words, e.g. \"PR #7 is ready for your review\"")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => describeThread(await reportState(env, args.thread_id, args.state, args.note)), threads));

    server.registerTool("sync_project", {
        title: "Sync a project",
        description: "Mirror this Claude project, its threads, its PRs and this thread's own glance card onto Jon's Claude map. Threads come exactly as the platform lists them (list_threads): send the whole list, or leave it out when nothing in it changed since your last sync. A thread left out of a list is marked \"not seen lately\", never deleted. Safe to repeat.",
        inputSchema: {
            project_id: z.string().min(1).max(100).describe("The project's id, like \"chan_...\""),
            project_name: z.string().min(1).max(200).describe("The project's name as Jon sees it now (from the newest message, since he can rename it)"),
            short_name: z.string().min(1).max(40).optional().describe("A short label for the map, only if the project instructions give one; left out, the map shows project_name"),
            threads: z.array(z.object({
                thread_id: z.string().min(1).max(100).describe("The thread's id, like \"cmsg_...\""),
                title: z.string().min(1).max(300),
                state: z.enum(claudeThreadStates).describe("The platform's state for it: working, blocked (needs Jon), review_ready, done, failed or stopped"),
                created_at: z.string().max(40).optional(),
                last_activity_at: z.string().max(40).optional()
            })).max(500).optional().describe("Every thread, the first time and whenever a title or state changed; leave out when unchanged"),
            this_thread: z.object({
                thread_id: z.string().min(1).max(100).describe("Your own thread's id"),
                card: z.object({
                    headline: z.string().max(140).optional().describe("Your latest reply to Jon in one line"),
                    ask: z.object({
                        kind: z.enum(claudeAskKinds).describe("question to answer, decision to make, approval to go ahead, or review of finished work"),
                        text: z.string().min(1).max(140).describe("What you need from Jon, in one line")
                    }).optional().describe("Only while you are waiting on Jon"),
                    progress: z.object({
                        done: z.number().int().min(0).max(500),
                        total: z.number().int().min(1).max(500),
                        now: z.string().max(80).optional().describe("The step in progress, as your checklist words it")
                    }).optional().describe("Your checklist, counted"),
                    artifact: z.object({
                        title: z.string().min(1).max(200),
                        url: z.string().max(2000)
                    }).optional().describe("The artifact or doc this thread last made or updated"),
                    topic: z.string().max(160).optional().describe("What this thread is about, in Jon's words, so he can find it later"),
                    keywords: z.array(z.string().min(1).max(40)).max(5).optional().describe("A few words Jon might search for")
                }),
                state: z.enum(claudeThreadStates).optional().describe("In your last sync of a turn: the state you leave this thread in (done if you resolve it, blocked if waiting on Jon, review_ready if handing over work)")
            }).optional().describe("Your own glance card, and the state you end your turn in; send the whole card whenever it changed"),
            prs: z.array(z.object({
                repo: z.string().min(1).max(200).describe("owner/name"),
                number: z.number().int().min(1),
                title: z.string().min(1).max(300),
                state: z.enum(claudePrStates),
                ci: z.enum(claudeCiStates).optional().describe("The checks' overall result"),
                url: z.string().max(2000),
                thread_id: z.string().min(1).max(100).optional().describe("The thread that opened it: the one whose session id ends the same way")
            })).max(100).optional().describe("The project's PRs as list_prs gives them, when they changed since your last sync"),
            artifacts: z.array(z.object({
                artifact_id: z.string().min(1).max(100),
                title: z.string().min(1).max(300),
                url: z.string().max(500).describe("Its claude.ai link"),
                updated_at: z.string().max(40).optional()
            })).max(500).optional().describe("The project's artifacts, for example from list_project_artifacts. Leave out if you can't list them.")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(() => syncProject(env, args), claude));

    server.registerTool("log_monologue", {
        title: "Log a monologue",
        description: "Send Jon's dictated words to the app, exactly as he said them. They're kept as a monologue of sentences that the app reads, charts as dashed stakes and replays. Sending the same words twice from one thread within a minute stores them once.",
        inputSchema: {
            text: z.string().max(monologueMaxChars).describe("Jon's words, exactly as he sent them"),
            url: z.string().max(2000).optional().describe("This thread's link, if you know it"),
            thread_id: z.string().optional().describe("The thread_id check_in returned, if this thread checked in")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => {
        const {monologue, repeat} = await logMonologue(env, {text: args.text, threadUrl: args.url, threadItemId: args.thread_id});
        return {
            monologue_id: monologue.id,
            sentences: monologue.utterances.length,
            repeat,
            next: repeat ? "These words were already logged a moment ago; nothing new was stored." : "Logged. Tell Jon in one line."
        };
    }, monologues));

    server.registerTool("suggest_place", {
        title: "Suggest a place",
        description: "When no existing place fits this thread, suggest a new one: one to three names, outermost first, under the closest existing place (HOME included; find_places lists each map's HOME). The map doesn't change: Jon charts it, picks another place, or says no. Charting places this thread there.",
        inputSchema: {
            thread_id: z.string().describe("The thread_id check_in returned"),
            under: place.describe("The closest existing place, from find_places; may be a map's HOME"),
            names: z.array(z.string().min(1).max(120)).min(1).max(3)
                .describe("New names, outermost first; the last is this thread's place. Right under HOME, give a region and a place, like [\"Music\", \"NYE party\"]")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => {
        const suggestion = await suggestPlace(env, args.thread_id, parsePlace(args.under), args.names);
        return {suggested: suggestion.path.join(" › "), next: "Jon will see it in What's next. Once he charts it, this thread's signals land there."};
    }, trail));

    const checklistItem = z.object({
        text: z.string().min(1).max(300).describe("One step only Jon can do, in plain words, e.g. \"Add the CLOUDFLARE_API_TOKEN secret to the House Party environment\""),
        group: z.string().min(1).max(40).optional().describe("An optional heading Jon sorts by, like \"From home\" (needs his laptop or accounts) or \"Anytime\" (a phone will do)"),
        link: z.string().max(2000).optional().describe("Where he does it, if there is a page for it: the PR, the settings page, the sign-up page")
    });

    server.registerTool("add_checklist_items", {
        title: "Add to-dos for Jon",
        description: `Leave Jon to-dos at a place on his map: steps only he can do, such as creating an account, adding a secret or merging a PR. Not your own steps. Each item is marked with this thread and links back to it, shows in his What's next, and makes the place "need him" until he checks it off. Up to ${checklistMaxPerCall} items per call. The same text twice at one place is stored once, so it is safe to repeat; call list_checklist_items first anyway to see what is there and what he finished. Leave out place to use this thread's place; if this thread only has a suggested place (suggest_place), the items wait there and move over when Jon charts it.`,
        inputSchema: {
            thread_id: z.string().describe("The thread_id check_in returned; check in with this thread's link so the items link back to it"),
            items: z.array(checklistItem).min(1).max(checklistMaxPerCall).describe(`1 to ${checklistMaxPerCall} to-dos, in the order Jon should do them`),
            place: place.optional().describe("The place the to-dos belong to, from find_places. Leave out for this thread's own place, or its suggested place")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(() => addChecklistItems(env, args.thread_id, args.place ? parsePlace(args.place) : undefined, args.items), trail));

    server.registerTool("list_checklist_items", {
        title: "List to-dos at a place",
        description: "List the to-dos at a place, open ones first: their text, group, link, whether Jon (or a thread) checked them off, and which thread added each. Use it before add_checklist_items to avoid duplicates, and to see what Jon finished. Pass place, or just thread_id for this thread's own place (or its suggested place).",
        inputSchema: {
            place: place.optional().describe("A place value from find_places"),
            thread_id: z.string().optional().describe("The thread_id check_in returned; without place, lists this thread's own place")
        },
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, args => run(() => listChecklistItems(env, {place: args.place ? parsePlace(args.place) : undefined, threadId: args.thread_id})));

    server.registerTool("complete_checklist_item", {
        title: "Check off a to-do",
        description: "Check off a to-do this thread added, only when you saw it happen yourself (e.g. the PR it names is merged). Never for steps Jon has to confirm, like adding a secret: he checks those himself. Items other threads added can't be checked here.",
        inputSchema: {
            thread_id: z.string().describe("The thread_id check_in returned; it must be the thread that added the item"),
            id: z.string().min(1).max(100).describe("The item's id, from add_checklist_items or list_checklist_items")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(() => completeChecklistItem(env, args.thread_id, args.id), trail));

    server.registerTool("find_places", {
        title: "Find places",
        description: "Search Jon's map for places by their words. Returns each place's value (for check_in), its path and status. canTarget is false for HOME and the regions right under it (use those as \"under\" for suggest_place).",
        inputSchema: {query: z.string().max(200).describe("A few words; empty lists the first places")},
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, args => run(() => findPlaces(env, args.query)));

    server.registerTool("read_place", {
        title: "Read a place",
        description: "Read one place: its path, status, notes, children, what it waits on, its signals, linked items and to-dos.",
        inputSchema: {place},
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, args => run(() => readPlace(env, args.place)));

    server.registerTool("whats_next", {
        title: "What's next",
        description: "Ask what the app suggests Jon do next on each of his maps, with the reason. The app suggests; Jon decides.",
        inputSchema: {},
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, () => run(() => whatsNextEverywhere(env)));

    return server;
}

export const mcpHandler = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext & {props?: ConnectorProps}): Promise<Response> {
        // the grant was made by the allowed account; check again in case ALLOWED_EMAIL changed since
        if (ctx.props?.email !== env.ALLOWED_EMAIL.toLowerCase()) {
            return new Response("This connection no longer has access.", {status: 403});
        }
        const server = buildServer(env);
        const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
        await server.connect(transport);
        return transport.handleRequest(request);
    }
};
