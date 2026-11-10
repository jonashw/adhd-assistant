import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";
import { Env } from "./env";
import { HttpError } from "./http";
import { checkIn, reportState, suggestPlace } from "./items";
import { findPlaces, parsePlace, readPlace, whatsNextEverywhere } from "./places";
import { LinkedItem, ThreadState, threadStates } from "../../src/TrailTypes";
import { claudeAskKinds, claudeCiStates, claudePrStates, claudeThreadStates, delayClasses, interestGuesses, todoSizes } from "../../src/ClaudeMapTypes";
import { findClaudeThreads, syncProject } from "./claude";
import { pendingUpdate, protocolVersion } from "./protocol";
import { logMonologue, monologueMaxChars } from "./monologues";
import { LiveRing, ring } from "./live";
import { addChecklistItems, completeChecklistItem, listChecklistItems } from "./checklist";
import { checklistMaxPerCall } from "../../src/TrailTypes";
import { answerModes, askedBys, evidenceMaxChars, needMaxChars, needStates, needsPerCall, questionMaxChars, readChecklist, startChecklist, updateChecklist } from "./answers";

/* The Claude connector: a stateless MCP server at /mcp. Claude can check a thread in, report its state, log Jon's dictation,
   leave Jon to-dos at a place, and read Jon's map. It can't change places, statuses or links. */

export type ConnectorProps = {email: string};

/* Where Jon has to be (src/spots.ts): a spot name, so Your move can show only what he can do from where he is */
const whereHelp = (verb: string) => `The spot Jon must be at to ${verb}, from his spots (list_checklist_items lists them): `
    + "Anywhere (a phone will do, the default), Home, At my Mac (needs his MacBook), In bed, Garage, Out, Library, Park, School, "
    + "Supermarket, Costco, Home Depot. Pick the widest spot that works: Home if anywhere in the house will do, At my Mac only "
    + "for laptop work. Your best guess; Jon corrects it on the card";

const instructions = `Protocol version ${protocolVersion}. Newer rules reach running threads as protocol_update in a tool reply; follow them over these.

ADHD Assist is Jon's attention navigator: a map of the places (projects, areas, tasks) he cares about.
Your thread's state shows up as a signal on his map, so he knows when you need him without checking every thread.

- When you start work for Jon, call check_in with this thread's title and, if you know it, its link. Keep the thread_id it returns.
- Name the place this thread serves: call find_places with a few words, and pass the best match as place. Regions right under HOME can't be targets; pick a place inside one.
- If no place fits, check in without one, then call suggest_place with new names under the closest existing place (a map's HOME if nothing is close). Don't force the work into a place that doesn't fit; Jon charts the suggestion himself.
- Call report_state whenever your state changes: "waiting" when you end a turn needing Jon's answer, review or approval; "working" when you resume; "done" when the work is finished; "failed" when you are stuck on an error. Add a one-line note in plain words.
- When Jon answers you (a reply, a go-ahead, a decision, a review), make it the first thing you do in that turn, before the work itself: report_state "working" if you had reported "waiting", and sync_project with a fresh thread list and your card without its ask. That is how his Needs you or Go-ahead item clears; until then it still reads as waiting on him, and he can't tell his answer landed.
- When Jon defers your ask ("put a pin in it", "later", "remind me in a month"), it is no longer his move. Pick the day it comes back (the reminder day, if you set one), then report_state "waiting" with until set to that day, and sync_project with this_thread.set_aside_until the same day, keeping your card's ask. It leaves his Start here and comes back on that day.
- Never report on Jon's behalf, and never report "waiting" just to get attention.
- To-dos for Jon: when your work leaves steps only Jon can do (create an account, add a secret, merge a PR), call list_checklist_items, then add_checklist_items with the ones not there yet, at this thread's place (or its suggested place). They show in his What's next until he checks them off. Never add your own steps. Check one off with complete_checklist_item only when you saw it happen yourself, like a PR merged.
- Where Jon has to be: give each to-do (add_checklist_items) and each ask on your card (sync_project this_thread.card.ask) a where: the spot from Jon's spots he must be at, such as At my Mac for laptop work, Garage, or Library. Leave it out when a phone will do. His Your move page shows only what he can do from where he says he is, and waits on a spot's opening hours. To tag a to-do you added before, add it again with the same text and a where.
- Outside waits: when a to-do can't start until someone outside Jon's list comes through (a support ticket, a delivery, another person), give it waiting_for and a check_back_on day, and chain the steps after it with waits_on, so none of them sits in his Start here. When they come through, send the to-do again with waiting_for "". To fix a to-do you added before, send it again with the same text.
- Answer checklists: when you ask Jon a real question (not yes/no or one word), or he asks you one, call answer_checklist with the question and up to ${needsPerCall} short needs: what a full answer covers, the gaps in the asker's understanding. "finish" is a closed question to land; "expand" is an open interview (like "which apps do you love the feel of?") whose needs are facets to explore and may grow. After each of Jon's answers, mark what he covered, keep the still-open needs at the end of your reply and offer one to keep going on. Say "still open" and "covered", never "missing", "forgot" or "should"; no scores, percents or red. If Jon says a need doesn't matter, mark it set_aside without asking why. Covering everything never ends the talk: on an expand question only Jon decides he has dug deep enough. Never use it to mark your own answers.
- Claude map: if this thread is in a Claude project and you can list the project's threads, call sync_project when you start work, at the start of every turn that brings Jon's answer, whenever you call check_in or report_state, and as the last step of every turn.
  - Call list_threads again just before each sync, and take the project's name from the newest message you got, not from when your session started: Jon renames projects and threads, and the map only learns a new name from a sync.
  - threads: send the whole list the first time, and whenever any thread's title or state in that fresh list differs from your last sync (a rename counts). Otherwise leave threads out; that means "unchanged" and saves writing the list. Give each thread its session_id exactly as list_threads gives it (cse_...): it is how a thread in another project finds and reaches it.
  - this_thread: your own thread id and card (headline, ask, progress, artifact, artifacts, topic, keywords), whenever any of them changed, which is usually every turn. Send the whole card; a field left out is cleared.
  - this_thread.state: in your last sync of a turn, the state you leave your own thread in: "done" if you resolve it this turn, "blocked" if you end waiting on Jon, "review_ready" if you hand him finished work. Claude's own list still shows you as working until your turn ends, so without this your badge stays a turn behind.
  - prs: the project's PR list (list_prs) when it changed since your last sync. Set each PR's thread_id to the thread whose session id ends the same way.
  - artifacts: the project's artifacts (list_project_artifacts) when they changed since your last sync. Separately, put every artifact or doc you made or updated in this thread in your card's artifacts, and the latest one in artifact too: Claude's list doesn't say which thread made what, so this is how the map knows.
  - short_name: only if the project instructions give one; leave it out otherwise, and the map shows the project's name.
  - If nothing changed at all, skip the call. A changed project name counts as a change.
- Other projects: to read or ask something of a thread in another of Jon's projects, call find_thread with words from its title (or its project's name). It gives the thread's link and, once its project has synced them, its session id; remote_session_id is the form claude-code-remote's tools take. Read another project's thread only when Jon's request calls for it, ask it something only with his go-ahead, and leave its work to it.
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

/* What to do after report_state, so a thread doesn't have to remember the sequence */
const nextAfterReport: Record<ThreadState, string> = {
    working: "If this thread is in a Claude project, call sync_project now (your card without its ask, if Jon just answered you).",
    waiting: "End your turn with sync_project, this_thread.state \"blocked\" (or \"review_ready\" for a review) and your card's ask; if Jon deferred it, add this_thread.set_aside_until with the same day as until.",
    done: "End your turn with sync_project and this_thread.state \"done\" if you resolve the thread.",
    failed: "Say what failed in your reply to Jon, and end your turn with sync_project."
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

function buildServer(env: Env, origin: string): McpServer {
    const server = new McpServer(
        {name: "adhd-assist", title: "ADHD Assist", version: "1.0.0"},
        {instructions, jsonSchemaValidator: new CfWorkerJsonSchemaValidator()}
    );
    // what each kind of write changed, for the tabs that are open
    const trail = {env, rings: [{topic: "trail"}] as LiveRing[]};
    const threads = {env, rings: [{topic: "trail"}, {topic: "claude"}] as LiveRing[]};
    const monologues = {env, rings: [{topic: "monologues"}, {topic: "trail"}] as LiveRing[]};
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
    }, args => run(async () => {
        const item = await checkIn(env, {
            title: args.title, url: args.url, threadId: args.thread_id,
            place: args.place ? parsePlace(args.place) : undefined,
            alsoAt: args.also_at?.map(parsePlace)
        });
        return {
            ...describeThread(item),
            next: "If this thread is in a Claude project, call sync_project now, and again as the last step of every turn.",
            ...await pendingUpdate(env, "linked_items", item.id)
        };
    }, threads));

    server.registerTool("report_state", {
        title: "Report state",
        description: "Say how this thread is doing. waiting = needs Jon (raises a flare at its place); working = clears it; done = leaves fresh tracks; failed = raises smoke.",
        inputSchema: {
            thread_id: z.string().describe("The thread_id check_in returned"),
            state: z.enum(threadStates),
            note: z.string().max(240).optional().describe("One line in plain words, e.g. \"PR #7 is ready for your review\""),
            until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Only with \"waiting\", when Jon deferred: the day the flare comes back, YYYY-MM-DD. Until then it stays down")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => ({
        ...describeThread(await reportState(env, args.thread_id, args.state, args.note, args.until)),
        next: nextAfterReport[args.state],
        ...await pendingUpdate(env, "linked_items", args.thread_id)
    }), threads));

    server.registerTool("sync_project", {
        title: "Sync a project",
        description: "Mirror this Claude project, its threads, its PRs, its artifacts and this thread's own glance card onto Jon's Claude map. Threads come exactly as the platform lists them (list_threads): send the whole list, or leave it out when nothing in it changed since your last sync. A thread left out of a list is marked \"not seen lately\", never deleted. Safe to repeat.",
        inputSchema: {
            project_id: z.string().min(1).max(100).describe("The project's id, like \"chan_...\""),
            project_name: z.string().min(1).max(200).describe("The project's name as Jon sees it now (from the newest message, since he can rename it)"),
            short_name: z.string().min(1).max(40).optional().describe("A short label for the map, only if the project instructions give one; left out, the map shows project_name"),
            threads: z.array(z.object({
                thread_id: z.string().min(1).max(100).describe("The thread's id, like \"cmsg_...\""),
                title: z.string().min(1).max(300),
                state: z.enum(claudeThreadStates).describe("The platform's state for it: working, blocked (needs Jon), review_ready, done, failed or stopped"),
                created_at: z.string().max(40).optional(),
                last_activity_at: z.string().max(40).optional(),
                session_id: z.string().min(1).max(100).optional().describe("The thread's session id exactly as list_threads gives it, like \"cse_...\": how a thread in another project finds and reaches it")
            })).max(500).optional().describe("Every thread, the first time and whenever a title or state changed; leave out when unchanged"),
            this_thread: z.object({
                thread_id: z.string().min(1).max(100).describe("Your own thread's id"),
                card: z.object({
                    headline: z.string().max(140).optional().describe("Your latest reply to Jon in one line"),
                    ask: z.object({
                        kind: z.enum(claudeAskKinds).describe("question to answer, decision to make, approval to go ahead, or review of finished work"),
                        text: z.string().min(1).max(140).describe("What you need from Jon, in one line"),
                        where: z.string().max(40).optional().describe(whereHelp("answer it"))
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
                    artifacts: z.array(z.object({
                        title: z.string().min(1).max(200),
                        url: z.string().max(2000),
                        updated_at: z.string().max(40).optional()
                    })).max(50).optional().describe("Every artifact or doc this thread made or updated, newest first"),
                    topic: z.string().max(160).optional().describe("What this thread is about, in Jon's words, so he can find it later"),
                    keywords: z.array(z.string().min(1).max(40)).max(5).optional().describe("A few words Jon might search for")
                }),
                state: z.enum(claudeThreadStates).optional().describe("In your last sync of a turn: the state you leave this thread in (done if you resolve it, blocked if waiting on Jon, review_ready if handing over work)"),
                set_aside_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("When Jon defers your ask (\"put a pin in it\", \"later\", \"remind me\"): the day it comes back, YYYY-MM-DD. Until then it isn't his move; it clears when you work again")
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
                artifact_id: z.string().max(100).optional(),
                title: z.string().min(1).max(300),
                url: z.string().max(2000).describe("Its claude.ai link"),
                updated_at: z.string().max(40).optional()
            })).max(200).optional().describe("The project's artifacts as list_project_artifacts gives them, when they changed since your last sync; added to what the map has, never a replacement")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    // a sync can take down an answered thread's flare, so the trail rings too
    }, args => run(async () => ({
        ...await syncProject(env, args),
        ...await pendingUpdate(env, "claude_threads", args.this_thread?.thread_id)
    }), threads));

    server.registerTool("log_monologue", {
        title: "Log a monologue",
        description: "Send Jon's dictated words to the app, exactly as he said them. They're kept as a monologue of sentences; Claude reads each one for its move and topic, and the app charts them as dashed stakes and replays them. The call can take a few seconds while it reads. Sending the same words twice from one thread within a minute stores them once.",
        inputSchema: {
            text: z.string().max(monologueMaxChars).describe("Jon's words, exactly as he sent them"),
            url: z.string().max(2000).optional().describe("This thread's link, if you know it"),
            thread_id: z.string().optional().describe("The thread_id check_in returned, if this thread checked in")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => {
        const {monologue, repeat, stakes} = await logMonologue(env, {text: args.text, threadUrl: args.url, threadItemId: args.thread_id});
        const topics = [...new Set(monologue.utterances.flatMap(u => u.reading ? [u.reading.topic] : []))];
        return {
            monologue_id: monologue.id,
            sentences: monologue.utterances.length,
            repeat,
            read: monologue.read.state === "read" ? "read" : `waiting to be read${monologue.read.note ? ` (${monologue.read.note})` : ""}`,
            topics,
            dashed_stakes: stakes,
            replay: `${origin}/replay/${encodeURIComponent(monologue.id)}`,
            next: repeat ? "These words were already logged a moment ago; nothing new was stored."
                : monologue.read.state === "read" ? `Logged and read.${stakes > 0 ? " New topics wait on his map as dashed stakes for him to chart." : ""} Tell Jon in one line, naming the topics if there are a few.`
                : "Logged; the app will read it later. Tell Jon in one line that it's logged; don't make the wait sound like an error."
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
        link: z.string().max(2000).optional().describe("Where he does it, if there is a page for it: the PR, the settings page, the sign-up page"),
        where: z.string().max(40).optional().describe(whereHelp("do it")),
        // the Leverage estimates (src/leverage.ts); each is your best guess, and Jon can correct any
        worth: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional()
            .describe("1 nice to have, 2 helps, 3 matters (something he cares about stalls without it)"),
        why: z.string().max(200).optional().describe("One line on why it matters and to whom, e.g. \"the deploy is stuck until this is set\""),
        size: z.enum(todoSizes).optional().describe("minutes (under ~10), half_hour, or longer. Coarse on purpose; round up when unsure"),
        delay_class: z.enum(delayClasses).optional()
            .describe("expedite: waiting hurts now (a deploy down, a long outside wait to start). fixed_date: hurts after a date (give due_on). standard: hurts steadily. intangible: someday, no real cost to waiting"),
        due_on: z.string().optional().describe("For fixed_date: the day it starts to hurt, YYYY-MM-DD"),
        needs: z.array(z.string().max(300)).max(8).optional().describe("The concrete things he needs to do it: links, values to paste, where a setting lives"),
        done_when: z.array(z.string().max(300)).max(3).optional().describe("One to three lines: how he knows it's done"),
        waits_on: z.array(z.string().max(100)).max(20).optional().describe("Ids of other to-dos (from list_checklist_items) that must be done first"),
        waiting_for: z.string().max(80).optional()
            .describe("Someone outside Jon's list it waits on, in a few words, e.g. \"Netlify support\" or \"the parts delivery\". It sits under Opens up later until check_back_on. Send \"\" to clear it once they come through"),
        check_back_on: z.string().optional().describe("With waiting_for: the day to chase them if nothing came, YYYY-MM-DD. On that day it comes back to Jon as \"check on <who>\""),
        interest: z.enum(interestGuesses).optional()
            .describe("Your guess at how he'll feel about doing it: drawn (hands-on, novel, quick win), neutral, or reluctant (admin, waiting on hold, forms). He answers with a thumb, and it shapes the order"),
        interest_reason: z.string().max(120).optional().describe("A few words behind the guess, e.g. \"hands-on with gear\"")
    });

    server.registerTool("add_checklist_items", {
        title: "Add to-dos for Jon",
        description: `Leave Jon to-dos at a place on his map: steps only he can do, such as creating an account, adding a secret or merging a PR. Not your own steps. Each item is marked with this thread and links back to it, shows in his What's next, and makes the place "need him" until he checks it off. Up to ${checklistMaxPerCall} items per call. Give each one your estimates (worth, why, size, delay_class, done_when, and interest with a reason; needs and waits_on when they apply): Jon's attention field (his Your move page) orders his to-dos by Leverage, roughly (urgency + worth + what waits on it) × interest ÷ size, so small keys that open other work come first. Slice big steps into ones he can finish in one sitting. The same text twice at one place is stored once, so it is safe to repeat; sending it again updates its waits_on, waiting_for and check_back_on (when you send them), and its where unless Jon set it; call list_checklist_items first anyway to see what is there and what he finished. Leave out place to use this thread's place; if this thread only has a suggested place (suggest_place), the items wait there and move over when Jon charts it.`,
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

    const need = z.object({
        id: z.string().max(100).optional().describe("A need's id from an earlier answer_checklist result, to mark it; leave out to add a new need"),
        text: z.string().max(200).optional().describe(`A new need in plain words, up to ${needMaxChars} characters, e.g. "why it feels good" or "an example"`),
        state: z.enum(needStates).optional().describe("open, partly, covered, or set_aside (Jon said it doesn't matter)"),
        evidence: z.string().max(400).optional().describe(`What covered it: a short quote of Jon's words, up to ${evidenceMaxChars} characters`)
    });

    server.registerTool("answer_checklist", {
        title: "Answer checklist",
        description: `Keep a checklist of what a full answer to a question needs, and tick it off as Jon answers. Start one with question and 1 to ${needsPerCall} needs (no question_id); the result has question_id and each need's id. Later, send question_id with needs to mark (id + state + evidence) or, on an expand question, to add (text). Send question_id alone to read it back. Marks are only ever added and the newest counts, so repeating a call is safe. Only Jon's words count as evidence; never mark your own answers.`,
        inputSchema: {
            claude_thread_id: z.string().max(100).optional().describe("This thread's id in a Claude project (cmsg_...), as list_threads gives it, so the Claude map can show the open needs"),
            thread_id: z.string().optional().describe("The thread_id check_in returned, if this thread checked in"),
            url: z.string().max(2000).optional().describe("This thread's link, if you know it"),
            question_id: z.string().max(100).optional().describe("The question_id from an earlier call; leave out to start a new question"),
            question: z.object({
                text: z.string().max(questionMaxChars * 2).describe("The question, in the asker's words"),
                asked_by: z.enum(askedBys).describe("Who asked it"),
                asked_of: z.string().max(120).optional().describe("Who it was asked of, in plain words, e.g. \"Jon\""),
                mode: z.enum(answerModes).describe("finish: a closed question with a fixed set of needs; expand: an open interview whose needs can grow")
            }).optional().describe("A new question; leave out when you send question_id"),
            needs: z.array(need).max(needsPerCall).optional().describe(`Up to ${needsPerCall} needs to add or mark`)
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => {
        if (args.question_id && args.question) {
            throw new HttpError(422, "Send question_id to update a question, or question to start a new one, not both.");
        }
        if (args.question) {
            const q = args.question;
            return startChecklist(env, {claudeThreadId: args.claude_thread_id, threadItemId: args.thread_id, url: args.url},
                {text: q.text, askedBy: q.asked_by, askedOf: q.asked_of, mode: q.mode}, args.needs ?? []);
        }
        if (args.question_id) {
            return args.needs?.length ? updateChecklist(env, args.question_id, args.needs) : readChecklist(env, args.question_id);
        }
        throw new HttpError(422, "Send question (with its needs) to start a checklist, or question_id to update one.");
    }));

    server.registerTool("find_places", {
        title: "Find places",
        description: "Search Jon's map for places by their words. Returns each place's value (for check_in), its path and status. canTarget is false for HOME and the regions right under it (use those as \"under\" for suggest_place).",
        inputSchema: {query: z.string().max(200).describe("A few words; empty lists the first places")},
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, args => run(() => findPlaces(env, args.query)));

    server.registerTool("find_thread", {
        title: "Find a thread",
        description: "Find a thread in any of Jon's Claude projects, as his Claude map has it, by words in its title or its project's name (a thread id or session id works too). Returns each match's project, thread id, title, state, link and, once its project has synced them, its session id: session_id as list_threads gives it, remote_session_id as claude-code-remote's tools take it (get_session reads it). listed false means its project's latest list didn't have it, so it may be archived. Read another project's thread only when Jon's request calls for it, and ask it something only with his go-ahead.",
        inputSchema: {
            query: z.string().max(200).describe("A few words from the thread's title or its project's name; empty lists the most recently active"),
            project_id: z.string().max(100).optional().describe("Only this project's threads, like \"chan_...\"")
        },
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, args => run(() => findClaudeThreads(env, args.query, args.project_id)));

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
        const server = buildServer(env, new URL(request.url).origin);
        const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
        await server.connect(transport);
        return transport.handleRequest(request);
    }
};
