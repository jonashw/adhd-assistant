import { handleAuth, requireUser } from "./auth";
import { Env } from "./env";
import { HttpError, json } from "./http";
import { deleteMap, listMaps, saveMap } from "./maps";
import { addVisit, clearSignal, getTrail, plantFlag } from "./trail";
import { addLink, forgetItem, placeItem, removeLink } from "./items";
import { handleConnections, providerFor } from "./connector";

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
    const email = await requireUser(request, env);
    // writes must come from this site's own pages
    if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
        throw new HttpError(403, "Cross-site request refused.");
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
        return json({email});
    }
    if (url.pathname === "/api/maps" && request.method === "GET") {
        return json(await listMaps(env));
    }
    const readJson = () => request.json().catch(() => {
        throw new HttpError(400, "The body must be JSON.");
    });
    if (url.pathname.startsWith("/api/connections")) {
        return handleConnections(request, env as Parameters<typeof handleConnections>[1], url, email);
    }
    const linkMatch = /^\/api\/maps\/([^/]+)\/places\/([^/]+)\/links(?:\/([^/]+)\/remove)?$/.exec(url.pathname);
    if (linkMatch && request.method === "POST") {
        const [mapId, noteId, itemId] = linkMatch.slice(1).map(part => part === undefined ? undefined : decodeURIComponent(part));
        if (!mapId || !noteId) {
            throw new HttpError(404, "Not found.");
        }
        const place = {mapId, noteId};
        if (itemId) {
            await removeLink(env, place, itemId);
            return new Response(null, {status: 204});
        }
        return json(await addLink(env, place, await readJson()), 201);
    }
    const itemMatch = /^\/api\/items\/([^/]+)\/(place|forget)$/.exec(url.pathname);
    if (itemMatch && request.method === "POST") {
        const itemId = decodeURIComponent(itemMatch[1]);
        if (itemMatch[2] === "forget") {
            await forgetItem(env, itemId);
            return new Response(null, {status: 204});
        }
        const body = await readJson() as {mapId?: unknown, noteId?: unknown};
        if (typeof body?.mapId !== "string" || typeof body.noteId !== "string") {
            throw new HttpError(422, "Pick a place.");
        }
        return json(await placeItem(env, itemId, {mapId: body.mapId, noteId: body.noteId}));
    }
    const trailMatch = /^\/api\/maps\/([^/]+)\/(trail|visits|signals)(?:\/([^/]+)\/clear)?$/.exec(url.pathname);
    if (trailMatch) {
        const [, rawId, what, signalId] = trailMatch;
        const id = decodeURIComponent(rawId);
        if (what === "trail" && request.method === "GET" && !signalId) {
            return json(await getTrail(env, id));
        }
        if (what === "visits" && request.method === "POST" && !signalId) {
            return json(await addVisit(env, id, await readJson()), 201);
        }
        if (what === "signals" && request.method === "POST") {
            if (signalId) {
                await clearSignal(env, id, decodeURIComponent(signalId));
                return new Response(null, {status: 204});
            }
            return json(await plantFlag(env, id, await readJson()), 201);
        }
        throw new HttpError(404, "Not found.");
    }
    const mapMatch = /^\/api\/maps\/([^/]+)$/.exec(url.pathname);
    if (mapMatch) {
        const id = decodeURIComponent(mapMatch[1]);
        switch (request.method) {
            case "GET": {
                const [map] = await listMaps(env, id);
                return map ? json(map) : json({error: "No such map."}, 404);
            }
            case "PUT": {
                return json(await saveMap(env, id, await readJson()));
            }
            case "DELETE":
                await deleteMap(env, id);
                return new Response(null, {status: 204});
        }
    }
    throw new HttpError(404, "Not found.");
}

const app = {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        try {
            if (url.pathname.startsWith("/auth/")) {
                return await handleAuth(request, env, url);
            }
            if (url.pathname.startsWith("/api/")) {
                return await handleApi(request, env, url);
            }
            return env.ASSETS.fetch(request);
        } catch (e) {
            if (e instanceof HttpError) {
                return json({error: e.message, ...(e.body as object ?? {})}, e.status);
            }
            console.error(e);
            return json({error: "Something went wrong on the server."}, 500);
        }
    }
} satisfies ExportedHandler<Env>;

/* The OAuth provider answers the connector's protocol routes and guards /mcp; everything else is the app */
export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        return providerFor(new URL(request.url).origin, app).fetch(request, env, ctx);
    }
} satisfies ExportedHandler<Env>;
