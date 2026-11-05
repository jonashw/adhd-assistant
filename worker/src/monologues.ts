import { Env } from "./env";
import { HttpError, sha256 } from "./http";
import { checkUrl } from "./items";

/* The spoken map (PRD v1.0, E7): something Jon said, kept exactly as sent and split into sentence-sized
   utterances. Later stories read each utterance (moves and topics), plant dashed stakes and replay it.
   Nothing here edits a monologue once stored. */

export const monologueMaxChars = 50_000;
/* A run-on with no punctuation (dictation often has little) is cut into pieces of about this many words */
const maxWordsPerUtterance = 40;
/* The same words from the same thread within this long are one monologue sent twice */
const repeatWindowMs = 60_000;

export type Utterance = {seq: number, text: string, startChar: number, endChar: number};
export type Monologue = {
    id: string,
    source: "claude_thread" | "app",
    threadUrl?: string,
    threadItemId?: string,
    receivedAt: string,
    utterances: Utterance[]
};
export type MonologueSummary = {
    id: string, source: Monologue["source"], threadUrl?: string, receivedAt: string,
    firstLine: string, utteranceCount: number
};

type Span = {start: number, end: number};

/* Long spans with no sentence break are cut at word boundaries, about maxWordsPerUtterance words each */
function cutRunOn(text: string, span: Span): Span[] {
    const words = [...text.slice(span.start, span.end).matchAll(/\S+/g)];
    if (words.length <= maxWordsPerUtterance) {
        return [span];
    }
    const pieces: Span[] = [];
    for (let i = 0; i < words.length; i += maxWordsPerUtterance) {
        const first = words.at(i)!;
        const last = words.at(Math.min(i + maxWordsPerUtterance, words.length) - 1)!;
        pieces.push({start: span.start + first.index!, end: span.start + last.index! + last[0].length});
    }
    return pieces;
}

/* Sentences, in order, with their place in the text. Blank lines and stray whitespace are dropped. */
export function splitUtterances(text: string): Utterance[] {
    const spans: Span[] = [];
    const segmenter = new Intl.Segmenter("en", {granularity: "sentence"});
    for (const {segment, index} of segmenter.segment(text)) {
        // a line break inside a segment also ends a sentence (dictation often has one per thought)
        let offset = 0;
        for (const line of segment.split(/\n+/)) {
            const at = segment.indexOf(line, offset);
            offset = at + line.length;
            const lead = line.length - line.trimStart().length;
            const trimmed = line.trim();
            if (trimmed.length > 0) {
                spans.push(...cutRunOn(text, {start: index + at + lead, end: index + at + lead + trimmed.length}));
            }
        }
    }
    return spans.map((span, seq) => ({seq, text: text.slice(span.start, span.end), startChar: span.start, endChar: span.end}));
}

export type LogMonologue = {text: string, threadUrl?: string, threadItemId?: string};

/* Store what Jon said. Sending the same words again from the same thread within a minute returns the first copy. */
export async function logMonologue(env: Env, input: LogMonologue): Promise<{monologue: Monologue, repeat: boolean}> {
    const text = input.text.trim();
    if (text.length === 0) {
        throw new HttpError(422, "There are no words to log. Send the dictated text exactly as Jon said it.");
    }
    if (text.length > monologueMaxChars) {
        throw new HttpError(422, `That's longer than ${monologueMaxChars} characters. Send it in parts.`);
    }
    const threadUrl = input.threadUrl ? checkUrl(input.threadUrl) : undefined;
    let threadItemId: string | undefined;
    if (input.threadItemId) {
        const item = await env.DB.prepare("SELECT id FROM linked_items WHERE id = ?").bind(input.threadItemId).first();
        if (!item) {
            throw new HttpError(404, "No thread has that thread_id. Leave it out, or check in first.");
        }
        threadItemId = input.threadItemId;
    }

    const textHash = await sha256(text);
    const since = new Date(Date.now() - repeatWindowMs).toISOString();
    const earlier = await env.DB.prepare(
        `SELECT id FROM monologues WHERE text_hash = ? AND received_at >= ?
         AND COALESCE(thread_url, '') = COALESCE(?, '') AND COALESCE(thread_item_id, '') = COALESCE(?, '')
         ORDER BY received_at LIMIT 1`
    ).bind(textHash, since, threadUrl ?? null, threadItemId ?? null).first<{id: string}>();
    if (earlier) {
        return {monologue: (await getMonologue(env, earlier.id))!, repeat: true};
    }

    const utterances = splitUtterances(text);
    const id = crypto.randomUUID();
    const receivedAt = new Date().toISOString();
    await env.DB.batch([
        env.DB.prepare(
            `INSERT INTO monologues (id, source, thread_url, thread_item_id, text, text_hash, received_at)
             VALUES (?, 'claude_thread', ?, ?, ?, ?, ?)`
        ).bind(id, threadUrl ?? null, threadItemId ?? null, text, textHash, receivedAt),
        ...utterances.map(u => env.DB.prepare(
            "INSERT INTO utterances (monologue_id, seq, text, start_char, end_char) VALUES (?, ?, ?, ?, ?)"
        ).bind(id, u.seq, u.text, u.startChar, u.endChar))
    ]);
    return {
        monologue: {id, source: "claude_thread", threadUrl, threadItemId, receivedAt, utterances},
        repeat: false
    };
}

type MonologueRow = {
    id: string, source: Monologue["source"], thread_url: string | null, thread_item_id: string | null, received_at: string
};

export async function getMonologue(env: Env, id: string): Promise<Monologue | null> {
    const row = await env.DB.prepare(
        "SELECT id, source, thread_url, thread_item_id, received_at FROM monologues WHERE id = ?"
    ).bind(id).first<MonologueRow>();
    if (!row) {
        return null;
    }
    const {results} = await env.DB.prepare(
        "SELECT seq, text, start_char, end_char FROM utterances WHERE monologue_id = ? ORDER BY seq"
    ).bind(id).all<{seq: number, text: string, start_char: number, end_char: number}>();
    const monologue: Monologue = {
        id: row.id, source: row.source, receivedAt: row.received_at,
        utterances: results.map(u => ({seq: u.seq, text: u.text, startChar: u.start_char, endChar: u.end_char}))
    };
    if (row.thread_url) monologue.threadUrl = row.thread_url;
    if (row.thread_item_id) monologue.threadItemId = row.thread_item_id;
    return monologue;
}

/* Newest first */
export async function listMonologues(env: Env, limit = 100): Promise<MonologueSummary[]> {
    const {results} = await env.DB.prepare(
        `SELECT m.id, m.source, m.thread_url, m.received_at,
                (SELECT text FROM utterances u WHERE u.monologue_id = m.id ORDER BY seq LIMIT 1) AS first_line,
                (SELECT COUNT(*) FROM utterances u WHERE u.monologue_id = m.id) AS utterance_count
         FROM monologues m ORDER BY m.received_at DESC LIMIT ?`
    ).bind(limit).all<MonologueRow & {first_line: string | null, utterance_count: number}>();
    return results.map(r => {
        const summary: MonologueSummary = {
            id: r.id, source: r.source, receivedAt: r.received_at,
            firstLine: r.first_line ?? "", utteranceCount: r.utterance_count
        };
        if (r.thread_url) summary.threadUrl = r.thread_url;
        return summary;
    });
}
