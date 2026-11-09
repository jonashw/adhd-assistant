import Anthropic from "@anthropic-ai/sdk";
import { Env } from "./env";
import { HttpError } from "./http";
import { readChecklist, startChecklist, NeedState, answerModes, needMaxChars, needsPerCall } from "./answers";
import { keywordIn, moves } from "./readings";
import { Cleaned, Coverage, editOps, ModelAnswer, settleAnswer, StretchRow } from "./talkSettle";
import { ring } from "./live";
import {
    applyStep, emptyTree, foldTree, nodeKinds, rabbitHoleNow, ReadStep, resolve, thinTopics, TreeEdit, treeForPrompt, TreeState
} from "./talkTree";

/* The live screen's read (E7 phase 2, story 1). Each stretch the phone commits at a pause is stored raw, then one Claude
   Haiku call reads it against the idea tree so far and the open needs, and answers with the cleaned text, a few tree
   edits and coverage for the answer checklist. Everything is appended to talk_reads with its token counts; the tree is
   the fold of every read's edits (talkTree.ts). Opus is kept for final passes, not built here. */

const model = "claude-haiku-5-5";
export const stretchMaxChars = 4000;
const labelMaxChars = 120;
/* stretches read in one call when several are waiting (a failed read, or talk faster than reads) */
const maxStretchesPerRead = 8;
/* a read holds the talk this long at most; a crashed read lets go when it passes */
const leaseMs = 60_000;
/* Haiku 5.5, per million tokens (published price, cached 2026-10): for the cost line on screen, an estimate */
const pricePerMillion = {input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125};


type TalkRow = {id: string, started_at: string, source: "typed" | "replay" | "phone", label: string | null, reading_until: string | null};
type ReadRow = {
    id: number, first_seq: number, last_seq: number, model: string, outcome: "read" | "no_key" | "failed", note: string | null,
    cleaned_json: string | null, edits_json: string | null, here: string | null, coverage_json: string | null, going_deep: number,
    input_tokens: number | null, output_tokens: number | null, cache_read_tokens: number | null, cache_write_tokens: number | null,
    took_ms: number | null, made_at: string
};

const oneLine = (s: string) => s.trim().replace(/\s+/g, " ");

async function talkRow(env: Env, id: string): Promise<TalkRow> {
    const row = await env.DB.prepare("SELECT * FROM talks WHERE id = ?").bind(id).first<TalkRow>();
    if (!row) throw new HttpError(404, "No such talk.");
    return row;
}

export async function startTalk(env: Env, input: unknown) {
    const body = (input ?? {}) as {source?: unknown, label?: unknown};
    const source = body.source === "replay" || body.source === "phone" ? body.source : "typed";
    const label = typeof body.label === "string" && body.label.trim() ? oneLine(body.label).slice(0, labelMaxChars) : null;
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO talks (id, started_at, source, label) VALUES (?, ?, ?, ?)")
        .bind(id, new Date().toISOString(), source, label).run();
    return {id};
}

export async function listTalks(env: Env) {
    const {results} = await env.DB.prepare(
        `SELECT t.id, t.started_at, t.source, t.label,
                (SELECT COUNT(*) FROM talk_stretches s WHERE s.talk_id = t.id) AS stretches,
                (SELECT raw_text FROM talk_stretches s WHERE s.talk_id = t.id ORDER BY seq LIMIT 1) AS first_words
         FROM talks t ORDER BY t.started_at DESC LIMIT 50`
    ).all<{id: string, started_at: string, source: string, label: string | null, stretches: number, first_words: string | null}>();
    return results.map(r => ({
        id: r.id, startedAt: r.started_at, source: r.source, label: r.label, stretches: r.stretches,
        firstWords: r.first_words ? r.first_words.slice(0, 120) : null
    }));
}

/* Store one committed stretch. The read runs after the answer, so the screen shows it grey at once. */
export async function addStretch(env: Env, talkId: string, input: unknown): Promise<{seq: number}> {
    await talkRow(env, talkId);
    const body = (input ?? {}) as {text?: unknown, saidAtMs?: unknown};
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new HttpError(422, "There are no words in that stretch.");
    if (text.length > stretchMaxChars) throw new HttpError(422, `A stretch can have up to ${stretchMaxChars} characters.`);
    const now = new Date();
    const last = await env.DB.prepare("SELECT seq, said_at_ms FROM talk_stretches WHERE talk_id = ? ORDER BY seq DESC LIMIT 1")
        .bind(talkId).first<{seq: number, said_at_ms: number}>();
    const started = new Date((await talkRow(env, talkId)).started_at).getTime();
    const saidAtMs = typeof body.saidAtMs === "number" && Number.isFinite(body.saidAtMs) && body.saidAtMs >= 0
        ? Math.round(body.saidAtMs)
        : Math.max(0, now.getTime() - started);
    const seq = (last?.seq ?? -1) + 1;
    await env.DB.prepare("INSERT INTO talk_stretches (talk_id, seq, raw_text, said_at_ms, received_at) VALUES (?, ?, ?, ?, ?)")
        .bind(talkId, seq, text, Math.max(saidAtMs, last?.said_at_ms ?? 0), now.toISOString()).run();
    return {seq};
}

/* Pick an existing answer_checklist question for this talk, or start one here */
export async function addTalkQuestion(env: Env, talkId: string, origin: string, input: unknown) {
    await talkRow(env, talkId);
    const body = (input ?? {}) as {questionId?: unknown, text?: unknown, mode?: unknown, needs?: unknown};
    let questionId: string;
    if (typeof body.questionId === "string") {
        const found = await env.DB.prepare("SELECT id FROM answer_questions WHERE id = ?").bind(body.questionId).first();
        if (!found) throw new HttpError(404, "No question has that id.");
        questionId = body.questionId;
    } else {
        const mode = answerModes.includes(body.mode as typeof answerModes[number]) ? body.mode as typeof answerModes[number] : "finish";
        const needs = Array.isArray(body.needs) ? body.needs.filter((n): n is string => typeof n === "string" && n.trim().length > 0) : [];
        if (needs.length === 0) throw new HttpError(422, `Give the question 1 to ${needsPerCall} needs, up to ${needMaxChars} characters each.`);
        const started = await startChecklist(env, {url: `${origin}/talk/${encodeURIComponent(talkId)}`},
            {text: typeof body.text === "string" ? body.text : "", askedBy: "jon", askedOf: "Jon", mode},
            needs.map(text => ({text})));
        questionId = started.question_id;
    }
    await env.DB.prepare("INSERT OR IGNORE INTO talk_questions (talk_id, question_id, added_at) VALUES (?, ?, ?)")
        .bind(talkId, questionId, new Date().toISOString()).run();
    return {questionId};
}

export async function removeTalkQuestion(env: Env, talkId: string, questionId: string) {
    await env.DB.prepare("DELETE FROM talk_questions WHERE talk_id = ? AND question_id = ?").bind(talkId, questionId).run();
}

/* Recent questions from any thread, to pick one for a talk */
export async function recentQuestions(env: Env) {
    const {results} = await env.DB.prepare(
        "SELECT id, text, mode, created_at FROM answer_questions ORDER BY created_at DESC LIMIT 30"
    ).all<{id: string, text: string, mode: string, created_at: string}>();
    return results.map(r => ({id: r.id, text: r.text, mode: r.mode, createdAt: r.created_at}));
}

/* ---------- the read ---------- */

const system = `You listen to someone thinking out loud and keep a live tree of their ideas, so they can ramble freely and still see the shape of what they said and what is still open.

Each turn you get the tree so far (one node per line: id, [kind], text, indented under its parent; "<- you are here" marks where the speaker is), the questions they are answering with each need's id and state, and one or more new stretches of dictation, numbered.

Answer with:

1. stretches: for every new stretch, in order:
   - text: the stretch cleaned up. Fix punctuation and capitals (the recogniser capitalises words mid-sentence and adds wrong question marks). When they say "scratch that", drop it and the words it cancels. Keep their words otherwise; don't summarise or reword. Keep air quotes as quotes.
   - move: how it moves from where they were. stay (same topic, same level; most stretches), drill (deeper into a part or detail of the current topic), surface (back up toward the bigger picture), sideways (a related topic at the same level), jump (an unrelated new topic), return (back to an earlier topic), ask (a question to a helper). A "keyword" hint after a stretch is what they literally said; follow it.

2. edits: a few small changes to the tree, usually one to three per stretch, never a rewrite.
   - add: a new node. node = a new ref you make up ("new1", "new2"...); parent = an existing id, a new ref from this answer, or "root" for a top-level topic; kind = topic (a subject they talk about), idea (one point they make), example, or loose_end (something they said they'd come back to); text = one short line, at most 12 words, in their words where possible.
   - rename: node = an existing id; text = its better name. Use it when later words make a name clearer.
   - move: node = an existing id; parent = its new parent (or "root"). Only when they say something belongs elsewhere ("that's really part of the pricing thing").
   - merge: node = an existing id; parent = the node it is the same as. Only for true duplicates.
   Leave kind and text empty ("") where an op doesn't use them.
   How moves become edits: stay adds an idea under the current topic; drill adds a child topic under the current one and goes there; surface goes up a level and adds there; sideways adds a sibling topic; jump starts a new top-level topic; return goes back to the earlier topic and adds to it; ask adds nothing to the tree. Filler, false starts and talk about the recording itself ("testing", "I'm going to stop now") add nothing.
   Ideas go under topics, not at the root. Prefer adding under an existing topic to making a near-duplicate one.

3. here: the node they are on after these stretches (an existing id or a new ref).

4. coverage: needs these new stretches cover, judged only from the speaker's own words. need = the need id; state = partly or covered; nodes = the node ids or new refs that hold the answer; quote = their words, at most 15. Only list needs these stretches actually speak to; never mark a need open; leave a need out if unsure. Empty when there are no questions.

5. going_deep: true only if they say they are deliberately going deep or down a rabbit hole.`;

const schema = {
    type: "object",
    properties: {
        stretches: {
            type: "array",
            items: {
                type: "object",
                properties: {seq: {type: "integer"}, text: {type: "string"}, move: {type: "string", enum: [...moves]}},
                required: ["seq", "text", "move"],
                additionalProperties: false
            }
        },
        edits: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    op: {type: "string", enum: [...editOps]},
                    node: {type: "string"},
                    parent: {type: "string"},
                    kind: {type: "string", enum: [...nodeKinds, ""]},
                    text: {type: "string"}
                },
                required: ["op", "node", "parent", "kind", "text"],
                additionalProperties: false
            }
        },
        here: {type: "string"},
        coverage: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    need: {type: "string"},
                    state: {type: "string", enum: ["partly", "covered"]},
                    nodes: {type: "array", items: {type: "string"}},
                    quote: {type: "string"}
                },
                required: ["need", "state", "nodes", "quote"],
                additionalProperties: false
            }
        },
        going_deep: {type: "boolean"}
    },
    required: ["stretches", "edits", "here", "coverage", "going_deep"],
    additionalProperties: false
};

export class TalkReadError extends Error {}

type QuestionView = Awaited<ReturnType<typeof readChecklist>>;

/* Needs get short names (q1.2) in the prompt; long ids would cost tokens and invite typos */
function needsForPrompt(questions: QuestionView[]): {text: string, byShort: Map<string, {questionId: string, needId: string, state: NeedState}>} {
    const byShort = new Map<string, {questionId: string, needId: string, state: NeedState}>();
    if (questions.length === 0) return {text: "(none yet)", byShort};
    const lines = questions.flatMap((q, qi) => [
        `Q${qi + 1} (${q.mode}): ${q.question}`,
        ...q.needs.map((n, ni) => {
            const short = `q${qi + 1}.${ni + 1}`;
            byShort.set(short, {questionId: q.question_id, needId: n.id, state: n.state});
            return `  ${short} [${n.state.replace("_", " ")}] ${n.text}`;
        })
    ]);
    return {text: lines.join("\n"), byShort};
}

async function askHaiku(apiKey: string, prompt: string, baseURL?: string) {
    const client = new Anthropic({apiKey, maxRetries: 2, timeout: 60_000, ...(baseURL ? {baseURL} : {})});
    const started = Date.now();
    const response = await client.messages.create({
        model,
        max_tokens: 4000,
        output_config: {effort: "low", format: {type: "json_schema", schema}},
        system: [{type: "text", text: system, cache_control: {type: "ephemeral"}}],
        messages: [{role: "user", content: prompt}]
    });
    const usage = response.usage;
    const tokens = {
        input: usage.input_tokens, output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0,
        tookMs: Date.now() - started
    };
    if (response.stop_reason === "refusal") throw Object.assign(new TalkReadError("Claude declined to read this stretch."), {tokens});
    if (response.stop_reason === "max_tokens") throw Object.assign(new TalkReadError("The read was cut off."), {tokens});
    const block = response.content.find(b => b.type === "text");
    if (!block || block.type !== "text") throw Object.assign(new TalkReadError("Claude's answer had no reading in it."), {tokens});
    try {
        return {answer: JSON.parse(block.text) as ModelAnswer, tokens};
    } catch {
        throw Object.assign(new TalkReadError("Claude's answer wasn't a reading."), {tokens});
    }
}

async function loadSteps(env: Env, talkId: string) {
    const reads = (await env.DB.prepare("SELECT * FROM talk_reads WHERE talk_id = ? ORDER BY id").bind(talkId).all<ReadRow>()).results;
    const stretches = (await env.DB.prepare("SELECT seq, raw_text, said_at_ms, received_at FROM talk_stretches WHERE talk_id = ? ORDER BY seq")
        .bind(talkId).all<StretchRow>()).results;
    const atMs = new Map(stretches.map(s => [s.seq, s.said_at_ms]));
    const questionIds = (await env.DB.prepare("SELECT question_id FROM talk_questions WHERE talk_id = ? ORDER BY added_at")
        .bind(talkId).all<{question_id: string}>()).results.map(r => r.question_id);
    const steps: ReadStep[] = reads.filter(r => r.outcome === "read").map(r => ({
        lastSeq: r.last_seq,
        atMs: atMs.get(r.last_seq) ?? 0,
        edits: JSON.parse(r.edits_json ?? "[]") as TreeEdit[],
        here: r.here,
        goingDeep: r.going_deep === 1,
        tiedNodes: (JSON.parse(r.coverage_json ?? "[]") as Coverage[]).flatMap(c => c.nodes),
        hasQuestions: questionIds.length > 0
    }));
    return {reads, stretches, steps, questionIds};
}

const nodeNumber = (state: TreeState) => {
    let max = 0;
    for (const id of [...state.nodes.keys(), ...state.mergedInto.keys()]) {
        const n = Number(id.slice(1));
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max + 1;
};

async function recordRead(env: Env, talkId: string, batch: StretchRow[], row: Partial<Omit<ReadRow, "id" | "first_seq" | "last_seq" | "made_at">> & {outcome: ReadRow["outcome"]}) {
    await env.DB.prepare(
        `INSERT INTO talk_reads (talk_id, first_seq, last_seq, model, outcome, note, cleaned_json, edits_json, here, coverage_json, going_deep,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, took_ms, made_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        talkId, batch[0].seq, batch[batch.length - 1].seq, row.model ?? model, row.outcome, row.note ?? null,
        row.cleaned_json ?? null, row.edits_json ?? null, row.here ?? null, row.coverage_json ?? null, row.going_deep ?? 0,
        row.input_tokens ?? null, row.output_tokens ?? null, row.cache_read_tokens ?? null, row.cache_write_tokens ?? null,
        row.took_ms ?? null, new Date().toISOString()
    ).run();
}

/* Reads the stretches not read yet, oldest first. Returns false when there was nothing to do or it couldn't read. */
async function readOnce(env: Env, talkId: string): Promise<boolean> {
    const {reads, stretches, steps, questionIds} = await loadSteps(env, talkId);
    const readUpTo = reads.filter(r => r.outcome === "read").reduce((m, r) => Math.max(m, r.last_seq), -1);
    const batch = stretches.filter(s => s.seq > readUpTo).slice(0, maxStretchesPerRead);
    if (batch.length === 0) return false;
    if (!env.ANTHROPIC_API_KEY) {
        const last = reads.at(-1);
        if (!(last?.outcome === "no_key" && last.last_seq === batch[batch.length - 1].seq)) {
            await recordRead(env, talkId, batch, {outcome: "no_key", note: "No ANTHROPIC_API_KEY is set yet."});
        }
        return false;
    }
    const state = foldTree(steps);
    const questions = await Promise.all(questionIds.map(id => readChecklist(env, id)));
    const needs = needsForPrompt(questions);
    const lines = batch.map(s => {
        const keyword = keywordIn(s.raw_text);
        return `${s.seq}. ${s.raw_text}${keyword ? `   (keyword: ${keyword.move}, "${keyword.cue}")` : ""}`;
    });
    const prompt = `<tree>\n${treeForPrompt(state)}\n</tree>\n\n<questions>\n${needs.text}\n</questions>\n\n<new_stretches>\n${lines.join("\n")}\n</new_stretches>`;
    let asked: Awaited<ReturnType<typeof askHaiku>>;
    try {
        asked = await askHaiku(env.ANTHROPIC_API_KEY, prompt, env.ANTHROPIC_BASE_URL);
    } catch (e) {
        const note = e instanceof TalkReadError ? e.message
            : e instanceof Anthropic.AuthenticationError ? "The ANTHROPIC_API_KEY was refused."
            : e instanceof Anthropic.RateLimitError ? "Claude is busy (rate limited). The next stretch tries again."
            : e instanceof Anthropic.APIError ? `Claude's API said ${e.status ?? "no status"}: ${e.message}`
            : "Couldn't reach Claude.";
        const tokens = (e as {tokens?: {input: number, output: number, cacheRead: number, cacheWrite: number, tookMs: number}}).tokens;
        console.error("talk read failed", talkId, e);
        await recordRead(env, talkId, batch, {
            outcome: "failed", note, input_tokens: tokens?.input, output_tokens: tokens?.output,
            cache_read_tokens: tokens?.cacheRead, cache_write_tokens: tokens?.cacheWrite, took_ms: tokens?.tookMs
        });
        return false;
    }
    const settled = settleAnswer(state, asked.answer, batch, nodeNumber(state), batch[batch.length - 1].said_at_ms, needs.byShort);
    await recordRead(env, talkId, batch, {
        outcome: "read",
        note: settled.dropped > 0 ? `${settled.dropped} edit${settled.dropped === 1 ? "" : "s"} pointed nowhere and were left out.` : null,
        cleaned_json: JSON.stringify(settled.cleaned),
        edits_json: JSON.stringify(settled.edits),
        here: settled.here,
        coverage_json: JSON.stringify(settled.coverage),
        going_deep: settled.goingDeep ? 1 : 0,
        input_tokens: asked.tokens.input, output_tokens: asked.tokens.output,
        cache_read_tokens: asked.tokens.cacheRead, cache_write_tokens: asked.tokens.cacheWrite, took_ms: asked.tokens.tookMs
    });
    if (settled.coverage.length > 0) {
        const at = new Date().toISOString();
        await env.DB.batch(settled.coverage.map(c => env.DB.prepare(
            "INSERT INTO answer_coverage (need_id, state, evidence, marked_by, at) VALUES (?, ?, ?, 'reading', ?)"
        ).bind(c.needId, c.state, c.quote || null, at)));
    }
    return true;
}

/* Reads until nothing is waiting. Only one read runs per talk; a stretch that lands meanwhile is taken on the next pass. */
export async function readTalk(env: Env, talkId: string): Promise<void> {
    for (let round = 0; round < 6; round++) {
        const now = Date.now();
        const claimed = await env.DB.prepare(
            "UPDATE talks SET reading_until = ? WHERE id = ? AND (reading_until IS NULL OR reading_until < ?)"
        ).bind(new Date(now + leaseMs).toISOString(), talkId, new Date(now).toISOString()).run();
        if ((claimed.meta.changes ?? 0) === 0) return;
        let progressed = false;
        try {
            for (let pass = 0; pass < 10; pass++) {
                const did = await readOnce(env, talkId);
                await ring(env, [{topic: "talks", mapId: talkId}]);
                if (!did) break;
                progressed = true;
            }
        } finally {
            await env.DB.prepare("UPDATE talks SET reading_until = NULL WHERE id = ?").bind(talkId).run();
        }
        // a stretch that arrived just before letting go found the talk held; look once more
        const waiting = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM talk_stretches WHERE talk_id = ? AND seq > COALESCE(
                (SELECT MAX(last_seq) FROM talk_reads WHERE talk_id = ? AND outcome = 'read'), -1)`
        ).bind(talkId, talkId).first<{n: number}>();
        if (!progressed || !waiting || waiting.n === 0) return;
    }
}

/* ---------- what the screen shows ---------- */

export async function getTalk(env: Env, talkId: string) {
    const talk = await talkRow(env, talkId);
    const {reads, stretches, steps, questionIds} = await loadSteps(env, talkId);
    let state = emptyTree();
    for (const step of steps) state = applyStep(state, step);
    const lastSeq = stretches.at(-1)?.seq ?? -1;

    const cleanedBySeq = new Map<number, Cleaned>();
    for (const r of reads) {
        if (r.outcome !== "read") continue;
        for (const c of JSON.parse(r.cleaned_json ?? "[]") as Cleaned[]) cleanedBySeq.set(c.seq, c);
    }
    const questions = await Promise.all(questionIds.map(id => readChecklist(env, id)));
    // which nodes answer which need, from every read's coverage
    const nodesByNeed = new Map<string, Set<string>>();
    for (const r of reads) {
        for (const c of JSON.parse(r.coverage_json ?? "[]") as Coverage[]) {
            const set = nodesByNeed.get(c.needId) ?? new Set<string>();
            c.nodes.forEach(n => {
                const id = resolve(state, n);
                if (id && state.nodes.has(id)) set.add(id);
            });
            nodesByNeed.set(c.needId, set);
        }
    }
    const lastRead = [...reads].reverse().find(r => r.outcome === "read");
    const lastTry = reads.at(-1);
    const readUpTo = lastRead?.last_seq ?? -1;
    const changed = new Set<string>();
    if (lastRead) {
        for (const e of JSON.parse(lastRead.edits_json ?? "[]") as TreeEdit[]) {
            const id = resolve(state, e.op === "merge" ? e.into : e.id);
            if (id) changed.add(id);
        }
    }
    const rabbit = rabbitHoleNow(state);
    const lastAtMs = stretches.at(-1)?.said_at_ms ?? 0;
    const totals = reads.reduce((t, r) => ({
        reads: t.reads + (r.outcome === "no_key" ? 0 : 1),
        input: t.input + (r.input_tokens ?? 0),
        output: t.output + (r.output_tokens ?? 0),
        cacheRead: t.cacheRead + (r.cache_read_tokens ?? 0),
        cacheWrite: t.cacheWrite + (r.cache_write_tokens ?? 0)
    }), {reads: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0});
    const dollars = (totals.input * pricePerMillion.input + totals.output * pricePerMillion.output
        + totals.cacheRead * pricePerMillion.cacheRead + totals.cacheWrite * pricePerMillion.cacheWrite) / 1_000_000;

    return {
        talk: {id: talk.id, startedAt: talk.started_at, source: talk.source, label: talk.label},
        stretches: stretches.map(s => {
            const c = cleanedBySeq.get(s.seq);
            return {seq: s.seq, raw: s.raw_text, saidAtMs: s.said_at_ms, read: s.seq <= readUpTo, ...(c ? {text: c.text, move: c.move, ...(c.cue ? {cue: c.cue} : {})} : {})};
        }),
        nodes: [...state.nodes.values()].map(n => ({
            id: n.id, parent: n.parent, kind: n.kind, text: n.text, bornSeq: n.bornSeq,
            ...(changed.has(n.id) && lastRead ? {glowSeq: lastRead.last_seq} : {})
        })),
        here: state.here,
        thin: thinTopics(state, lastSeq),
        rabbitHole: rabbit ? {...rabbit, minutes: Math.max(0, Math.round((lastAtMs - rabbit.sinceAtMs) / 60_000))} : null,
        questions: questions.map(q => ({
            id: q.question_id, text: q.question, mode: q.mode, covered: q.covered,
            needs: q.needs.map(n => ({...n, nodes: [...nodesByNeed.get(n.id) ?? []]}))
        })),
        reading: {
            readUpTo,
            busy: !!talk.reading_until && new Date(talk.reading_until).getTime() > Date.now(),
            ...(lastTry && lastTry.outcome !== "read" && lastTry.last_seq > readUpTo ? {note: lastTry.note ?? "The last read didn't land."} : {})
        },
        usage: {...totals, dollars: Math.round(dollars * 10000) / 10000, model}
    };
}
