import Anthropic from "@anthropic-ai/sdk";
import { Env } from "./env";
import type { Utterance } from "./monologues";

/* The spoken map (PRD v1.0, E7.S2, FR-32): every utterance gets a reading, a move, a topic, a depth and a
   confidence. Claude reads the whole monologue in one call, so each sentence is read with what came before
   and after it. Keywords Jon says always win over the model. Readings are only ever added; the newest counts. */

export const moves = ["stay", "drill", "surface", "sideways", "jump", "return", "ask"] as const;
export type Move = typeof moves[number];

export type Reading = {
    seq: number,
    move: Move,
    topic: string,
    depth: number,
    confidence: number,
    model: string,
    cue?: string,
    madeAt: string
};

/* "read": every utterance has a reading. "waiting": not yet (no key, or the last try failed). */
export type ReadState = {state: "read" | "waiting", note?: string};

/* A whole monologue arrives at once from a Claude thread, so this is the stronger whole-text read the PRD
   gives the end pass. The live screen (phase 2) adds a fast per-sentence read. */
const model = "claude-opus-5-5";
const maxTopicChars = 60;

/* Words Jon says that decide the move, whatever the model thinks. The first match in a sentence wins. */
const keywords: {move: Move, pattern: RegExp}[] = [
    {move: "jump", pattern: /\b(new topic|different topic|change of subject|changing (the )?subject|switching gears|totally unrelated|unrelated,)/i},
    {move: "return", pattern: /\b((going |coming |get(ting)? )?back to|where was i|as i was saying)\b/i},
    {move: "drill", pattern: /\b(drill(ing)? (down|into)|dig(ging)? (in|into)|zoom(ing)? in|in more detail|going deeper)\b/i},
    {move: "surface", pattern: /\b(big(ger)? picture|zoom(ing)? out|step(ping)? back|high level)\b/i},
    {move: "sideways", pattern: /\b(on a related note|relatedly|tangent|side note|while i'm on)\b/i},
    {move: "ask", pattern: /\b(question for (you|the crew)|hey claude|crew,)/i}
];

export function keywordIn(text: string): {move: Move, cue: string} | undefined {
    let best: {move: Move, cue: string, at: number} | undefined;
    for (const {move, pattern} of keywords) {
        const match = pattern.exec(text);
        if (match && (!best || match.index < best.at)) {
            best = {move, cue: match[0].replace(/,$/, ""), at: match.index};
        }
    }
    return best && {move: best.move, cue: best.cue};
}

const system = `You read a monologue someone dictated, one sentence at a time, and say how each sentence moves through their topics. It becomes a map they can replay.

For every sentence, give:
- move: how it moves from the sentence before it.
  - stay: carries on with the current topic at the same level (most sentences).
  - drill: goes deeper into the current topic (a detail, a part, a step of it). Getting absorbed in detail counts.
  - surface: comes back up from detail toward the bigger picture of the same topic.
  - sideways: a different topic that is related, at the same level (a sibling).
  - jump: a new topic unrelated to the current one.
  - return: back to a topic from earlier in this monologue (use that topic's exact name again).
  - ask: a question, to themselves or to a helper.
  The first sentence is a jump at depth 0.
- topic: a short name for what the sentence is about, 2 to 6 words, in the speaker's own words where possible. Spell it exactly the same every time the same topic comes up. When unsure whether the topic changed, keep the current one.
- depth: 0 is the monologue's top level. stay and sideways keep the depth, drill goes one deeper, surface one shallower (never below 0), jump goes to 0, return goes to that topic's depth.
- confidence: 0 to 1, how sure you are of the move.

Dictation has little punctuation and some misheard words; read for meaning. Return exactly one reading per sentence number, in order.`;

const schema = {
    type: "object",
    properties: {
        readings: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    seq: {type: "integer"},
                    move: {type: "string", enum: [...moves]},
                    topic: {type: "string"},
                    depth: {type: "integer"},
                    confidence: {type: "number"}
                },
                required: ["seq", "move", "topic", "depth", "confidence"],
                additionalProperties: false
            }
        }
    },
    required: ["readings"],
    additionalProperties: false
};

type ModelReading = {seq: number, move: Move, topic: string, depth: number, confidence: number};

export class ReadError extends Error {}

/* One call for the whole monologue. Throws ReadError with plain words when the answer can't be used. */
export async function askClaude(apiKey: string, utterances: Utterance[]): Promise<ModelReading[]> {
    const client = new Anthropic({apiKey, maxRetries: 2, timeout: 120_000});
    const numbered = utterances.map(u => `${u.seq}. ${u.text}`).join("\n");
    const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {effort: "low", format: {type: "json_schema", schema}},
        system,
        messages: [{role: "user", content: `<monologue>\n${numbered}\n</monologue>`}]
    });
    if (response.stop_reason === "refusal") {
        throw new ReadError("Claude declined to read it.");
    }
    if (response.stop_reason === "max_tokens") {
        throw new ReadError("The reading was cut off; the monologue may be too long to read in one go.");
    }
    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
        throw new ReadError("Claude's answer had no reading in it.");
    }
    let parsed: {readings: ModelReading[]};
    try {
        parsed = JSON.parse(textBlock.text);
    } catch {
        throw new ReadError("Claude's answer wasn't a reading.");
    }
    const bySeq = new Map(parsed.readings.map(r => [r.seq, r]));
    const missing = utterances.filter(u => !bySeq.has(u.seq));
    if (missing.length > 0) {
        throw new ReadError(`Claude skipped ${missing.length} of ${utterances.length} sentences.`);
    }
    return utterances.map(u => bySeq.get(u.seq)!);
}

/* Keywords win; depths are made consistent again after a keyword changes a move. */
export function settle(utterances: Utterance[], read: ModelReading[], modelName: string, madeAt: string): Reading[] {
    const readings: Reading[] = [];
    const depthOfTopic = new Map<string, number>();
    for (const [i, u] of utterances.entries()) {
        const fromModel = read[i];
        const topic = fromModel.topic.trim().slice(0, maxTopicChars) || "Untitled";
        const reading: Reading = {
            seq: u.seq, move: fromModel.move, topic,
            depth: Math.max(0, Math.round(fromModel.depth)),
            confidence: Math.min(1, Math.max(0, fromModel.confidence)),
            model: modelName, madeAt
        };
        const keyword = keywordIn(u.text);
        if (keyword) {
            reading.cue = keyword.cue;
            reading.confidence = 1;
            if (keyword.move !== reading.move) {
                const previous = readings.at(-1)?.depth ?? 0;
                reading.move = keyword.move;
                reading.model = "keyword";
                reading.depth = {
                    stay: previous,
                    jump: 0,
                    drill: previous + 1,
                    surface: Math.max(0, previous - 1),
                    sideways: previous,
                    return: depthOfTopic.get(topic) ?? reading.depth,
                    ask: previous
                }[keyword.move];
            }
        }
        if (i === 0 && reading.move !== "jump" && reading.move !== "ask" && !keyword) {
            reading.move = "jump";
            reading.depth = 0;
        }
        depthOfTopic.set(topic, reading.depth);
        readings.push(reading);
    }
    return readings;
}

async function recordTry(env: Env, monologueId: string, outcome: "read" | "no_key" | "failed", note?: string) {
    await env.DB.prepare("INSERT INTO monologue_reads (monologue_id, tried_at, outcome, note) VALUES (?, ?, ?, ?)")
        .bind(monologueId, new Date().toISOString(), outcome, note ?? null).run();
}

/* Read a stored monologue. Never throws for a missing key or a failed call: the monologue waits to be read. */
export async function readMonologue(env: Env, monologueId: string, utterances: Utterance[]): Promise<ReadState> {
    if (!env.ANTHROPIC_API_KEY) {
        await recordTry(env, monologueId, "no_key");
        return {state: "waiting", note: "No ANTHROPIC_API_KEY is set yet."};
    }
    let read: ModelReading[];
    try {
        read = await askClaude(env.ANTHROPIC_API_KEY, utterances);
    } catch (e) {
        const note = e instanceof ReadError ? e.message
            : e instanceof Anthropic.AuthenticationError ? "The ANTHROPIC_API_KEY was refused."
            : e instanceof Anthropic.RateLimitError ? "Claude is busy (rate limited). Try again shortly."
            : e instanceof Anthropic.APIError ? `Claude's API said ${e.status ?? "no status"}: ${e.message}`
            : "Couldn't reach Claude.";
        console.error("reading monologue failed", monologueId, e);
        await recordTry(env, monologueId, "failed", note);
        return {state: "waiting", note};
    }
    const readings = settle(utterances, read, model, new Date().toISOString());
    await env.DB.batch(readings.map(r => env.DB.prepare(
        `INSERT INTO readings (monologue_id, seq, move, topic, depth, confidence, model, cue, made_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(monologueId, r.seq, r.move, r.topic, r.depth, r.confidence, r.model, r.cue ?? null, r.madeAt)));
    await recordTry(env, monologueId, "read");
    return {state: "read"};
}

type ReadingRow = {
    seq: number, move: Move, topic: string, depth: number, confidence: number, model: string,
    cue: string | null, made_at: string
};

/* The newest reading of each utterance */
export async function latestReadings(env: Env, monologueId: string): Promise<Map<number, Reading>> {
    const {results} = await env.DB.prepare(
        `SELECT seq, move, topic, depth, confidence, model, cue, made_at FROM readings r
         WHERE monologue_id = ? AND id = (SELECT MAX(id) FROM readings x WHERE x.monologue_id = r.monologue_id AND x.seq = r.seq)
         ORDER BY seq`
    ).bind(monologueId).all<ReadingRow>();
    return new Map(results.map(r => {
        const reading: Reading = {
            seq: r.seq, move: r.move, topic: r.topic, depth: r.depth, confidence: r.confidence,
            model: r.model, madeAt: r.made_at
        };
        if (r.cue) reading.cue = r.cue;
        return [r.seq, reading];
    }));
}

/* Read when every utterance has a reading; otherwise waiting, with the last try's note */
export async function readStateOf(env: Env, monologueId: string, utteranceCount: number, readCount: number): Promise<ReadState> {
    if (utteranceCount > 0 && readCount >= utteranceCount) {
        return {state: "read"};
    }
    const last = await env.DB.prepare(
        "SELECT outcome, note FROM monologue_reads WHERE monologue_id = ? ORDER BY id DESC LIMIT 1"
    ).bind(monologueId).first<{outcome: string, note: string | null}>();
    return last?.note ? {state: "waiting", note: last.note} : {state: "waiting"};
}
