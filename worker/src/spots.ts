import { Env } from "./env";
import { HttpError } from "./http";
import { Spot, Whereabouts, byName, inOrder, spotNameMax, treeProblem } from "../../src/spots";

/* Where Jon can be (src/spots.ts): the tree, where he says he is now, and the tags on to-dos and asks.
   Tags are spot names, so a thread can write them; renaming a spot carries its tags along. */

type SpotRow = {id: string, parent_id: string | null, name: string, stays_put: number, hours: string | null, osm: string | null, position: number};

const spotOf = (r: SpotRow): Spot => {
    const spot: Spot = {id: r.id, name: r.name, position: r.position};
    if (r.parent_id) spot.parentId = r.parent_id;
    if (r.stays_put) spot.staysPut = true;
    if (r.osm) spot.osm = r.osm;
    if (r.hours) {
        try {
            spot.hours = JSON.parse(r.hours);
        } catch {
            // unreadable hours count as always open
        }
    }
    return spot;
};

export async function listSpots(env: Env): Promise<Spot[]> {
    const rows = (await env.DB.prepare("SELECT * FROM spots ORDER BY position, name").all<SpotRow>()).results;
    return rows.map(spotOf);
}

export async function getWhere(env: Env): Promise<{spots: Spot[], now?: Whereabouts}> {
    const [spots, row] = await Promise.all([
        listSpots(env),
        env.DB.prepare("SELECT spot_id, set_at, until FROM whereabouts WHERE id = 1").first<{spot_id: string | null, set_at: string, until: string}>()
    ]);
    return row?.spot_id ? {spots, now: {spotId: row.spot_id, setAt: row.set_at, until: row.until}} : {spots};
}

/* Jon's whole tree from the editor. A renamed spot keeps its tags; a removed one leaves them as words that fit anywhere. */
export async function saveSpots(env: Env, input: unknown): Promise<Spot[]> {
    if (!Array.isArray(input)) {
        throw new HttpError(422, "Send the list of spots.");
    }
    const spots: Spot[] = input.map((s, i) => ({
        id: String(s?.id ?? ""), parentId: s?.parentId ? String(s.parentId) : undefined, name: String(s?.name ?? "").trim(),
        staysPut: !!s?.staysPut, hours: s?.hours ?? undefined, osm: typeof s?.osm === "string" && s.osm.trim() ? s.osm.trim() : undefined,
        position: Number.isInteger(s?.position) ? s.position : i
    }));
    if (spots.some(s => !/^[\w-]{1,60}$/.test(s.id))) {
        throw new HttpError(422, "A spot's id isn't valid.");
    }
    const problem = treeProblem(spots);
    if (problem) {
        throw new HttpError(422, problem);
    }
    const before = await listSpots(env);
    const renames = before.flatMap(old => {
        const now = spots.find(s => s.id === old.id);
        return now && now.name !== old.name ? [{from: old.name, to: now.name}] : [];
    });
    const where = await env.DB.prepare("SELECT spot_id FROM whereabouts WHERE id = 1").first<{spot_id: string | null}>();
    await env.DB.batch([
        // names are unique, so clear the old tree before writing the new one, parents before children
        env.DB.prepare("DELETE FROM spots"),
        ...inOrder(spots).map(({spot: s}) => env.DB.prepare(
            "INSERT INTO spots (id, parent_id, name, stays_put, hours, osm, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(s.id, s.parentId ?? null, s.name, s.staysPut ? 1 : 0, s.hours ? JSON.stringify(s.hours) : null, s.osm ?? null, s.position)),
        ...renames.flatMap(({from, to}) => [
            env.DB.prepare("UPDATE checklist_items SET where_spot = ? WHERE where_spot = ? COLLATE NOCASE").bind(to, from),
            env.DB.prepare("UPDATE claude_threads SET ask_where = ? WHERE ask_where = ? COLLATE NOCASE").bind(to, from),
            env.DB.prepare("UPDATE claude_threads SET ask_where_jon = ? WHERE ask_where_jon = ? COLLATE NOCASE").bind(to, from)
        ]),
        // clearing the tree let go of where Jon is; keep it if that spot is still there
        ...(where?.spot_id && spots.some(s => s.id === where.spot_id)
            ? [env.DB.prepare("UPDATE whereabouts SET spot_id = ? WHERE id = 1").bind(where.spot_id)] : [])
    ]);
    return listSpots(env);
}

/* Jon says where he is now, until a time; null clears it */
export async function setWhere(env: Env, spotId: string | null, until?: string): Promise<void> {
    if (spotId === null) {
        await env.DB.prepare("DELETE FROM whereabouts WHERE id = 1").run();
        return;
    }
    if (!until || Number.isNaN(Date.parse(until))) {
        throw new HttpError(422, "Say until when, as a time.");
    }
    const spot = await env.DB.prepare("SELECT id FROM spots WHERE id = ?").bind(spotId).first();
    if (!spot) {
        throw new HttpError(404, "There is no such spot.");
    }
    await env.DB.prepare(
        `INSERT INTO whereabouts (id, spot_id, set_at, until) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET spot_id = excluded.spot_id, set_at = excluded.set_at, until = excluded.until`
    ).bind(spotId, new Date().toISOString(), new Date(until).toISOString()).run();
}

/* A spot name as the tree spells it, or a 422 that lists the names */
export async function spotName(env: Env, name: string): Promise<string> {
    const spots = await listSpots(env);
    const spot = byName(spots, name);
    if (!spot) {
        throw new HttpError(422, `"${name}" isn't one of Jon's spots. Use one of: ${spots.map(s => s.name).join(", ")}.`);
    }
    return spot.name;
}

const checkName = (name: unknown): string => {
    if (typeof name !== "string" || !name.trim() || name.trim().length > spotNameMax) {
        throw new HttpError(422, "Name a spot.");
    }
    return name.trim();
};

/* Jon corrects where a to-do can be done */
export async function setTodoWhere(env: Env, id: string, name: unknown): Promise<void> {
    const where = await spotName(env, checkName(name));
    const result = await env.DB.prepare("UPDATE checklist_items SET where_spot = ?, where_by = 'jon' WHERE id = ?").bind(where, id).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "That item is gone.");
    }
}

/* Jon corrects where a thread's ask can be answered; it holds for that ask only, and a new ask takes Claude's guess again */
export async function setAskWhere(env: Env, threadId: string, name: unknown): Promise<void> {
    const where = await spotName(env, checkName(name));
    const result = await env.DB.prepare(
        "UPDATE claude_threads SET ask_where_jon = ?, ask_where_jon_for = ask_text WHERE id = ? AND ask_text IS NOT NULL"
    ).bind(where, threadId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "That thread isn't asking anything now.");
    }
}
