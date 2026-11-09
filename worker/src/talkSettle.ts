import { NeedState } from "./answers";
import { keywordIn, Move, moves } from "./readings";
import { applyStep, nodeKinds, NodeKind, resolve, TreeEdit, TreeState, wouldLoop } from "./talkTree";

/* Checks a live read's answer (talks.ts) against the tree and turns it into what is stored. Kept apart from the database
   and the API so it can be tried on its own. */

export const editOps = ["add", "rename", "move", "merge"] as const;
/* design: later stretches may move nodes from the last five minutes; renames can reach anywhere */
const moveWindowMs = 5 * 60_000;
const nodeTextMax = 90;
const quoteMax = 100;
/* Jon saying he's going deep on purpose: the "back to the question?" cue stays away */
const goingDeepPattern = /\b(i'?m going (deep|down a rabbit hole)|going deep on (this|purpose)|let me go deep|rabbit hole on purpose)\b/i;

export type StretchRow = {seq: number, raw_text: string, said_at_ms: number, received_at: string};
export type Cleaned = {seq: number, text: string, move: Move, cue?: string};
export type Coverage = {questionId: string, needId: string, state: NeedState, nodes: string[], quote: string};
export type ModelAnswer = {
    stretches: {seq: number, text: string, move: Move}[],
    edits: {op: typeof editOps[number], node: string, parent: string, kind: NodeKind | "", text: string}[],
    here: string,
    coverage: {need: string, state: "partly" | "covered", needId?: string, nodes: string[], quote: string}[],
    going_deep: boolean
};

const oneLine = (s: string) => s.trim().replace(/\s+/g, " ");

/* Turn the model's answer into stored edits: give out real ids, drop anything that points nowhere or breaks the rules */
export function settleAnswer(
    state: TreeState, answer: ModelAnswer, batch: StretchRow[], nextNodeNumber: number, nowAtMs: number,
    byShort: Map<string, {questionId: string, needId: string, state: NeedState}>
): {cleaned: Cleaned[], edits: TreeEdit[], here: string | null, coverage: Coverage[], goingDeep: boolean, nextNodeNumber: number, dropped: number} {
    let next = nextNodeNumber;
    let dropped = 0;
    const refs = new Map<string, string>();
    const known = (id: string) => state.nodes.has(resolve(state, id) ?? "");
    /* only after exists(): a new ref from this answer, or an existing id followed through merges */
    const idFor = (ref: string): string | null => {
        const r = ref.trim();
        if (!r || r === "root") return null;
        return refs.get(r) ?? resolve(state, r);
    };
    const exists = (ref: string) => {
        const r = ref.trim();
        return refs.has(r) || known(r);
    };
    // a scratch copy so later edits in the same answer see earlier ones (an idea under a topic added just before)
    const scratch: TreeState = {...state, nodes: new Map([...state.nodes].map(([k, v]) => [k, {...v}])), mergedInto: new Map(state.mergedInto)};
    const edits: TreeEdit[] = [];
    const lastSeq = batch[batch.length - 1].seq;
    for (const e of answer.edits) {
        const text = oneLine(e.text).slice(0, nodeTextMax);
        let edit: TreeEdit | null = null;
        if (e.op === "add") {
            const ref = e.node.trim();
            const parentRef = e.parent.trim();
            const parentOk = parentRef === "" || parentRef === "root" || exists(parentRef);
            if (!text || !parentOk || refs.has(ref) || known(ref)) {
                dropped++;
                continue;
            }
            const id = `n${next++}`;
            refs.set(ref, id);
            const kind: NodeKind = e.kind && nodeKinds.includes(e.kind) ? e.kind : "idea";
            edit = {op: "add", id, parent: parentRef === "" || parentRef === "root" ? null : idFor(parentRef), kind, text};
        } else if (e.op === "rename") {
            edit = exists(e.node) && text ? {op: "rename", id: idFor(e.node)!, text} : null;
        } else if (e.op === "move") {
            const id = exists(e.node) ? idFor(e.node) : null;
            const parent = e.parent.trim() === "root" || e.parent.trim() === "" ? null : exists(e.parent) ? idFor(e.parent) : undefined;
            const node = id ? scratch.nodes.get(id) : undefined;
            const recent = node && (refs.has(e.node.trim()) || nowAtMs - node.bornAtMs <= moveWindowMs);
            edit = id && parent !== undefined && recent && !wouldLoop(scratch, id, parent) ? {op: "move", id, parent} : null;
        } else if (e.op === "merge") {
            const id = exists(e.node) ? idFor(e.node) : null;
            const into = exists(e.parent) ? idFor(e.parent) : null;
            edit = id && into && id !== into ? {op: "merge", id, into} : null;
        }
        if (!edit) {
            dropped++;
            continue;
        }
        edits.push(edit);
        applyStep(scratch, {lastSeq, atMs: nowAtMs, edits: [edit], here: null, goingDeep: false, tiedNodes: [], hasQuestions: false});
    }
    const here = exists(answer.here) ? idFor(answer.here) : state.here;

    const bySeq = new Map(answer.stretches.map(s => [s.seq, s]));
    const cleaned: Cleaned[] = batch.map(s => {
        const read = bySeq.get(s.seq);
        const keyword = keywordIn(s.raw_text);
        const move = keyword?.move ?? (read && moves.includes(read.move) ? read.move : "stay");
        const text = read?.text?.trim() ? read.text.trim() : s.raw_text;
        return keyword ? {seq: s.seq, text, move, cue: keyword.cue} : {seq: s.seq, text, move};
    });

    const coverage: Coverage[] = answer.coverage.flatMap(c => {
        const need = byShort.get(c.need.trim().toLowerCase());
        if (!need || (c.state !== "partly" && c.state !== "covered")) return [];
        // the reading never lowers what was already covered
        if (need.state === "covered" || need.state === "set_aside" || (need.state === "partly" && c.state === "partly")) return [];
        const nodes = c.nodes.map(r => exists(r) ? idFor(r) : null).filter((x): x is string => !!x);
        return [{questionId: need.questionId, needId: need.needId, state: c.state, nodes, quote: oneLine(c.quote).slice(0, quoteMax)}];
    });
    const goingDeep = answer.going_deep || batch.some(s => goingDeepPattern.test(s.raw_text));
    return {cleaned, edits, here, coverage, goingDeep, nextNodeNumber: next, dropped};
}

