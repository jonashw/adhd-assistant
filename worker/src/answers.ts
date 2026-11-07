import { Env } from "./env";
import { HttpError } from "./http";
import { checkUrl } from "./items";

/* The answer checklist (PRD E10, the interviewer): a question becomes a short list of what a full answer needs, and Claude
   ticks the needs off as Jon answers, so he can ramble and still land it. Only Jon's words are read here. Coverage is only
   ever added and the newest row counts, like readings. The wording rules (NFR-12) live in the connector's instructions. */

export const answerModes = ["finish", "expand"] as const;
export const askedBys = ["jon", "claude", "someone"] as const;
export const needStates = ["open", "partly", "covered", "set_aside"] as const;
export type NeedState = typeof needStates[number];

export const needsPerCall = 8;
export const needMaxChars = 60;
export const evidenceMaxChars = 100;
export const questionMaxChars = 500;
/* A finish question keeps the needs it started with; an expand interview may grow to this many */
const expandMaxNeeds = 20;

export type Where = {claudeThreadId?: string, threadItemId?: string, url?: string};
export type NeedInput = {id?: string, text?: string, state?: NeedState, evidence?: string};
export type QuestionInput = {text: string, askedBy: typeof askedBys[number], askedOf?: string, mode: typeof answerModes[number]};

type QuestionRow = {
    id: string, claude_thread_id: string | null, thread_item_id: string | null, thread_url: string | null,
    text: string, asked_by: string, asked_of: string | null, mode: QuestionInput["mode"], created_at: string
};
type NeedRow = {id: string, seq: number, text: string};
type CoverageRow = {need_id: string, state: NeedState, evidence: string | null};

const oneLine = (s: string) => s.trim().replace(/\s+/g, " ");

function cleanText(text: string | undefined, max: number, what: string): string {
    const clean = oneLine(text ?? "");
    if (clean.length === 0 || clean.length > max) {
        throw new HttpError(422, `${what} can have 1 to ${max} characters.`);
    }
    return clean;
}

function cleanEvidence(evidence: string | undefined): string | null {
    if (evidence === undefined) return null;
    const clean = oneLine(evidence);
    if (clean.length > evidenceMaxChars) {
        throw new HttpError(422, `Evidence can have up to ${evidenceMaxChars} characters: a sentence number or a short quote.`);
    }
    return clean || null;
}

function checkCount(n: number) {
    if (n > needsPerCall) {
        throw new HttpError(422, `Send up to ${needsPerCall} needs at a time.`);
    }
}

async function cleanWhere(env: Env, where: Where): Promise<{claudeThreadId: string | null, threadItemId: string | null, url: string | null}> {
    const claudeThreadId = where.claudeThreadId?.trim() || null;
    const url = where.url?.trim() ? checkUrl(where.url) : null;
    let threadItemId: string | null = null;
    if (where.threadItemId) {
        const item = await env.DB.prepare("SELECT id FROM linked_items WHERE id = ?").bind(where.threadItemId).first();
        if (!item) {
            throw new HttpError(404, "No thread has that thread_id. Leave it out, or check in first.");
        }
        threadItemId = where.threadItemId;
    }
    if (!claudeThreadId && !threadItemId && !url) {
        throw new HttpError(422, "Say which thread this is: claude_thread_id (cmsg_... in a Claude project), thread_id from check_in, or this thread's link.");
    }
    return {claudeThreadId, threadItemId, url};
}

/* Start a checklist for a new question. Nothing is stored unless every need is valid. */
export async function startChecklist(env: Env, where: Where, question: QuestionInput, needs: NeedInput[]) {
    if (needs.length === 0) {
        throw new HttpError(422, `Give the question 1 to ${needsPerCall} needs.`);
    }
    checkCount(needs.length);
    const text = cleanText(question.text, questionMaxChars, "The question");
    const askedOf = question.askedOf?.trim() ? cleanText(question.askedOf, 120, "asked_of") : null;
    const clean = needs.map(n => {
        if (n.id) {
            throw new HttpError(422, "A new question's needs have no ids yet; send just their text.");
        }
        return {text: cleanText(n.text, needMaxChars, "Each need"), state: n.state, evidence: cleanEvidence(n.evidence)};
    });
    const thread = await cleanWhere(env, where);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const needIds = clean.map(() => crypto.randomUUID());
    await env.DB.batch([
        env.DB.prepare(
            `INSERT INTO answer_questions (id, claude_thread_id, thread_item_id, thread_url, text, asked_by, asked_of, mode, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, thread.claudeThreadId, thread.threadItemId, thread.url, text, question.askedBy, askedOf, question.mode, now),
        ...clean.map((n, seq) => env.DB.prepare("INSERT INTO answer_needs (id, question_id, seq, text, added_at) VALUES (?, ?, ?, ?, ?)")
            .bind(needIds[seq], id, seq, n.text, now)),
        ...clean.flatMap((n, i) => n.state && n.state !== "open"
            ? [env.DB.prepare("INSERT INTO answer_coverage (need_id, state, evidence, marked_by, at) VALUES (?, ?, ?, 'claude', ?)")
                .bind(needIds[i], n.state, n.evidence, now)]
            : [])
    ]);
    return readChecklist(env, id);
}

/* Mark needs, or add new ones to an expand question. With no needs it just reads the checklist back. */
export async function updateChecklist(env: Env, questionId: string, needs: NeedInput[]) {
    checkCount(needs.length);
    const question = await env.DB.prepare("SELECT * FROM answer_questions WHERE id = ?").bind(questionId).first<QuestionRow>();
    if (!question) {
        throw new HttpError(404, "No question has that question_id. Start one by sending the question instead.");
    }
    const existing = (await env.DB.prepare("SELECT id, seq, text FROM answer_needs WHERE question_id = ? ORDER BY seq")
        .bind(questionId).all<NeedRow>()).results;
    const latest = await latestCoverage(env, existing.map(n => n.id));
    const byId = new Map(existing.map(n => [n.id, n]));

    const marks: {needId: string, state: NeedState, evidence: string | null}[] = [];
    const added: {text: string, state?: NeedState, evidence: string | null}[] = [];
    for (const n of needs) {
        if (n.id) {
            if (!byId.has(n.id)) {
                throw new HttpError(404, `This question has no need with id ${n.id}.`);
            }
            if (!n.state) {
                throw new HttpError(422, "To mark a need, send its id and its state (open, partly, covered or set_aside).");
            }
            marks.push({needId: n.id, state: n.state, evidence: cleanEvidence(n.evidence)});
        } else {
            added.push({text: cleanText(n.text, needMaxChars, "Each need"), state: n.state, evidence: cleanEvidence(n.evidence)});
        }
    }
    if (added.length > 0 && question.mode === "finish") {
        throw new HttpError(422, "A finish question keeps the needs it started with. If the question itself changed, start a new one.");
    }
    if (existing.length + added.length > expandMaxNeeds) {
        throw new HttpError(422, `An expand question can hold up to ${expandMaxNeeds} needs.`);
    }
    // the same words as a need already there are not added twice
    const known = new Set(existing.map(n => n.text.toLowerCase()));
    const fresh = added.filter(a => {
        const key = a.text.toLowerCase();
        if (known.has(key)) return false;
        known.add(key);
        return true;
    });

    const now = new Date().toISOString();
    const freshIds = fresh.map(() => crypto.randomUUID());
    const nextSeq = existing.length > 0 ? existing[existing.length - 1].seq + 1 : 0;
    // a mark that repeats the newest state and evidence adds nothing, so repeating a call is safe
    const changed = marks.filter(m => {
        const current = latest.get(m.needId);
        return !(current ? current.state === m.state && (current.evidence ?? null) === m.evidence : m.state === "open" && m.evidence === null);
    });
    const statements = [
        ...fresh.map((a, i) => env.DB.prepare("INSERT INTO answer_needs (id, question_id, seq, text, added_at) VALUES (?, ?, ?, ?, ?)")
            .bind(freshIds[i], questionId, nextSeq + i, a.text, now)),
        ...fresh.flatMap((a, i) => a.state && a.state !== "open"
            ? [env.DB.prepare("INSERT INTO answer_coverage (need_id, state, evidence, marked_by, at) VALUES (?, ?, ?, 'claude', ?)")
                .bind(freshIds[i], a.state, a.evidence, now)]
            : []),
        ...changed.map(m => env.DB.prepare("INSERT INTO answer_coverage (need_id, state, evidence, marked_by, at) VALUES (?, ?, ?, 'claude', ?)")
            .bind(m.needId, m.state, m.evidence, now))
    ];
    if (statements.length > 0) {
        await env.DB.batch(statements);
    }
    return readChecklist(env, questionId);
}

async function latestCoverage(env: Env, needIds: string[]): Promise<Map<string, CoverageRow>> {
    const latest = new Map<string, CoverageRow>();
    if (needIds.length === 0) return latest;
    const rows = (await env.DB.prepare(
        "SELECT need_id, state, evidence FROM answer_coverage WHERE need_id IN (SELECT value FROM json_each(?)) ORDER BY rowid"
    ).bind(JSON.stringify(needIds)).all<CoverageRow>()).results;
    for (const row of rows) {
        latest.set(row.need_id, row);
    }
    return latest;
}

export async function readChecklist(env: Env, questionId: string) {
    const question = await env.DB.prepare("SELECT * FROM answer_questions WHERE id = ?").bind(questionId).first<QuestionRow>();
    if (!question) {
        throw new HttpError(404, "No question has that question_id.");
    }
    const needs = (await env.DB.prepare("SELECT id, seq, text FROM answer_needs WHERE question_id = ? ORDER BY seq")
        .bind(questionId).all<NeedRow>()).results;
    const latest = await latestCoverage(env, needs.map(n => n.id));
    const listed = needs.map(n => {
        const c = latest.get(n.id);
        return {id: n.id, text: n.text, state: c?.state ?? "open" as NeedState, ...(c?.evidence ? {evidence: c.evidence} : {})};
    });
    const counted = listed.filter(n => n.state !== "set_aside");
    const covered = counted.filter(n => n.state === "covered").length;
    const open = listed.filter(n => n.state === "open" || n.state === "partly");
    return {
        question_id: question.id,
        question: question.text,
        mode: question.mode,
        needs: listed,
        still_open: open.map(n => n.text),
        covered: `${covered} of ${counted.length}`,
        next: open.length > 0
            ? "Keep the still-open needs at the end of your reply and offer one of them to keep going on. Say \"still open\", never \"missing\"; no scores or percents."
            : question.mode === "finish"
                ? "Everything is covered. Say so once, lightly, and stop showing the list; Jon can still keep going."
                : "Every facet so far is covered. Don't wrap up: Jon decides when he has dug deep enough. Add a new facet if one comes up."
    };
}
