import { Env } from "./env";
import { HttpError } from "./http";
import { Domain, Focus, FocusScope, asWorkShare, workShares } from "../../src/focus";

/* What Jon is focused on (src/focus.ts): his domains, the mode and focus he set today, and which domain each
   Claude project belongs to. */

type DomainRow = {id: string, name: string, kind: Domain["kind"], position: number};
type FocusRow = {work_share: number, scope_kind: FocusScope["kind"] | null, scope_id: string | null, set_at: string, until: string};

export async function getFocus(env: Env): Promise<{domains: Domain[], now?: Focus}> {
    const [domains, row] = await Promise.all([
        env.DB.prepare("SELECT * FROM domains ORDER BY position, name").all<DomainRow>(),
        env.DB.prepare("SELECT work_share, scope_kind, scope_id, set_at, until FROM focus WHERE id = 1").first<FocusRow>()
    ]);
    const result: {domains: Domain[], now?: Focus} = {
        domains: domains.results.map(d => ({id: d.id, name: d.name, kind: d.kind, position: d.position}))
    };
    if (row) {
        result.now = {workShare: asWorkShare(row.work_share), setAt: row.set_at, until: row.until};
        if (row.scope_kind && row.scope_id) result.now.scope = {kind: row.scope_kind, id: row.scope_id};
    }
    return result;
}

/* Jon sets the mode and focus for today; null clears both */
export async function setFocus(env: Env, input: unknown): Promise<void> {
    if (input === null || (typeof input === "object" && input !== null && (input as {clear?: unknown}).clear === true)) {
        await env.DB.prepare("DELETE FROM focus WHERE id = 1").run();
        return;
    }
    const body = (input ?? {}) as {workShare?: unknown, scope?: unknown, until?: unknown};
    if (!workShares.some(s => s === body.workShare)) {
        throw new HttpError(422, `The work share is one of ${workShares.join(", ")}.`);
    }
    if (typeof body.until !== "string" || Number.isNaN(Date.parse(body.until))) {
        throw new HttpError(422, "Say until when, as a time.");
    }
    let scope: FocusScope | undefined;
    if (body.scope !== undefined && body.scope !== null) {
        const s = body.scope as {kind?: unknown, id?: unknown};
        if ((s.kind !== "domain" && s.kind !== "project") || typeof s.id !== "string" || !s.id) {
            throw new HttpError(422, "A focus is a domain or a project, by id.");
        }
        const table = s.kind === "domain" ? "domains" : "claude_projects";
        if (!await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(s.id).first()) {
            throw new HttpError(404, `There is no such ${s.kind}.`);
        }
        scope = {kind: s.kind, id: s.id};
    }
    await env.DB.prepare(
        `INSERT INTO focus (id, work_share, scope_kind, scope_id, set_at, until) VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET work_share = excluded.work_share, scope_kind = excluded.scope_kind,
             scope_id = excluded.scope_id, set_at = excluded.set_at, until = excluded.until`
    ).bind(body.workShare, scope?.kind ?? null, scope?.id ?? null, new Date().toISOString(), new Date(body.until).toISOString()).run();
}

/* File a Claude project under a domain */
export async function setProjectDomain(env: Env, projectId: string, domainId: unknown): Promise<void> {
    if (typeof domainId !== "string" || !await env.DB.prepare("SELECT id FROM domains WHERE id = ?").bind(domainId).first()) {
        throw new HttpError(422, "Name one of the domains by id.");
    }
    const result = await env.DB.prepare("UPDATE claude_projects SET domain_id = ? WHERE id = ?").bind(domainId, projectId).run();
    if (!result.meta.changes) {
        throw new HttpError(404, "There is no such project on the Claude map.");
    }
}
