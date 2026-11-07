import { handleAuth, requireReader, requireUser } from "./auth";
import { Env } from "./env";
import { HttpError, json } from "./http";
import { deleteMap, listMaps, listRevisions, saveMap } from "./maps";
import { addVisit, clearSignal, getTrail, plantFlag } from "./trail";
import { settleStake } from "./stakes";
import { addLink, forgetItem, placeItem, removeLink } from "./items";
import { handleConnections, providerFor } from "./connector";
import { getMedia, uploadMedia } from "./media";
import { getClaudeSnapshot, listClaudeLog, listClaudeMap, markArtifactOpened, markThreadOpened, setProjectHidden, setThreadAside } from "./claude";
import { getMonologue, listMonologues, rereadMonologue } from "./monologues";
import { removeChecklistItem, setChecklistDone, setChecklistInterest } from "./checklist";
import { openLive, ring, ringsFor } from "./live";
import { getWhere, saveSpots, setAskWhere, setTodoWhere, setWhere } from "./spots";
import { createHookToken, handleHook, latestArrival, listHookTokens, pushCount, pushKey, revokeHookToken, subscribePush, unsubscribePush } from "./arrivals";

export { LiveHub } from "./live";

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
    // reads may use the viewer token; writes always need a signed-in session
    const email = request.method === "GET" ? await requireReader(request, env) : await requireUser(request, env);
    // writes must come from this site's own pages
    if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
        throw new HttpError(403, "Cross-site request refused.");
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
        return json({email});
    }
    if (url.pathname === "/api/live" && request.method === "GET") {
        return openLive(request, env);
    }
    if (url.pathname === "/api/maps" && request.method === "GET") {
        return json(await listMaps(env));
    }
    if (url.pathname === "/api/maps/revisions" && request.method === "GET") {
        return json(await listRevisions(env));
    }
    if (url.pathname === "/api/claude-map" && request.method === "GET") {
        return json(await listClaudeMap(env));
    }
    if (url.pathname === "/api/claude-map/log" && request.method === "GET") {
        return json(await listClaudeLog(env, url.searchParams.get("before")));
    }
    const syncMatch = /^\/api\/claude-map\/syncs\/([0-9a-f]{64})$/.exec(url.pathname);
    if (syncMatch && request.method === "GET") {
        return json(await getClaudeSnapshot(env, syncMatch[1]));
    }
    if (url.pathname === "/api/monologues" && request.method === "GET") {
        return json(await listMonologues(env));
    }
    const monologueMatch = /^\/api\/monologues\/([^/]+)$/.exec(url.pathname);
    if (monologueMatch && request.method === "GET") {
        const monologue = await getMonologue(env, decodeURIComponent(monologueMatch[1]));
        return monologue ? json(monologue) : json({error: "No such monologue."}, 404);
    }
    const rereadMatch = /^\/api\/monologues\/([^/]+)\/read$/.exec(url.pathname);
    if (rereadMatch && request.method === "POST") {
        const monologue = await rereadMonologue(env, decodeURIComponent(rereadMatch[1]));
        return monologue ? json(monologue) : json({error: "No such monologue."}, 404);
    }
    const hideMatch = /^\/api\/claude-map\/projects\/([^/]+)\/(hide|show)$/.exec(url.pathname);
    if (hideMatch && request.method === "POST") {
        await setProjectHidden(env, decodeURIComponent(hideMatch[1]), hideMatch[2] === "hide");
        return new Response(null, {status: 204});
    }
    const openedMatch = /^\/api\/claude-map\/threads\/([^/]+)\/opened$/.exec(url.pathname);
    if (openedMatch && request.method === "POST") {
        await markThreadOpened(env, decodeURIComponent(openedMatch[1]));
        return new Response(null, {status: 204});
    }
    const asideMatch = /^\/api\/claude-map\/threads\/([^/]+)\/set-aside$/.exec(url.pathname);
    if (asideMatch && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {until?: unknown};
        await setThreadAside(env, decodeURIComponent(asideMatch[1]), typeof body.until === "string" ? body.until : null);
        return new Response(null, {status: 204});
    }
    const askWhereMatch = /^\/api\/claude-map\/threads\/([^/]+)\/where$/.exec(url.pathname);
    if (askWhereMatch && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {where?: unknown};
        await setAskWhere(env, decodeURIComponent(askWhereMatch[1]), body.where);
        return new Response(null, {status: 204});
    }
    // where Jon can be (his spots) and where he is now
    if (url.pathname === "/api/where" && request.method === "GET") {
        return json(await getWhere(env));
    }
    if (url.pathname === "/api/where" && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {spotId?: unknown, until?: unknown};
        await setWhere(env, typeof body.spotId === "string" ? body.spotId : null, typeof body.until === "string" ? body.until : undefined);
        return new Response(null, {status: 204});
    }
    if (url.pathname === "/api/where/spots" && request.method === "PUT") {
        return json(await saveSpots(env, await request.json().catch(() => undefined)));
    }
    // arrival alerts: notifications on this phone, and keys for the phone's automations
    if (url.pathname === "/api/push/key" && request.method === "GET") {
        let publicKey: string | undefined, problem: string | undefined;
        try {
            publicKey = pushKey(env);
        } catch (e) {
            problem = e instanceof Error ? e.message : String(e);
        }
        return json({publicKey, problem, subscriptions: await pushCount(env)});
    }
    if (url.pathname === "/api/push/latest" && request.method === "GET") {
        return json(await latestArrival(env));
    }
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
        await subscribePush(env, await request.json().catch(() => undefined));
        return new Response(null, {status: 204});
    }
    if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {endpoint?: unknown};
        await unsubscribePush(env, body.endpoint);
        return new Response(null, {status: 204});
    }
    if (url.pathname === "/api/hooks" && request.method === "GET") {
        return json(await listHookTokens(env));
    }
    if (url.pathname === "/api/hooks" && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {label?: unknown};
        return json(await createHookToken(env, body.label), 201);
    }
    const hookRevokeMatch = /^\/api\/hooks\/([^/]+)\/revoke$/.exec(url.pathname);
    if (hookRevokeMatch && request.method === "POST") {
        await revokeHookToken(env, decodeURIComponent(hookRevokeMatch[1]));
        return new Response(null, {status: 204});
    }
    const todoWhereMatch = /^\/api\/checklist\/([^/]+)\/where$/.exec(url.pathname);
    if (todoWhereMatch && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as {where?: unknown};
        await setTodoWhere(env, decodeURIComponent(todoWhereMatch[1]), body.where);
        return new Response(null, {status: 204});
    }
    const artifactMatch = /^\/api\/claude-map\/artifacts\/(\d{1,15})\/opened$/.exec(url.pathname);
    if (artifactMatch && request.method === "POST") {
        await markArtifactOpened(env, Number(artifactMatch[1]));
        return new Response(null, {status: 204});
    }
    const mediaMatch = /^\/api\/media\/([^/]+)$/.exec(url.pathname);
    if (mediaMatch && request.method === "GET") {
        return getMedia(env, decodeURIComponent(mediaMatch[1]));
    }
    const uploadMatch = /^\/api\/maps\/([^/]+)\/media$/.exec(url.pathname);
    if (uploadMatch && request.method === "POST") {
        return json(await uploadMedia(env, request, decodeURIComponent(uploadMatch[1]), url.searchParams.get("place")), 201);
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
    const interestMatch = /^\/api\/checklist\/([^/]+)\/interest\/(up|down|clear)$/.exec(url.pathname);
    if (interestMatch && request.method === "POST") {
        const answer = interestMatch[2];
        await setChecklistInterest(env, decodeURIComponent(interestMatch[1]), answer === "clear" ? undefined : answer as "up" | "down");
        return new Response(null, {status: 204});
    }
    const checklistMatch = /^\/api\/checklist\/([^/]+)\/(check|uncheck|remove)$/.exec(url.pathname);
    if (checklistMatch && request.method === "POST") {
        const id = decodeURIComponent(checklistMatch[1]);
        if (checklistMatch[2] === "remove") {
            await removeChecklistItem(env, id);
        } else {
            await setChecklistDone(env, id, checklistMatch[2] === "check");
        }
        return new Response(null, {status: 204});
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
    const stakeMatch = /^\/api\/maps\/([^/]+)\/stakes\/([^/]+)\/settle$/.exec(url.pathname);
    if (stakeMatch && request.method === "POST") {
        await settleStake(env, decodeURIComponent(stakeMatch[1]), decodeURIComponent(stakeMatch[2]), await readJson());
        return new Response(null, {status: 204});
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
            // the phone's automations call this with an arrival key, not a signed-in session
            if (url.pathname === "/api/hook/arrive") {
                const result = await handleHook(request, env, url);
                await ring(env, [{topic: "claude"}], undefined);
                return json(result);
            }
            if (url.pathname.startsWith("/api/")) {
                const response = await handleApi(request, env, url);
                // every open tab hears what this write changed, and says it back so this tab can tell its neighbours
                const rings = response.ok ? ringsFor(request.method, url.pathname) : [];
                if (rings.length > 0) {
                    await ring(env, rings, request.headers.get("x-live-tab") ?? undefined);
                    response.headers.set("x-live-ring", JSON.stringify(rings));
                }
                return response;
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
