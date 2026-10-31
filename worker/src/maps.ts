import { Env } from "./env";
import { HttpError } from "./http";
import { WireLink, WireMap, WireNode, validateMap } from "./model";

type NoteRow = {
    map_id: string, id: string, type: WireNode["type"], label: string, body: string | null,
    status: WireNode["status"] | null, done_at: string | null, hidden: number,
    parent_id: string | null, origin_id: string | null, small: number, interest: number | null
};
type LinkRow = {map_id: string, from_id: string, to_id: string, type: WireLink["type"], label: string | null};

/* Rows back to the app's shape; fields that were never set are left out so exports round-trip */
function toNode(row: NoteRow): WireNode {
    const node: WireNode = {id: row.id, label: row.label, type: row.type};
    if (row.status) node.status = row.status;
    if (row.done_at) node.doneAt = row.done_at;
    if (row.hidden) node.hidden = true;
    if (row.origin_id) node.origin = row.origin_id;
    if (row.body) node.body = row.body;
    if (row.small) node.small = true;
    if (row.interest) node.interest = row.interest;
    return node;
}

function toLinks(notes: NoteRow[], links: LinkRow[]): WireLink[] {
    return [
        ...notes.filter(n => n.parent_id).map(n => ({source: n.id, target: n.parent_id!, type: "PART_OF" as const})),
        ...links.map(l => {
            const link: WireLink = {source: l.from_id, target: l.to_id, type: l.type};
            if (l.label) link.label = l.label;
            return link;
        })
    ];
}

export async function listMaps(env: Env, onlyId?: string): Promise<WireMap[]> {
    const where = onlyId ? " WHERE map_id = ?" : "";
    const bind = (sql: string) => onlyId ? env.DB.prepare(sql).bind(onlyId) : env.DB.prepare(sql);
    const [maps, notes, links] = await env.DB.batch([
        bind(`SELECT id, revision FROM maps${onlyId ? " WHERE id = ?" : ""} ORDER BY created_at`),
        bind(`SELECT * FROM notes${where} ORDER BY position`),
        bind(`SELECT * FROM links${where}`)
    ]);
    const noteRows = notes.results as NoteRow[];
    const linkRows = links.results as LinkRow[];
    return (maps.results as {id: string, revision: number}[]).map(m => {
        const mapNotes = noteRows.filter(n => n.map_id === m.id);
        return {
            id: m.id,
            revision: m.revision,
            nodes: mapNotes.map(toNode),
            links: toLinks(mapNotes, linkRows.filter(l => l.map_id === m.id))
        };
    });
}

/* Saves a whole map. The caller sends the revision it last saw; a newer one on the server means another device saved first. */
export async function saveMap(env: Env, id: string, input: unknown): Promise<{revision: number}> {
    if (!/^[\w-]{1,100}$/.test(id)) {
        throw new HttpError(400, "That map id isn't valid.");
    }
    const {nodes, links} = validateMap(input);
    const sentRevision = (input as {revision?: unknown}).revision ?? null;
    const current = await env.DB.prepare("SELECT revision FROM maps WHERE id = ?").bind(id).first<{revision: number}>();
    if ((current?.revision ?? null) !== sentRevision) {
        const [latest] = current ? await listMaps(env, id) : [];
        throw new HttpError(409, current
            ? "This map changed on another device."
            : "This map was deleted on another device.", {map: latest ?? null});
    }

    const now = new Date().toISOString();
    const revision = (current?.revision ?? 0) + 1;
    const parentOf = new Map(links.filter(l => l.type === "PART_OF").map(l => [l.source, l.target]));
    const statements = [
        current
            ? env.DB.prepare("UPDATE maps SET revision = ?, updated_at = ? WHERE id = ?").bind(revision, now, id)
            : env.DB.prepare("INSERT INTO maps (id, revision, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(id, revision, now, now),
        env.DB.prepare("DELETE FROM notes WHERE map_id = ? AND id NOT IN (SELECT value FROM json_each(?))")
            .bind(id, JSON.stringify(nodes.map(n => n.id))),
        env.DB.prepare("DELETE FROM links WHERE map_id = ?").bind(id),
        // linked items and signals at places that are gone let go of them
        env.DB.prepare("DELETE FROM item_places WHERE map_id = ? AND note_id NOT IN (SELECT value FROM json_each(?))")
            .bind(id, JSON.stringify(nodes.map(n => n.id))),
        env.DB.prepare("UPDATE signals SET cleared_at = ? WHERE map_id = ? AND cleared_at IS NULL AND note_id NOT IN (SELECT value FROM json_each(?))")
            .bind(now, id, JSON.stringify(nodes.map(n => n.id))),
        // origin_id and created_at are written once and never updated
        ...nodes.map((n, position) => env.DB.prepare(
            `INSERT INTO notes (map_id, id, type, label, body, status, done_at, hidden, parent_id, origin_id, small, interest, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (map_id, id) DO UPDATE SET
                type = excluded.type, label = excluded.label, body = excluded.body, status = excluded.status,
                done_at = excluded.done_at, hidden = excluded.hidden, parent_id = excluded.parent_id,
                small = excluded.small, interest = excluded.interest, position = excluded.position, updated_at = excluded.updated_at`
        ).bind(id, n.id, n.type, n.label, n.body ?? null, n.status ?? null, n.doneAt ?? null, n.hidden ? 1 : 0,
            parentOf.get(n.id) ?? null, n.origin ?? null, n.small ? 1 : 0, n.interest ?? null, position, now, now)),
        ...links.filter(l => l.type !== "PART_OF").map(l => env.DB.prepare(
            "INSERT INTO links (map_id, from_id, to_id, type, label) VALUES (?, ?, ?, ?, ?)"
        ).bind(id, l.source, l.target, l.type, l.label ?? null))
    ];
    await env.DB.batch(statements);
    return {revision};
}

export async function deleteMap(env: Env, id: string): Promise<void> {
    await env.DB.prepare("DELETE FROM maps WHERE id = ?").bind(id).run();
}
