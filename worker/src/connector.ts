import OAuthProvider, { AuthorizationError, CimdFetchError, ConsentDescription, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Env } from "./env";
import { HttpError, json } from "./http";
import { mcpHandler } from "./mcp";
import { requireUser } from "./auth";

/* OAuth for the Claude connector. Cloudflare's library runs the protocol (discovery, client registration,
   tokens, revocation) and keeps grants in KV; this file owns the consent page, which only Jon, signed in
   with Google, can pass. No secret is ever copied or pasted. */

export const connectorScope = "map";

const escape = (value: string) => value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function consentPage(details: ConsentDescription, handle: string): string {
    const name = escape(details.clientName || "An app");
    const origin = details.clientDomain
        ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
        : "It registered itself, so its name isn't verified.";
    return `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Connect ${name} to ADHD Assist</title>
<style>body{font-family:system-ui,sans-serif;max-width:32em;margin:2em auto;padding:0 16px;line-height:1.5}
button{font:inherit;padding:.5em 1.2em;margin-right:.5em}</style>
<h1>Let ${name} read your map and raise signals on it?</h1>
<p>${origin} Access goes to <strong>${escape(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? "<p><strong>This sends access to an app on this computer.</strong> Allow it only if you just started connecting from it.</p>" : ""}
<p>It will be able to find and read your places, ask What's next, check its threads in and say when they need you.
It can't change places, statuses or links. You can revoke it any time under Connected apps.</p>
<form method="post">
<input type="hidden" name="handle" value="${escape(handle)}">
<button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button>
</form>`;
}

const textPage = (status: number, message: string) =>
    new Response(`<!doctype html><meta name="viewport" content="width=device-width"><p style="font-family:sans-serif;margin:2em">${escape(message)}</p>`,
        {status, headers: {"content-type": "text/html; charset=utf-8"}});

type ProviderEnv = Env & {OAUTH_PROVIDER: OAuthHelpers};

async function authorize(request: Request, env: ProviderEnv, url: URL): Promise<Response> {
    let email: string;
    try {
        email = await requireUser(request, env);
    } catch {
        // sign in with Google first, then come back here
        return Response.redirect(`${url.origin}/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
    }
    const oauth = env.OAUTH_PROVIDER;
    try {
        if (request.method === "GET") {
            const authRequest = await oauth.parseAuthRequest(request);
            const details = await oauth.describeConsent(authRequest);
            const consent = await oauth.beginConsent(authRequest);
            consent.headers.set("content-type", "text/html; charset=utf-8");
            return new Response(consentPage(details, consent.handle), {headers: consent.headers});
        }
        if (request.method === "POST") {
            const form = await request.formData();
            const handle = String(form.get("handle") ?? "");
            if (form.get("decision") !== "approve") {
                const denied = await oauth.denyConsent(request, handle);
                return new Response(null, {status: 302, headers: denied.headers});
            }
            const approved = await oauth.approveConsent(request, handle, {scope: [connectorScope]});
            const client = await oauth.lookupClient(approved.request.clientId);
            const {redirectTo} = await oauth.completeAuthorization({
                request: approved.request,
                userId: email,
                metadata: {clientName: client?.clientName ?? "Unnamed app"},
                scope: [connectorScope],
                props: {email},
                // reconnecting the same app replaces its old connection instead of piling up
                revokeExistingGrants: true
            });
            approved.headers.set("location", redirectTo);
            return new Response(null, {status: 302, headers: approved.headers});
        }
        return textPage(405, "Not allowed.");
    } catch (error) {
        if (error instanceof AuthorizationError && error.redirectTo) {
            return Response.redirect(error.redirectTo, 302);
        }
        if (error instanceof AuthorizationError) {
            return textPage(400, error.description ?? "This connection request expired. Start again from Claude.");
        }
        if (error instanceof CimdFetchError) {
            return textPage(400, "This app could not be verified.");
        }
        throw error;
    }
}

export type Connection = {id: string, name: string, connectedAt: string};

/* Connected apps: Jon sees each grant and can revoke it (NFR-3) */
export async function handleConnections(request: Request, env: ProviderEnv, url: URL, email: string): Promise<Response> {
    const oauth = env.OAUTH_PROVIDER;
    if (url.pathname === "/api/connections" && request.method === "GET") {
        const {items} = await oauth.listUserGrants(email, {limit: 100});
        const connections: Connection[] = items.map(g => ({
            id: g.id,
            name: g.metadata?.clientName ?? g.clientId,
            connectedAt: new Date(g.createdAt * 1000).toISOString()
        }));
        return json(connections);
    }
    const revoke = /^\/api\/connections\/([^/]+)\/revoke$/.exec(url.pathname);
    if (revoke && request.method === "POST") {
        await oauth.revokeGrant(decodeURIComponent(revoke[1]), email);
        return new Response(null, {status: 204});
    }
    throw new HttpError(404, "Not found.");
}

/* One provider per origin, so the connector's address follows whichever host the Worker is reached on */
const providers = new Map<string, OAuthProvider<Env>>();

export function providerFor(origin: string, defaultHandler: ExportedHandler<Env>): OAuthProvider<Env> {
    let provider = providers.get(origin);
    if (!provider) {
        provider = new OAuthProvider<Env>({
            apiRoute: "/mcp",
            apiHandler: mcpHandler as unknown as ExportedHandler<Env> & {fetch: NonNullable<ExportedHandler<Env>["fetch"]>},
            defaultHandler: {
                fetch(request, env, ctx) {
                    const url = new URL(request.url);
                    if (url.pathname === "/authorize") {
                        return authorize(request, env as ProviderEnv, url);
                    }
                    return defaultHandler.fetch!(request, env, ctx);
                }
            },
            authorizeEndpoint: "/authorize",
            tokenEndpoint: "/oauth/token",
            clientRegistrationEndpoint: "/oauth/register",
            scopesSupported: [connectorScope],
            requiredScopes: [connectorScope],
            resourceMetadata: {
                resource: `${origin}/mcp`,
                authorization_servers: [origin],
                resource_name: "ADHD Assist"
            },
            // a connection lasts while Claude keeps using it, and lapses after 90 idle days
            refreshTokenTTL: 90 * 86400,
            refreshTokenIdleTTL: 90 * 86400
        });
        providers.set(origin, provider);
    }
    return provider;
}
