import { Env } from "./env";

/* The connector's protocol: the rules a thread follows, versioned. Every thread reads the connector's instructions
   once, when its session starts, so a thread that was already running when the rules changed would keep the old
   ones. Instead, its next check_in, report_state or sync_project reply carries what changed since the version it
   knows, once. No project needs instructions pasted in for a rule to reach its threads. */

export type ProtocolChange = {version: number, on: string, rule: string};

/* Newest last. Version 1 is everything before versions were counted. Add a change here whenever the instructions
   change in a way a running thread should act on, and say it in full: it is all an older thread will see. */
export const protocolChanges: ProtocolChange[] = [
    {
        version: 2,
        on: "2026-11-07",
        rule: "When Jon answers you (a reply, a go-ahead, a decision, a review), make it the first thing you do in that turn, "
            + "before the work itself: report_state \"working\" if you had reported \"waiting\", and sync_project with a fresh "
            + "thread list and your card without its ask. That is how his Needs you or Go-ahead item clears; until then it "
            + "still reads as waiting on him. Also: newer rules reach you like this one, as protocol_update in a tool reply. "
            + "Follow them over the instructions you started with."
    },
    {
        version: 3,
        on: "2026-11-07",
        rule: "When Jon defers your ask (\"put a pin in it\", \"later\", \"remind me in a month\"), it is no longer his move. "
            + "Pick the day it comes back (the reminder day, if you set one), then report_state \"waiting\" with until set to "
            + "that day, and sync_project with this_thread.set_aside_until the same day (YYYY-MM-DD), keeping your card's ask. "
            + "It leaves his Start here and comes back on that day. If he already deferred an ask you are still holding, "
            + "do this now."
    },
    {
        version: 4,
        on: "2026-11-07",
        rule: "Where Jon has to be: give each to-do (add_checklist_items) and each ask on your card (sync_project "
            + "this_thread.card.ask) a where: the spot from Jon's spots he must be at, such as At my Mac for laptop work, Garage, "
            + "or Library (list_checklist_items lists the spots; the default tree is Anywhere › Home › At my Mac, In bed, Garage; "
            + "Anywhere › Out › Library, Park, School, Supermarket, Costco, Home Depot). Leave it out when a phone will do. His "
            + "Your move page shows only what he can do from where he says he is, and waits on a spot's opening hours. To tag a "
            + "to-do you added before, add it again with the same text and a where."
    },
    {
        version: 5,
        on: "2026-11-08",
        rule: "Outside waits: when a to-do can't start until someone outside Jon's list comes through (a support ticket, a "
            + "delivery, another person), give it waiting_for (\"Netlify support\") and a check_back_on day (YYYY-MM-DD), and "
            + "chain the steps after it with waits_on, so none of them sits in his Start here. Sending a to-do again with the "
            + "same text now updates its waits_on, waiting_for and check_back_on; send waiting_for \"\" when they come through. "
            + "If a to-do you added waits on an outside party today, fix it now."
    }
];

export const protocolVersion = protocolChanges.length ? protocolChanges[protocolChanges.length - 1].version : 1;

export type ProtocolUpdate = {
    protocol_update: {version: number, since: number, note: string, changes: ProtocolChange[]}
};

/* What a reply should add for a thread that knows `seen`, if anything */
export function updateSince(seen: number | null | undefined): ProtocolUpdate | undefined {
    const since = seen ?? 1;
    const changes = protocolChanges.filter(c => c.version > since);
    return changes.length === 0 ? undefined : {
        protocol_update: {
            version: protocolVersion, since,
            note: "The ADHD Assist connector's rules changed since your session started. These replace what your "
                + "instructions say where they differ. You'll see each change once.",
            changes
        }
    };
}

type Table = "claude_threads" | "linked_items";

/* The update a thread hasn't been told about yet, marking it told. Never fails the tool call it rides on. */
export async function pendingUpdate(env: Env, table: Table, id: string | undefined): Promise<ProtocolUpdate | undefined> {
    if (!id) {
        return undefined;
    }
    try {
        const row = await env.DB.prepare(`SELECT protocol_seen FROM ${table} WHERE id = ?`).bind(id).first<{protocol_seen: number | null}>();
        if (!row) {
            return undefined;
        }
        const update = updateSince(row.protocol_seen);
        if (update) {
            await env.DB.prepare(`UPDATE ${table} SET protocol_seen = ? WHERE id = ?`).bind(protocolVersion, id).run();
        }
        return update;
    } catch (e) {
        console.error("Couldn't check the protocol version", e);
        return undefined;
    }
}
