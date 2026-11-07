import { Spot, pathTo } from "./spots";

/* Where the phone is, as one of Jon's spots, so Your move can say "Looks like you're at Costco. Show what fits?"

   Two ways a spot is recognised, best first:
   - a pin: one place (Home, his library branch), with a radius. Pins stay on this device, in localStorage; the server
     never learns where Jon is or lives.
   - a kind of place on OpenStreetMap (spot.osm, "brand=Costco", "amenity=library"): looked up near the phone through
     the public Overpass API, only when Jon has turned that on, because it sends the rough location to OpenStreetMap.

   It only ever suggests; Jon taps to pick. Nothing here runs with the app closed: arrival prompts need the phone's own
   automations (the PR after this one). */

export type Position = {lat: number, lng: number, accuracy: number};
export type Pin = {lat: number, lng: number, radius: number};
export type Pins = Record<string, Pin>;

const pinsKey = "where.pins";
const useLocationKey = "where.useLocation";
const nearbyKey = "where.lookUpNearby";
export const defaultPinRadius = 120;

const read = <T>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
};
const write = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // private mode or storage off: the setting just doesn't stick
    }
};

export const readPins = () => read<Pins>(pinsKey, {});
export const savePins = (pins: Pins) => write(pinsKey, pins);
export const readUseLocation = () => read<boolean>(useLocationKey, false);
export const saveUseLocation = (on: boolean) => write(useLocationKey, on);
export const readLookUpNearby = () => read<boolean>(nearbyKey, false);
export const saveLookUpNearby = (on: boolean) => write(nearbyKey, on);

export function currentPosition(maxAgeMs = 5 * 60000): Promise<Position> {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new Error("This browser can't tell where it is."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            p => resolve({lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy}),
            e => reject(new Error(e.code === e.PERMISSION_DENIED ? "Location is turned off for this site." : "Couldn't get a location.")),
            {enableHighAccuracy: false, maximumAge: maxAgeMs, timeout: 15000}
        );
    });
}

/* metres between two points */
export function distance(a: {lat: number, lng: number}, b: {lat: number, lng: number}): number {
    const r = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(h));
}

const depth = (spots: Spot[], spot: Spot) => pathTo(spots, spot).length;

/* The pinned spot the phone is in, the nearest if pins overlap. The fix's own error counts in its favour, up to a limit. */
export function pinnedSpot(spots: Spot[], pins: Pins, at: Position): Spot | undefined {
    const slack = Math.min(at.accuracy, 100);
    return spots
        .filter(s => pins[s.id])
        .map(s => ({s, d: distance(at, pins[s.id])}))
        .filter(({s, d}) => d <= pins[s.id].radius + slack)
        .sort((a, b) => a.d - b.d)[0]?.s;
}

const overpassUrl = "https://overpass-api.de/api/interpreter";
const quote = (v: string) => `"${v.replace(/["\\]/g, "")}"`;

/* The spot whose kind of place is right here, by asking OpenStreetMap what is within `radius` metres.
   A brand beats a generic kind (Costco over supermarket); then the deeper spot in the tree wins. */
export async function nearbySpot(spots: Spot[], at: Position, radius = 80, fetcher: typeof fetch = fetch): Promise<Spot | undefined> {
    const kinds = spots.filter(s => s.osm?.includes("="));
    if (kinds.length === 0) return undefined;
    const r = Math.round(Math.min(Math.max(radius, at.accuracy), 250));
    const filters = [...new Set(kinds.map(s => s.osm!))].map(tag => {
        const [k, ...v] = tag.split("=");
        return `nwr(around:${r},${at.lat.toFixed(5)},${at.lng.toFixed(5)})[${quote(k)}=${quote(v.join("="))}];`;
    });
    const query = `[out:json][timeout:10];(${filters.join("")});out tags 30;`;
    const response = await fetcher(overpassUrl, {method: "POST", body: new URLSearchParams({data: query})});
    if (!response.ok) throw new Error(`OpenStreetMap answered ${response.status}.`);
    const body = await response.json() as {elements?: {tags?: Record<string, string>}[]};
    const found = kinds.filter(s => {
        const [k, ...v] = s.osm!.split("=");
        return (body.elements ?? []).some(e => e.tags?.[k] === v.join("="));
    });
    return found.sort((a, b) => Number(b.osm!.startsWith("brand=")) - Number(a.osm!.startsWith("brand=")) || depth(spots, b) - depth(spots, a))[0];
}

/* Worth suggesting: not where Jon already said he is, nor a spot above it (In bed is still at Home) */
export function worthSuggesting(spots: Spot[], found: Spot | undefined, here: Spot | undefined): found is Spot {
    if (!found) return false;
    return !here || !pathTo(spots, here).some(s => s.id === found.id);
}
