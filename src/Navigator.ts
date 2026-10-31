import { MindMap, MindMapGraphData, MindMapGraphNode } from "./MindMap";
import { Signal, Visit } from "./Trail";

/* Where Jon stands, read from the trail. Pure functions, so they are easy to check. */

export type Tether = ({
    state: "tied", at: string, since?: string
} | {
        state: "aloft",
        /* where he untied and set his work down */
        setDown: string,
        since: string,
        /* places walked since untying, as a path that shortens when he walks back; the last one is where he stands */
        path: string[],
        /* times he stepped somewhere new, for the weather */
        newSteps: string[]
    }) & {
        /* when he last tied off anywhere */
        lastTieOff?: string
    };

export const tunables = {
    tugMinutes: 45,
    tugSteps: 3,
    gustSteps: 6,
    gustMinutes: 20,
    flagHours: 48,
    /* a winner this far ahead (normalized) shows alone */
    clearMargin: 0.05
};

/* With no tie-off or untie on record, Jon starts tied off at HOME */
export function readTether(visits: Visit[], homeId: string): Tether {
    let tether: Tether = {state: "tied", at: homeId};
    for (const v of visits) {
        if (v.kind === "tie_off") {
            tether = {state: "tied", at: v.noteId, since: v.at, lastTieOff: v.at};
        } else if (v.kind === "untie") {
            tether = {state: "aloft", setDown: v.noteId, since: v.at, path: [v.noteId], newSteps: [], lastTieOff: tether.lastTieOff};
        } else if (tether.state === "aloft") {
            const index = tether.path.indexOf(v.noteId);
            if (index >= 0) {
                //walking back along the way he came shortens the string
                tether.path = tether.path.slice(0, index + 1);
            } else {
                tether.path = [...tether.path, v.noteId];
                tether.newSteps = [...tether.newSteps, v.at];
            }
        }
    }
    return tether;
}

export const standingAt = (tether: Tether): string =>
    tether.state === "tied" ? tether.at : tether.path[tether.path.length - 1];

export const stringOut = (tether: Tether): number =>
    tether.state === "aloft" ? tether.path.length - 1 : 0;

export const minutesAloft = (tether: Tether, now: Date): number =>
    tether.state === "aloft" ? Math.floor((now.getTime() - Date.parse(tether.since)) / 60_000) : 0;

/* One step back toward where he set his work down, or undefined when he is already there */
export const reelInStep = (tether: Tether): string | undefined =>
    tether.state === "aloft" && tether.path.length > 1 ? tether.path[tether.path.length - 2] : undefined;

/* Jon's own answer to "Gusty up there?" (or "I'm scattered"). It holds until he next ties off. */
export type WeatherAnswer = {answer: "gusty" | "thermal" | "calm", at: string};

export const currentWeather = (tether: Tether, answer: WeatherAnswer | undefined, now = new Date()): WeatherAnswer["answer"] | undefined =>
    answer && answer.at >= (tether.lastTieOff ?? "")
        //weather changes; an answer from more than half a day ago no longer says much
        && now.getTime() - Date.parse(answer.at) < 12 * 3600_000
        ? answer.answer : undefined;

/* The spider feels the string jerk each time Jon steps somewhere new; often enough, it asks */
export function shouldAskWeather(tether: Tether, answer: WeatherAnswer | undefined, now: Date): boolean {
    if (tether.state !== "aloft" || currentWeather(tether, answer, now) !== undefined) {
        return false;
    }
    const since = new Date(now.getTime() - tunables.gustMinutes * 60_000).toISOString();
    return tether.newSteps.filter(at => at >= since).length >= tunables.gustSteps;
}

export function shouldTug(tether: Tether, answer: WeatherAnswer | undefined, now: Date): boolean {
    return tether.state === "aloft"
        && currentWeather(tether, answer, now) !== "thermal"
        && (minutesAloft(tether, now) >= tunables.tugMinutes || stringOut(tether) >= tunables.tugSteps);
}

/* What's next: flag, filter, rank, robustness, or Mindful */

export const criteria = [
    {key: "flags", name: "Flags"},
    {key: "flares", name: "Flares"},
    {key: "smoke", name: "Smoke"},
    {key: "energy", name: "Energy fit"},
    {key: "staleness", name: "Staleness"},
    {key: "interest", name: "Interest"}
] as const;
export type CriterionKey = typeof criteria[number]["key"];
export type Weights = {[key in CriterionKey]: number};
/* [ASSUMPTION] equal weights to start; Jon tunes them later (FR-10) */
export const equalWeights: Weights = Object.fromEntries(criteria.map(c => [c.key, 1 / criteria.length])) as Weights;

export type Suggestion = {
    node: MindMapGraphNode,
    reason: string,
    scores: {[key in CriterionKey]: number},
    total: number
};

export type WhatsNext =
    | {kind: "mindful", others: Suggestion[]}
    | {kind: "small", pick?: Suggestion}
    | {
        kind: "ranked",
        /* the nearest flag due within 48 hours, on top */
        flag?: Suggestion,
        /* one when the winner is clear; two or three when it's close */
        top: Suggestion[],
        /* the criterion that would flip the top two, when it's close */
        flip?: string,
        others: Suggestion[]
    };

export type NavigatorInput = {
    graph: MindMapGraphData,
    signals: Signal[],
    lastArrivedAt: {[noteId: string]: string},
    tether: Tether,
    weather?: WeatherAnswer["answer"],
    now: Date,
    weights?: Weights
};

const dayMs = 24 * 3600_000;
const dueTime = (dueAt: string) => Date.parse(`${dueAt}T23:59:59`);

export function formatDue(dueAt: string, now: Date): string {
    const due = new Date(`${dueAt}T12:00:00`);
    const days = Math.round((Date.parse(`${dueAt}T00:00:00`) - new Date(now.toDateString()).getTime()) / dayMs);
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days > 1 && days < 7) return due.toLocaleDateString(undefined, {weekday: "short"});
    if (days < 0) return `since ${due.toLocaleDateString(undefined, {month: "short", day: "numeric"})}`;
    return due.toLocaleDateString(undefined, {month: "short", day: "numeric"});
}

function flagScore(flag: Signal | undefined, now: Date): number {
    if (!flag?.dueAt) return 1;
    const days = (dueTime(flag.dueAt) - now.getTime()) / dayMs;
    return days <= 2 ? 5 : days <= 7 ? 4 : days <= 14 ? 3 : 2;
}

function stalenessScore(lastArrivedAt: string | undefined, now: Date): number {
    if (!lastArrivedAt) return 3;
    const days = (now.getTime() - Date.parse(lastArrivedAt)) / dayMs;
    return days < 1 ? 1 : days < 3 ? 2 : days < 7 ? 3 : days < 30 ? 4 : 5;
}

/* The places that can be done here and now (the GTD check) */
export function candidates(graph: MindMapGraphData): MindMapGraphNode[] {
    const visible = new Set(MindMap.visibleGraph(graph, false).nodes.map(n => n.id));
    return graph.nodes.filter(n =>
        n.type !== "HOME"
        && visible.has(n.id)
        && n.status !== "someday"
        && n.status !== "waiting"
        && !MindMap.isBlocked(graph, n.id));
}

export function whatsNext(input: NavigatorInput): WhatsNext {
    const {graph, signals, lastArrivedAt, tether, now} = input;
    const weights = input.weights ?? equalWeights;
    const flagOf = new Map<string, Signal>();
    for (const s of signals) {
        if (s.kind === "deadline" && s.dueAt) {
            const current = flagOf.get(s.noteId);
            if (!current || s.dueAt < current.dueAt!) {
                flagOf.set(s.noteId, s);
            }
        }
    }
    const hasSignal = (noteId: string, kind: Signal["kind"]) => signals.some(s => s.noteId === noteId && s.kind === kind);
    const setDown = tether.state === "aloft" && tether.setDown !== graph.nodes.find(n => n.type === "HOME")?.id
        ? tether.setDown : undefined;

    const suggest = (node: MindMapGraphNode): Suggestion => {
        const flag = flagOf.get(node.id);
        const scores = {
            flags: flagScore(flag, now),
            flares: hasSignal(node.id, "request") ? 5 : 3,
            smoke: hasSignal(node.id, "trouble") ? 5 : 3,
            // [ASSUMPTION] neutral until there is an energy check
            energy: 3,
            staleness: stalenessScore(lastArrivedAt[node.id], now),
            interest: node.interest ?? 3
        };
        const total = criteria.reduce((sum, c) => sum + weights[c.key] * scores[c.key], 0);
        const last = lastArrivedAt[node.id];
        const reason =
            flag ? `Flag: ${flag.label}, due ${formatDue(flag.dueAt!, now)}`
            : hasSignal(node.id, "request") ? "Flare: someone is waiting on you"
            : hasSignal(node.id, "trouble") ? "Smoke: something is going wrong"
            : node.id === setDown ? "You set this down at your feet"
            : (node.interest ?? 0) >= 4 ? "You marked this as interesting"
            : last ? `Last here ${Math.max(1, Math.round((now.getTime() - Date.parse(last)) / dayMs))} day(s) ago`
            : "Not visited yet";
        return {node, reason, scores, total};
    };
    const byTotal = (a: Suggestion, b: Suggestion) => b.total - a.total;

    const open = candidates(graph).map(suggest).sort(byTotal);

    if (input.weather === "gusty") {
        //one small thing, preferring where he stands; a flag only if its next step is small too
        const here = standingAt(tether);
        const small = open.filter(s => s.node.small);
        const nearby = small.filter(s => s.node.id === here || MindMap.parentOf(graph, s.node.id) === here);
        return {kind: "small", pick: nearby[0] ?? small[0]};
    }

    //the bar: a place needs Jon when it has a flag, a flare or smoke, or he set it down
    const needy = open.filter(s => flagOf.has(s.node.id) || hasSignal(s.node.id, "request")
        || hasSignal(s.node.id, "trouble") || s.node.id === setDown);
    if (needy.length === 0) {
        return {kind: "mindful", others: open};
    }

    const flagCutoff = now.getTime() + tunables.flagHours * 3600_000;
    const dueSoon = needy
        .filter(s => {
            const flag = flagOf.get(s.node.id);
            return flag && dueTime(flag.dueAt!) <= flagCutoff;
        })
        .sort((a, b) => flagOf.get(a.node.id)!.dueAt!.localeCompare(flagOf.get(b.node.id)!.dueAt!))[0];

    const ranked = needy.filter(s => s !== dueSoon);
    const range = 4; // scores run 1 to 5
    const margin = (a: Suggestion, b: Suggestion) => (a.total - b.total) / range;
    let top = ranked.slice(0, 1);
    let flip: string | undefined;
    if (ranked.length > 1 && margin(ranked[0], ranked[1]) < tunables.clearMargin) {
        top = ranked.slice(0, 3).filter(s => margin(ranked[0], s) < tunables.clearMargin);
        //the criterion where the runner-up beats the leader by the most would flip them if it weighed more
        const [a, b] = ranked;
        const best = criteria
            .map(c => ({name: c.name, gap: b.scores[c.key] - a.scores[c.key]}))
            .filter(c => c.gap > 0)
            .sort((x, y) => y.gap - x.gap)[0];
        flip = best?.name;
    }
    const shown = new Set([dueSoon, ...top].filter(Boolean).map(s => s!.node.id));
    return {kind: "ranked", flag: dueSoon, top, flip, others: open.filter(s => !shown.has(s.node.id))};
}
