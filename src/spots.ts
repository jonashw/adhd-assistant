/* Where Jon can be, and what he can do from there.

   Spots form a tree of their own, with Anywhere (a phone in hand) at the root: Home › At my Mac, In bed, Garage;
   Out › Library, Costco… A to-do or ask is tagged with the spot it needs (Claude guesses, Jon corrects). When Jon says
   where he is, an item fits if its spot is where he is or anything above it: a Home task fits at the Mac or in the
   garage. A spot that "stays put" (In bed) is the exception: under it, only Anywhere items and its own fit.
   An untagged item, or one tagged with a name the tree doesn't have, fits anywhere.

   Opening hours gate a spot and everything under it, whether or not Jon picked anywhere: while the library is closed,
   its items wait under Opens up later with the time it opens.

   The lineage: GTD's contexts (choose by context first, then time, energy and priority), and if-then plans
   ("when I'm at the library, I'll test the thick acrylic"), which have good evidence for ADHD. */

export const weekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekDay = typeof weekDays[number];
/* "HH:MM" pairs per day; a day left out is closed. "24:00" closes at midnight. */
export type WeekHours = Partial<Record<WeekDay, [string, string][]>>;

export type Spot = {
    id: string,
    /* missing only for the root, Anywhere */
    parentId?: string,
    name: string,
    staysPut?: boolean,
    /* missing = always open */
    hours?: WeekHours,
    position: number
};

/* Where Jon said he is, until the pick wears off */
export type Whereabouts = {spotId: string, setAt: string, until: string};

export const spotNameMax = 40;
export const spotsMax = 100;

export const rootOf = (spots: Spot[]) => spots.find(s => !s.parentId);

export const byName = (spots: Spot[], name?: string) =>
    name ? spots.find(s => s.name.toLowerCase() === name.trim().toLowerCase()) : undefined;

/* root first, down to the spot */
export function pathTo(spots: Spot[], spot: Spot): Spot[] {
    const byId = new Map(spots.map(s => [s.id, s]));
    const path: Spot[] = [];
    for (let s: Spot | undefined = spot; s && !path.includes(s); s = s.parentId ? byId.get(s.parentId) : undefined) {
        path.unshift(s);
    }
    return path;
}

/* The tree in reading order, each with its depth, for menus and the editor */
export function inOrder(spots: Spot[]): {spot: Spot, depth: number}[] {
    const children = (id?: string) => spots.filter(s => s.parentId === id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const out: {spot: Spot, depth: number}[] = [];
    const walk = (s: Spot, depth: number) => {
        if (out.some(o => o.spot.id === s.id)) return;
        out.push({spot: s, depth});
        children(s.id).forEach(c => walk(c, depth + 1));
    };
    children(undefined).forEach(r => walk(r, 0));
    return out;
}

/* Can an item tagged `where` be done at `here`? */
export function fits(spots: Spot[], where: string | undefined, here: Spot | undefined): boolean {
    if (!here) return true;
    const spot = byName(spots, where);
    if (!spot || !spot.parentId) return true;
    const path = pathTo(spots, here);
    const at = path.findIndex(s => s.id === spot.id);
    if (at < 0) return false;
    // somewhere between the item's spot and here, Jon stays put: only the spot itself fits
    return at === path.length - 1 || !path.slice(at + 1).some(s => s.staysPut);
}

const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/* "10:00-18:00, 19:00-21:00" → ranges; blank → closed; undefined if it doesn't read */
export function parseDayHours(text: string): [string, string][] | undefined {
    const parts = text.split(",").map(p => p.trim()).filter(Boolean);
    const ranges: [string, string][] = [];
    for (const part of parts) {
        const m = /^(\d{1,2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)$/.exec(part);
        if (!m) return undefined;
        const norm = (t: string) => {
            const [h, mm = "00"] = t.split(":");
            return `${h.padStart(2, "0")}:${mm}`;
        };
        const range: [string, string] = [norm(m[1]), norm(m[2])];
        if (!range.every(t => timePattern.test(t)) || minutesOf(range[0]) >= minutesOf(range[1])) return undefined;
        ranges.push(range);
    }
    return ranges;
}

export const dayHoursText = (ranges?: [string, string][]) => (ranges ?? []).map(([a, b]) => `${a}-${b}`).join(", ");

export function validHours(hours: unknown): hours is WeekHours {
    if (typeof hours !== "object" || hours === null || Array.isArray(hours)) return false;
    return Object.entries(hours).every(([day, ranges]) => (weekDays as readonly string[]).includes(day) && Array.isArray(ranges)
        && ranges.length <= 4 && ranges.every(r => Array.isArray(r) && r.length === 2 && r.every(t => typeof t === "string" && timePattern.test(t))
            && minutesOf(r[0]) < minutesOf(r[1])));
}

function openAt(hours: WeekHours, at: Date): {open: boolean, closesAt?: Date} {
    const ranges = hours[weekDays[at.getDay()]] ?? [];
    const now = at.getHours() * 60 + at.getMinutes();
    const range = ranges.find(([a, b]) => minutesOf(a) <= now && now < minutesOf(b));
    if (!range) return {open: false};
    const closesAt = new Date(at);
    closesAt.setHours(0, minutesOf(range[1]), 0, 0);
    return {open: true, closesAt};
}

function nextOpening(hours: WeekHours, from: Date): Date | undefined {
    for (let d = 0; d < 8; d++) {
        const day = new Date(from);
        day.setDate(day.getDate() + d);
        const ranges = [...(hours[weekDays[day.getDay()]] ?? [])].sort((a, b) => minutesOf(a[0]) - minutesOf(b[0]));
        for (const [a] of ranges) {
            const at = new Date(day);
            at.setHours(0, minutesOf(a), 0, 0);
            if (at > from) return at;
        }
    }
    return undefined;
}

export type OpenState = {open: true, closesSoon?: {spot: string, at: Date}} | {open: false, spot: string, opensAt?: Date};

/* Is the spot an item needs open now? Its own hours and every spot above it count. */
export function openState(spots: Spot[], where: string | undefined, now = new Date()): OpenState {
    const spot = byName(spots, where);
    if (!spot) return {open: true};
    let closesSoon: {spot: string, at: Date} | undefined;
    for (const s of pathTo(spots, spot).reverse()) {
        if (!s.hours) continue;
        const state = openAt(s.hours, now);
        if (!state.open) return {open: false, spot: s.name, opensAt: nextOpening(s.hours, now)};
        if (state.closesAt && state.closesAt.getTime() - now.getTime() <= 60 * 60000 && (!closesSoon || state.closesAt < closesSoon.at)) {
            closesSoon = {spot: s.name, at: state.closesAt};
        }
    }
    return closesSoon ? {open: true, closesSoon} : {open: true};
}

const timeWords = (at: Date) => at.toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"});

/* "Library opens Mon 10:00 AM", "Library closes 5:00 PM" */
export function hoursLine(state: OpenState, now = new Date()): string | undefined {
    if (state.open) {
        return state.closesSoon ? `${state.closesSoon.spot} closes ${timeWords(state.closesSoon.at)}` : undefined;
    }
    if (!state.opensAt) return `${state.spot} is closed`;
    const sameDay = state.opensAt.toDateString() === now.toDateString();
    const day = sameDay ? "" : `${state.opensAt.toLocaleDateString(undefined, {weekday: "short"})} `;
    return `${state.spot} opens ${day}${timeWords(state.opensAt)}`;
}

/* How long a pick lasts: until the next morning at 8 for a stay-put spot (In bed), otherwise three hours */
export const pickHours = 3;
export function pickUntil(spots: Spot[], spot: Spot, now = new Date()): Date {
    if (pathTo(spots, spot).some(s => s.staysPut)) {
        const morning = new Date(now);
        morning.setHours(8, 0, 0, 0);
        if (morning <= now) morning.setDate(morning.getDate() + 1);
        return morning;
    }
    return new Date(now.getTime() + pickHours * 3600000);
}

export const currentSpot = (spots: Spot[], whereabouts: Whereabouts | undefined, now = Date.now()) =>
    whereabouts && Date.parse(whereabouts.until) > now ? spots.find(s => s.id === whereabouts.spotId) : undefined;

/* The tree as it starts out, for the demo and as the seed (worker/migrations/0021_spots.sql) */
export const startingSpots: Spot[] = [
    {id: "anywhere", name: "Anywhere", position: 0},
    {id: "home", parentId: "anywhere", name: "Home", position: 0},
    {id: "mac", parentId: "home", name: "At my Mac", position: 0},
    {id: "bed", parentId: "home", name: "In bed", staysPut: true, position: 1},
    {id: "garage", parentId: "home", name: "Garage", position: 2},
    {id: "out", parentId: "anywhere", name: "Out", position: 1},
    {id: "library", parentId: "out", name: "Library", position: 0},
    {id: "park", parentId: "out", name: "Park", position: 1},
    {id: "school", parentId: "out", name: "School", position: 2},
    {id: "supermarket", parentId: "out", name: "Supermarket", position: 3},
    {id: "costco", parentId: "out", name: "Costco", position: 4},
    {id: "home-depot", parentId: "out", name: "Home Depot", position: 5}
];

/* What's wrong with a tree, if anything: one root, known parents, no loops, names unique */
export function treeProblem(spots: Spot[]): string | undefined {
    if (spots.length === 0 || spots.length > spotsMax) return `Keep 1 to ${spotsMax} spots.`;
    const roots = spots.filter(s => !s.parentId);
    if (roots.length !== 1) return "There must be exactly one spot at the top (Anywhere).";
    const ids = new Set(spots.map(s => s.id));
    if (ids.size !== spots.length) return "Two spots share an id.";
    const names = new Set<string>();
    for (const s of spots) {
        const name = s.name.trim();
        if (!name || name.length > spotNameMax) return `Each spot needs a name of 1 to ${spotNameMax} characters.`;
        if (names.has(name.toLowerCase())) return `Two spots are called "${name}".`;
        names.add(name.toLowerCase());
        if (s.parentId && !ids.has(s.parentId)) return `"${name}" sits under a spot that isn't there.`;
        if (s.hours !== undefined && !validHours(s.hours)) return `"${name}" has opening hours that don't read.`;
    }
    if (inOrder(spots).length !== spots.length) return "The spots loop back on themselves.";
    return undefined;
}
