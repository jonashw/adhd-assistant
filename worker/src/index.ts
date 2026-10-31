import { handleAuth, requireUser } from "./auth";
import { Env } from "./env";
import { HttpError, json } from "./http";
import { deleteMap, listMaps, saveMap } from "./maps";
import { addVisit, clearSignal, getTrail, plantFlag } from "./trail";

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

export default {
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
