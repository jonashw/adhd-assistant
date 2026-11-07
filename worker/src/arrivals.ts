import { Env } from "./env";
import { HttpError, base64Url, randomToken, sha256 } from "./http";
import { listSpots, setWhere } from "./spots";
import { Spot, byName, fits, openState, pathTo } from "../../src/spots";

/* Arrival alerts. The app can't watch where the phone goes while it's closed, but the phone's own automations can:
   Tasker, MacroDroid or Shortcuts call /api/hook/arrive with a spot's name when Jon gets somewhere (or his phone goes
   into bedtime mode: "In bed"). The app then says where he is, and if things wait for him there, pushes a
   notification: "You're at Costco: 2 things to do here". A leave clears the pick if it is still that spot.

   The hook has its own keys, made in the app and shown once (only a hash is kept), because an automation can't sign
   in with Google. Pushes go out empty (Web Push with VAPID only, no payload encryption); the service worker then asks
   /api/push/latest what to say. VAPID keys are Worker secrets Jon sets. */

/* how long an arrival's pick lasts: a stay-put spot (In bed) through the night, any other a few hours */
const arrivalHours = (spots: Spot[], spot: Spot) => pathTo(spots, spot).some(s => s.staysPut) ? 10 : 3;

export async function createHookToken(env: Env, label: unknown) {
    const name = typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : "Phone";
    const token = `arr_${randomToken(24)}`;
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO hook_tokens (id, token_hash, label, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, await sha256(token), name, new Date().toISOString()).run();
    return {id, label: name, token};
}

export async function listHookTokens(env: Env) {
    const rows = (await env.DB.prepare("SELECT id, label, created_at, last_used_at FROM hook_tokens ORDER BY created_at").all<{
        id: string, label: string, created_at: string, last_used_at: string | null
    }>()).results;
    return rows.map(r => ({id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at ?? undefined}));
}

export async function revokeHookToken(env: Env, id: string) {
    await env.DB.prepare("DELETE FROM hook_tokens WHERE id = ?").bind(id).run();
}

async function requireHookToken(request: Request, env: Env) {
    const auth = request.headers.get("authorization") ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
    if (!token) {
        throw new HttpError(401, "Send the arrival key as Authorization: Bearer <key>.");
    }
    const row = await env.DB.prepare("SELECT id FROM hook_tokens WHERE token_hash = ?").bind(await sha256(token)).first<{id: string}>();
    if (!row) {
        throw new HttpError(401, "That arrival key isn't known. Make a new one in the app.");
    }
    await env.DB.prepare("UPDATE hook_tokens SET last_used_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
}

type Waiting = {text: string, where: string};

/* What waits for Jon at a spot: open to-dos and standing asks tagged with it (or a spot between it and the top),
   that fit there and whose spot is open now. Items tagged Anywhere don't count: they don't need the trip. */
export async function waitingAt(env: Env, spots: Spot[], spot: Spot, now = new Date()): Promise<Waiting[]> {
    const today = now.toISOString().slice(0, 10);
    const [todos, asks] = await env.DB.batch([
        env.DB.prepare("SELECT text, where_spot AS spot FROM checklist_items WHERE done_at IS NULL AND where_spot IS NOT NULL ORDER BY added_at DESC"),
        env.DB.prepare(
            `SELECT ask_text AS text, CASE WHEN ask_where_jon IS NOT NULL AND ask_where_jon_for = ask_text THEN ask_where_jon ELSE ask_where END AS spot
             FROM claude_threads WHERE state IN ('blocked', 'review_ready') AND ask_text IS NOT NULL
               AND (set_aside_until IS NULL OR set_aside_until <= ?)`
        ).bind(today)
    ]);
    const path = new Set(pathTo(spots, spot).filter(s => s.parentId).map(s => s.id));
    return ([...asks.results, ...todos.results] as {text: string, spot: string | null}[])
        .filter(r => {
            const tag = byName(spots, r.spot ?? undefined);
            return tag && path.has(tag.id) && fits(spots, tag.name, spot) && openState(spots, tag.name, now).open;
        })
        .map(r => ({text: r.text, where: r.spot!}));
}

export async function handleHook(request: Request, env: Env, url: URL) {
    if (request.method !== "POST") {
        throw new HttpError(405, "POST to this link.");
    }
    await requireHookToken(request, env);
    const body = await request.json().catch(() => ({})) as {spot?: unknown, event?: unknown};
    const name = typeof body.spot === "string" ? body.spot : url.searchParams.get("spot") ?? "";
    const event = (typeof body.event === "string" ? body.event : url.searchParams.get("event")) === "leave" ? "leave" : "arrive";
    const spots = await listSpots(env);
    const spot = byName(spots, name);
    if (!spot) {
        throw new HttpError(422, `"${name}" isn't one of your spots. Use one of: ${spots.map(s => s.name).join(", ")}.`);
    }
    const now = new Date();
    if (event === "leave") {
        await env.DB.prepare("DELETE FROM whereabouts WHERE id = 1 AND spot_id = ?").bind(spot.id).run();
        await env.DB.prepare("INSERT INTO arrivals (at, spot_id, spot_name, kind) VALUES (?, ?, ?, 'leave')")
            .bind(now.toISOString(), spot.id, spot.name).run();
        return {spot: spot.name, event, cleared: true};
    }
    await setWhere(env, spot.id, new Date(now.getTime() + arrivalHours(spots, spot) * 3600000).toISOString());
    const waiting = await waitingAt(env, spots, spot, now);
    let notified = 0;
    if (waiting.length > 0) {
        const title = `You're at ${spot.name}: ${waiting.length === 1 ? "1 thing" : `${waiting.length} things`} to do here`;
        const body = waiting.slice(0, 3).map(w => w.text).join("\n") + (waiting.length > 3 ? `\n…and ${waiting.length - 3} more` : "");
        await env.DB.prepare("INSERT INTO arrivals (at, spot_id, spot_name, kind, title, body) VALUES (?, ?, ?, 'arrive', ?, ?)")
            .bind(now.toISOString(), spot.id, spot.name, title, body).run();
        notified = await pushAll(env, url.origin);
    } else {
        await env.DB.prepare("INSERT INTO arrivals (at, spot_id, spot_name, kind) VALUES (?, ?, ?, 'arrive')")
            .bind(now.toISOString(), spot.id, spot.name).run();
    }
    return {spot: spot.name, event, waiting: waiting.length, notified};
}

/* What the newest notification should say, for the service worker; nothing if the last arrival is old or quiet */
export async function latestArrival(env: Env) {
    const row = await env.DB.prepare("SELECT at, spot_name, title, body FROM arrivals WHERE kind = 'arrive' ORDER BY id DESC LIMIT 1")
        .first<{at: string, spot_name: string, title: string | null, body: string | null}>();
    if (!row?.title || Date.now() - Date.parse(row.at) > 15 * 60000) {
        return {};
    }
    return {at: row.at, spot: row.spot_name, title: row.title, body: row.body ?? ""};
}

/* Web Push */

export function pushKey(env: Env): string {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        throw new HttpError(503, "Notifications need the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY Worker secrets.");
    }
    return env.VAPID_PUBLIC_KEY;
}

export async function subscribePush(env: Env, input: unknown) {
    const sub = input as {endpoint?: unknown, keys?: {p256dh?: unknown, auth?: unknown}, label?: unknown};
    if (typeof sub?.endpoint !== "string" || !/^https:\/\/[^\s]{1,1990}$/.test(sub.endpoint)) {
        throw new HttpError(422, "Send the browser's push subscription.");
    }
    await env.DB.prepare(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label`
    ).bind(sub.endpoint, typeof sub.keys?.p256dh === "string" ? sub.keys.p256dh : null, typeof sub.keys?.auth === "string" ? sub.keys.auth : null,
        typeof sub.label === "string" ? sub.label.slice(0, 60) : null, new Date().toISOString()).run();
}

export async function unsubscribePush(env: Env, endpoint: unknown) {
    if (typeof endpoint === "string") {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
    }
}

export async function pushCount(env: Env) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first<{n: number}>();
    return row?.n ?? 0;
}

const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

/* A VAPID JWT for one push service, signed with the ES256 private key */
export async function vapidJwt(env: Env, audience: string, subject: string): Promise<string> {
    const pub = fromBase64Url(env.VAPID_PUBLIC_KEY!);
    if (pub.length !== 65 || pub[0] !== 4) {
        throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 key, base64url.");
    }
    const key = await crypto.subtle.importKey("jwk", {
        kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE_KEY!, x: base64Url(pub.slice(1, 33)), y: base64Url(pub.slice(33, 65)), ext: true
    }, {name: "ECDSA", namedCurve: "P-256"}, false, ["sign"]);
    const enc = (o: object) => base64Url(new TextEncoder().encode(JSON.stringify(o)));
    const unsigned = `${enc({typ: "JWT", alg: "ES256"})}.${enc({aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject})}`;
    const signature = await crypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, key, new TextEncoder().encode(unsigned));
    return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

/* Wake every subscribed browser; ones the push service says are gone are forgotten. Returns how many took it. */
export async function pushAll(env: Env, origin: string): Promise<number> {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        return 0;
    }
    const subs = (await env.DB.prepare("SELECT endpoint FROM push_subscriptions").all<{endpoint: string}>()).results;
    const subject = env.VAPID_SUBJECT || origin;
    let sent = 0;
    for (const {endpoint} of subs) {
        try {
            const jwt = await vapidJwt(env, new URL(endpoint).origin, subject);
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {TTL: "600", Urgency: "high", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, "Content-Length": "0"}
            });
            if (response.status === 404 || response.status === 410) {
                await unsubscribePush(env, endpoint);
            } else if (response.ok) {
                sent++;
            } else {
                console.error("Push refused", response.status, await response.text());
            }
        } catch (e) {
            console.error("Push failed", e);
        }
    }
    return sent;
}
