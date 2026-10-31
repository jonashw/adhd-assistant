import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";
import { Env } from "./env";
import { HttpError } from "./http";
import { checkIn, reportState } from "./items";
import { findPlaces, parsePlace, readPlace, whatsNextEverywhere } from "./places";
import { LinkedItem, threadStates } from "../../src/TrailTypes";

/* The Claude connector: a stateless MCP server at /mcp. Claude can check a thread in, report its state,
   and read Jon's map. It can't change places, statuses or links. */

export type ConnectorProps = {email: string};

const instructions = `ADHD Assist is Jon's attention navigator: a map of the places (projects, areas, tasks) he cares about.
Your thread's state shows up as a signal on his map, so he knows when you need him without checking every thread.

- When you start work for Jon, call check_in with this thread's title and, if you know it, its link. Keep the thread_id it returns.
- Name the place this thread serves: call find_places with a few words, and pass the best match as place. Regions right under HOME can't be targets; pick a place inside one. If you aren't sure, check in without a place and Jon will pick one.
- Call report_state whenever your state changes: "waiting" when you end a turn needing Jon's answer, review or approval; "working" when you resume; "done" when the work is finished; "failed" when you are stuck on an error. Add a one-line note in plain words.
- Never report on Jon's behalf, and never report "waiting" just to get attention.`;

const text = (value: unknown) => ({content: [{type: "text" as const, text: JSON.stringify(value, null, 2)}]});

const describeThread = (item: LinkedItem) => {
    const primary = item.places.find(p => p.primary);
    return {
        thread_id: item.id,
        title: item.title,
        state: item.state,
        place: primary ? "set" : "not set: Jon will be asked which place this thread serves",
    };
};

async function run<T>(work: () => Promise<T>) {
    try {
        return text(await work());
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
    }))));

    server.registerTool("report_state", {
        title: "Report state",
        description: "Say how this thread is doing. waiting = needs Jon (raises a flare at its place); working = clears it; done = leaves fresh tracks; failed = raises smoke.",
        inputSchema: {
            thread_id: z.string().describe("The thread_id check_in returned"),
            state: z.enum(threadStates),
            note: z.string().max(240).optional().describe("One line in plain words, e.g. \"PR #7 is ready for your review\"")
        },
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false}
    }, args => run(async () => describeThread(await reportState(env, args.thread_id, args.state, args.note))));

    server.registerTool("find_places", {
        title: "Find places",
        description: "Search Jon's map for places by their words. Returns each place's value (for check_in), its path and status. canTarget is false for regions right under HOME.",
        inputSchema: {query: z.string().max(200).describe("A few words; empty lists the first places")},
        annotations: {readOnlyHint: true, openWorldHint: false}
    }, args => run(() => findPlaces(env, args.query)));

    server.registerTool("read_place", {
        title: "Read a place",
        description: "Read one place: its path, status, notes, children, what it waits on, its signals and linked items.",
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
