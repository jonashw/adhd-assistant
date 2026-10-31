import { Env } from "./env";
import { HttpError } from "./http";
import { listMaps } from "./maps";
import { getTrail } from "./trail";
import { WireMap } from "./model";
import { MindMap, MindMapGraphData } from "../../src/MindMap";
import { age, isSilent } from "../../src/TrailTypes";
import { formatDue, readTether, whatsNext } from "../../src/Navigator";

/* What Claude may read of Jon's map: places found by their words, one place in full, and What's next */

/* A place is named "<map id>/<place id>" outside the app */
export const placeKey = (mapId: string, noteId: string) => `${mapId}/${noteId}`;

export function parsePlace(key: string): {mapId: string, noteId: string} {
    const slash = key.indexOf("/");
    if (slash <= 0 || slash === key.length - 1) {
        throw new HttpError(422, `"${key}" isn't a place. Use the place value find_places returns.`);
    }
    return {mapId: key.slice(0, slash), noteId: key.slice(slash + 1)};
}

const asGraph = (map: WireMap): MindMapGraphData => ({nodes: map.nodes, links: map.links});

/* The labels from the region down to the place, without HOME */
function pathOf(map: WireMap, noteId: string): string[] {
    const graph = asGraph(map);
    const byId = new Map(map.nodes.map(n => [n.id, n]));
    const path: string[] = [];
    let current: string | undefined = noteId;
    while (current && byId.get(current)?.type !== "HOME") {
        path.unshift(byId.get(current)?.label ?? "?");
        current = MindMap.parentOf(graph, current);
    }
    return path;
}

const homeLabel = (map: WireMap) => map.nodes.find(n => n.type === "HOME")?.label ?? map.id;

export type FoundPlace = {place: string, map: string, path: string, status: string, canTarget: boolean};

export async function findPlaces(env: Env, query: string, limit = 15): Promise<FoundPlace[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const maps = await listMaps(env);
    const found: (FoundPlace & {score: number})[] = [];
    for (const map of maps) {
        for (const node of map.nodes) {
            if (node.type === "HOME") continue;
            const path = pathOf(map, node.id);
            const haystack = `${path.join(" ")} ${node.body ?? ""}`.toLowerCase();
            const label = node.label.toLowerCase();
            const score = words.length === 0 ? 1
                : words.every(w => haystack.includes(w)) ? words.filter(w => label.includes(w)).length + 1 : 0;
            if (score > 0) {
                found.push({
                    place: placeKey(map.id, node.id),
                    map: homeLabel(map),
                    path: path.join(" › "),
                    status: node.status ?? (node.hidden ? "hidden" : "open"),
                    canTarget: path.length > 1,
                    score
                });
            }
        }
    }
    return found
        .sort((a, b) => b.score - a.score || a.path.length - b.path.length)
        .slice(0, limit)
        .map(f => ({place: f.place, map: f.map, path: f.path, status: f.status, canTarget: f.canTarget}));
}

export async function readPlace(env: Env, key: string) {
    const {mapId, noteId} = parsePlace(key);
    const [map] = await listMaps(env, mapId);
    const node = map?.nodes.find(n => n.id === noteId);
    if (!map || !node) {
        throw new HttpError(404, "There is no such place.");
    }
    const graph = asGraph(map);
    const byId = new Map(map.nodes.map(n => [n.id, n]));
    const trail = await getTrail(env, mapId);
    const now = new Date();
    const items = trail.items.filter(i => i.places.some(p => p.noteId === noteId));
    return {
        place: key,
        map: homeLabel(map),
        path: pathOf(map, noteId).join(" › "),
        status: node.status ?? "open",
        hidden: node.hidden === true,
        small: node.small === true,
        interest: node.interest ?? null,
        notes: node.body ?? "",
        children: MindMap.childrenOf(graph, noteId).map(id => ({place: placeKey(mapId, id), title: byId.get(id)?.label, status: byId.get(id)?.status ?? "open"})),
        waitingOn: MindMap.blockersOf(graph, noteId).map(id => ({place: placeKey(mapId, id), title: byId.get(id)?.label, status: byId.get(id)?.status ?? "open"})),
        signals: trail.signals.filter(s => s.noteId === noteId).map(s => ({
            kind: s.kind === "deadline" ? "flag" : s.kind === "request" ? "flare" : s.kind === "trouble" ? "smoke" : "fresh tracks",
            label: s.label,
            due: s.dueAt ? formatDue(s.dueAt, now) : undefined,
            age: age(s.raisedAt, now)
        })),
        linked: items.map(i => ({
            kind: i.kind, title: i.title, url: i.url,
            state: i.kind === "claude.thread" ? (isSilent(i, now) ? "check in?" : i.state) : undefined,
            lastHeard: i.lastHeardAt ? age(i.lastHeardAt, now) : undefined
        })),
        lastVisited: trail.lastArrivedAt[noteId] ? age(trail.lastArrivedAt[noteId], now) : "never"
    };
}

/* What's next on each map, as the app would answer it with no weather answer */
export async function whatsNextEverywhere(env: Env) {
    const maps = await listMaps(env);
    const now = new Date();
    const answers = [];
    for (const map of maps) {
        const home = map.nodes.find(n => n.type === "HOME");
        if (!home) continue;
        const trail = await getTrail(env, map.id);
        const graph = asGraph(map);
        const result = whatsNext({
            graph, signals: trail.signals, lastArrivedAt: trail.lastArrivedAt,
            tether: readTether(trail.recent, home.id), now, items: trail.items
        });
        const describe = (s: {node: {id: string, label: string}, reason: string}) =>
            ({place: placeKey(map.id, s.node.id), path: pathOf(map, s.node.id).join(" › "), reason: s.reason});
        answers.push({
            map: homeLabel(map),
            answer: result.kind === "mindful" ? "Nothing needs Jon here. He can just stand here."
                : result.kind === "small" ? (result.pick ? "One small thing" : "Nothing small is waiting")
                : result.top.length > 1 ? "A close call" : "Next",
            suggestions: result.kind === "ranked" ? [result.flag, ...result.top].filter(Boolean).map(s => describe(s!))
                : result.kind === "small" && result.pick ? [describe(result.pick)] : []
        });
    }
    return answers;
}
