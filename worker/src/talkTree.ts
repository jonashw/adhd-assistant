/* The idea tree of one talk (live screen, E7 phase 2), rebuilt by folding every read's edits in order. Nothing here
   touches the database, so the same fold serves the live screen and, later, replay at any moment. */

export const nodeKinds = ["topic", "idea", "example", "loose_end"] as const;
export type NodeKind = typeof nodeKinds[number];

/* Edits as stored: node ids already given out by the server */
export type TreeEdit =
    | {op: "add", id: string, parent: string | null, kind: NodeKind, text: string}
    | {op: "rename", id: string, text: string}
    | {op: "move", id: string, parent: string | null}
    | {op: "merge", id: string, into: string};

export type TreeNode = {
    id: string,
    parent: string | null,
    kind: NodeKind,
    text: string,
    /* the stretch that made it, and when (ms into the talk) */
    bornSeq: number,
    bornAtMs: number,
    /* the last read that renamed or moved it, so the screen can make it glow */
    changedSeq?: number
};

export type ReadStep = {
    lastSeq: number,
    /* ms into the talk of the read's last stretch */
    atMs: number,
    edits: TreeEdit[],
    here: string | null,
    goingDeep: boolean,
    /* node ids tied to an open need by this read's coverage */
    tiedNodes: string[],
    /* whether the talk has questions at this read */
    hasQuestions: boolean
};

export type TreeState = {
    nodes: Map<string, TreeNode>,
    /* merged-away ids point at the node they were merged into */
    mergedInto: Map<string, string>,
    here: string | null,
    /* node ids ever tied to a need, by any read */
    tied: Set<string>,
    goingDeepSinceSeq: number | null,
    /* consecutive reads, up to now, whose "here" branch tied to no need */
    untiedRun: {count: number, sinceAtMs: number} | null
};

export const emptyTree = (): TreeState => ({
    nodes: new Map(), mergedInto: new Map(), here: null, tied: new Set(), goingDeepSinceSeq: null, untiedRun: null
});

/* Follows merges, so an edit that names a merged-away node lands on the node it became */
export function resolve(state: TreeState, id: string | null): string | null {
    let current = id;
    for (let hops = 0; current && state.mergedInto.has(current) && hops < 50; hops++) {
        current = state.mergedInto.get(current)!;
    }
    return current;
}

export function ancestors(state: TreeState, id: string): string[] {
    const chain: string[] = [];
    let current = state.nodes.get(id)?.parent ?? null;
    while (current && chain.length < 100) {
        chain.push(current);
        current = state.nodes.get(current)?.parent ?? null;
    }
    return chain;
}

export const depthOf = (state: TreeState, id: string) => ancestors(state, id).length;

/* Moving a node under itself or its own descendant would make a loop */
export function wouldLoop(state: TreeState, id: string, newParent: string | null): boolean {
    return newParent !== null && (newParent === id || ancestors(state, newParent).includes(id));
}

export function applyStep(state: TreeState, step: ReadStep): TreeState {
    for (const edit of step.edits) {
        switch (edit.op) {
            case "add": {
                if (state.nodes.has(edit.id)) break;
                const parent = resolve(state, edit.parent);
                state.nodes.set(edit.id, {
                    id: edit.id, parent: parent && state.nodes.has(parent) ? parent : null, kind: edit.kind, text: edit.text,
                    bornSeq: step.lastSeq, bornAtMs: step.atMs
                });
                break;
            }
            case "rename": {
                const node = state.nodes.get(resolve(state, edit.id) ?? "");
                if (node && node.text !== edit.text) {
                    node.text = edit.text;
                    node.changedSeq = step.lastSeq;
                }
                break;
            }
            case "move": {
                const id = resolve(state, edit.id);
                const parent = resolve(state, edit.parent);
                const node = id ? state.nodes.get(id) : undefined;
                if (node && (parent === null || state.nodes.has(parent)) && !wouldLoop(state, node.id, parent) && node.parent !== parent) {
                    node.parent = parent;
                    node.changedSeq = step.lastSeq;
                }
                break;
            }
            case "merge": {
                const id = resolve(state, edit.id);
                const into = resolve(state, edit.into);
                if (!id || !into || id === into || !state.nodes.has(id) || !state.nodes.has(into)) break;
                if (ancestors(state, into).includes(id)) break;
                for (const child of state.nodes.values()) {
                    if (child.parent === id) child.parent = into;
                }
                state.nodes.delete(id);
                state.mergedInto.set(id, into);
                state.nodes.get(into)!.changedSeq = step.lastSeq;
                if (state.here === id) state.here = into;
                break;
            }
        }
    }
    const here = resolve(state, step.here);
    if (here && state.nodes.has(here)) state.here = here;
    step.tiedNodes.forEach(id => {
        const resolved = resolve(state, id);
        if (resolved) state.tied.add(resolved);
    });
    if (step.goingDeep && state.goingDeepSinceSeq === null) state.goingDeepSinceSeq = step.lastSeq;
    // a jump to a new top-level topic ends a declared deep dive
    if (state.goingDeepSinceSeq !== null && state.here && depthOf(state, state.here) === 0 && !step.goingDeep) {
        state.goingDeepSinceSeq = null;
    }
    // the off-the-questions run: the branch Jon is in has nothing tied to a need
    if (step.hasQuestions && state.here && !branchTied(state, state.here)) {
        state.untiedRun = state.untiedRun ? {count: state.untiedRun.count + 1, sinceAtMs: state.untiedRun.sinceAtMs} : {count: 1, sinceAtMs: step.atMs};
    } else {
        state.untiedRun = null;
    }
    return state;
}

/* A branch counts as tied when the top-level topic it sits in, or anything in it, is tied to a need */
function branchTied(state: TreeState, id: string): boolean {
    const top = topOf(state, id);
    if (state.tied.has(top)) return true;
    return [...state.nodes.values()].some(n => state.tied.has(n.id) && topOf(state, n.id) === top);
}

export function topOf(state: TreeState, id: string): string {
    const chain = ancestors(state, id);
    return chain.length > 0 ? chain[chain.length - 1] : id;
}

export function foldTree(steps: ReadStep[]): TreeState {
    return steps.reduce(applyStep, emptyTree());
}

/* How deep below its top-level topic a branch has to go to count as a rabbit hole (design: three or more levels) */
export const rabbitHoleLevels = 3;
/* Reads in a row whose branch ties to no open need before it counts as a rabbit hole too */
export const untiedReads = 3;

export type RabbitHole = {nodeId: string, sinceAtMs: number, why: "deep" | "off_questions", declared: boolean};

/* The rabbit hole Jon is in now, if any. It is shown, never stopped. */
export function rabbitHoleNow(state: TreeState): RabbitHole | null {
    if (!state.here) return null;
    const declared = state.goingDeepSinceSeq !== null;
    const path = [state.here, ...ancestors(state, state.here)].reverse(); // top-level topic first
    if (path.length > rabbitHoleLevels) {
        const entry = state.nodes.get(path[rabbitHoleLevels])!;
        return {nodeId: entry.id, sinceAtMs: entry.bornAtMs, why: "deep", declared};
    }
    if (state.untiedRun && state.untiedRun.count >= untiedReads) {
        return {nodeId: path[0], sinceAtMs: state.untiedRun.sinceAtMs, why: "off_questions", declared};
    }
    return null;
}

/* Topics that want more: tied to a need but holding at most one point, or named and left empty for a while */
export function thinTopics(state: TreeState, lastSeq: number): string[] {
    const children = new Map<string, TreeNode[]>();
    for (const n of state.nodes.values()) {
        if (n.parent) children.set(n.parent, [...children.get(n.parent) ?? [], n]);
    }
    return [...state.nodes.values()].filter(n => {
        if (n.kind !== "topic" || n.id === state.here) return false;
        const under = children.get(n.id) ?? [];
        if (state.tied.has(n.id)) return under.length <= 1;
        // an empty topic gets a couple of stretches to fill before it reads as thin
        return under.length === 0 && lastSeq - n.bornSeq >= 2;
    }).map(n => n.id);
}

/* The tree as Claude sees it: one line per node, indented, with its id and kind. Long trees keep the branch Jon is on,
   the branches tied to needs and the top-level topics; the rest is folded into a count. */
export function treeForPrompt(state: TreeState, maxNodes = 220): string {
    if (state.nodes.size === 0) return "(empty: nothing said yet)";
    const keep = new Set<string>();
    if (state.nodes.size > maxNodes) {
        const hereTop = state.here ? topOf(state, state.here) : null;
        for (const n of state.nodes.values()) {
            const top = topOf(state, n.id);
            if (n.parent === null || top === hereTop || state.tied.has(n.id) || state.tied.has(top)) keep.add(n.id);
        }
    }
    const children = new Map<string | null, TreeNode[]>();
    for (const n of state.nodes.values()) {
        children.set(n.parent, [...children.get(n.parent) ?? [], n]);
    }
    const lines: string[] = [];
    const walk = (parent: string | null, depth: number) => {
        const under = children.get(parent) ?? [];
        let folded = 0;
        for (const n of under) {
            if (keep.size > 0 && !keep.has(n.id)) {
                folded++;
                continue;
            }
            lines.push(`${"  ".repeat(depth)}${n.id} [${n.kind}] ${n.text}${n.id === state.here ? "   <- you are here" : ""}`);
            walk(n.id, depth + 1);
        }
        if (folded > 0) lines.push(`${"  ".repeat(depth)}(${folded} more not shown)`);
    };
    walk(null, 0);
    return lines.join("\n");
}
