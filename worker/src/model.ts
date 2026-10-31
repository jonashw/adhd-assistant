import { HttpError } from "./http";

/* The wire format is the app's: nodes plus links, with PART_OF links standing for each node's parent */

export const statuses = ["captured", "active", "waiting", "someday", "done", "dropped"] as const;
export const linkTypes = ["PART_OF", "BLOCKED_BY", "ALSO_IN", "LABELLED"] as const;

export type WireNode = {
    id: string,
    label: string,
    type: "HOME" | "RabbitHole",
    status?: typeof statuses[number],
    doneAt?: string,
    hidden?: boolean,
    origin?: string,
    body?: string,
    /* its next step fits in 5 minutes */
    small?: boolean,
    /* Jon's own interest, 1 to 5 */
    interest?: number
};
export type WireLink = {source: string, target: string, type: typeof linkTypes[number], label?: string};
export type WireMap = {id: string, revision: number, nodes: WireNode[], links: WireLink[]};

const fail = (message: string): never => {
    throw new HttpError(422, message);
};

const isText = (value: unknown, max: number): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= max;

const optional = <T>(value: unknown, check: (v: unknown) => v is T): value is T | undefined =>
    value === undefined || value === null || check(value);

/* Checks a map against the model: one HOME, one parent for every other place, no loops in PART_OF or BLOCKED_BY */
export function validateMap(input: unknown): {nodes: WireNode[], links: WireLink[]} {
    const body = input as {nodes?: unknown, links?: unknown};
    if (!Array.isArray(body?.nodes) || !Array.isArray(body?.links)) {
        fail("A map needs nodes and links.");
    }
    const rawNodes = body.nodes as Record<string, unknown>[];
    const rawLinks = body.links as Record<string, unknown>[];
    if (rawNodes.length > 5000 || rawLinks.length > 20000) {
        fail("This map is too large.");
    }

    const nodes: WireNode[] = rawNodes.map(n => {
        if (!isText(n?.id, 100) || !isText(n.label, 1000) || (n.type !== "HOME" && n.type !== "RabbitHole")) {
            fail("Every place needs an id, a label and a type.");
        }
        if (!optional(n.status, (v): v is string => statuses.includes(v as typeof statuses[number]))
            || !optional(n.doneAt, (v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))
            || !optional(n.hidden, (v): v is boolean => typeof v === "boolean")
            || !optional(n.origin, (v): v is string => isText(v, 100))
            || !optional(n.body, (v): v is string => typeof v === "string" && v.length <= 100_000)
            || !optional(n.small, (v): v is boolean => typeof v === "boolean")
            || !optional(n.interest, (v): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5)) {
            fail(`Place "${n.label}" has a field the map can't store.`);
        }
        return {
            id: n.id as string,
            label: n.label as string,
            type: n.type as WireNode["type"],
            status: (n.status ?? undefined) as WireNode["status"],
            doneAt: (n.doneAt ?? undefined) as string | undefined,
            hidden: n.hidden === true,
            origin: (n.origin ?? undefined) as string | undefined,
            body: (n.body ?? undefined) as string | undefined,
            small: n.small === true,
            interest: (n.interest ?? undefined) as number | undefined
        };
    });

    const byId = new Map(nodes.map(n => [n.id, n]));
    if (byId.size !== nodes.length) {
        fail("Two places share an id.");
    }
    const homes = nodes.filter(n => n.type === "HOME");
    if (homes.length !== 1) {
        fail("A map needs exactly one HOME.");
    }

    const seen = new Set<string>();
    const links: WireLink[] = rawLinks.map(l => {
        if (!isText(l?.source, 100) || !isText(l.target, 100) || !linkTypes.includes(l.type as WireLink["type"])) {
            fail("Every link needs a source, a target and a known type.");
        }
        if (!byId.has(l.source as string) || !byId.has(l.target as string) || l.source === l.target) {
            fail("A link points at a place that isn't on the map.");
        }
        if (!optional(l.label, (v): v is string => isText(v, 200))) {
            fail("A link label is too long.");
        }
        const key = `${l.source}\n${l.target}\n${l.type}`;
        if (seen.has(key)) {
            fail("The same link appears twice.");
        }
        seen.add(key);
        return {
            source: l.source as string,
            target: l.target as string,
            type: l.type as WireLink["type"],
            label: (l.label ?? undefined) as string | undefined
        };
    });

    const parentOf = new Map<string, string>();
    for (const link of links.filter(l => l.type === "PART_OF")) {
        if (parentOf.has(link.source)) {
            fail(`"${byId.get(link.source)!.label}" has more than one parent.`);
        }
        parentOf.set(link.source, link.target);
    }
    for (const node of nodes) {
        if (node.type === "HOME" ? parentOf.has(node.id) : !parentOf.has(node.id)) {
            fail(node.type === "HOME" ? "HOME can't have a parent." : `"${node.label}" needs a parent.`);
        }
    }
    // every place must reach HOME by walking up
    for (const node of nodes) {
        const path = new Set<string>();
        let current: string | undefined = node.id;
        while (current !== undefined) {
            if (path.has(current)) {
                fail(`"${node.label}" sits inside itself.`);
            }
            path.add(current);
            current = parentOf.get(current);
        }
    }
    assertNoLoop(links.filter(l => l.type === "BLOCKED_BY"), "Two places block each other.");

    return {nodes, links};
}

function assertNoLoop(links: WireLink[], message: string) {
    const next = new Map<string, string[]>();
    for (const l of links) {
        next.set(l.source, [...(next.get(l.source) ?? []), l.target]);
    }
    const state = new Map<string, "visiting" | "done">();
    const visit = (id: string) => {
        if (state.get(id) === "done") {
            return;
        }
        if (state.get(id) === "visiting") {
            fail(message);
        }
        state.set(id, "visiting");
        (next.get(id) ?? []).forEach(visit);
        state.set(id, "done");
    };
    [...next.keys()].forEach(visit);
}
