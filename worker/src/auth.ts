import { Env } from "./env";
import { HttpError, cookie, getCookie, randomToken, sha256 } from "./http";

const sessionCookie = "__Host-session";
const stateCookie = "__Host-oauth_state";
const sessionDays = 30;

const redirect = (location: string, setCookies: string[] = []) => {
    const headers = new Headers({location});
    setCookies.forEach(c => headers.append("set-cookie", c));
    return new Response(null, {status: 302, headers});
};

const page = (status: number, message: string) =>
    new Response(
        `<!doctype html><meta name="viewport" content="width=device-width"><title>ADHD Assist</title>` +
        `<p style="font-family:sans-serif;margin:2em">${message} <a href="/">Back</a></p>`,
        {status, headers: {"content-type": "text/html; charset=utf-8"}});

async function startSession(env: Env, email: string): Promise<string> {
    const token = randomToken();
    const now = new Date();
    const expires = new Date(now.getTime() + sessionDays * 864e5);
    await env.DB.prepare("INSERT INTO sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(await sha256(token), email, now.toISOString(), expires.toISOString())
        .run();
    return cookie(sessionCookie, token, sessionDays * 86400);
}

/* The signed-in email, or a 401 */
export async function requireUser(request: Request, env: Env): Promise<string> {
    const token = getCookie(request, sessionCookie);
    if (token) {
        const row = await env.DB.prepare("SELECT email FROM sessions WHERE token_hash = ? AND expires_at > ?")
            .bind(await sha256(token), new Date().toISOString())
            .first<{email: string}>();
        if (row && row.email === env.ALLOWED_EMAIL.toLowerCase()) {
            return row.email;
        }
    }
    throw new HttpError(401, "Sign in first.");
}

type IdTokenClaims = {iss: string, aud: string, exp: number, email?: string, email_verified?: boolean};

function decodeIdToken(idToken: string): IdTokenClaims {
    const payload = idToken.split(".")[1] ?? "";
    const text = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(text);
}

export async function handleAuth(request: Request, env: Env, url: URL): Promise<Response> {
    const redirectUri = `${url.origin}/auth/callback`;

    if (url.pathname === "/auth/login") {
        const state = randomToken(16);
        const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        google.search = new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid email",
            state,
            prompt: "select_account"
        }).toString();
        return redirect(google.toString(), [cookie(stateCookie, state, 600)]);
    }

    if (url.pathname === "/auth/callback") {
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!code || !state || state !== getCookie(request, stateCookie)) {
            return page(400, "That sign-in link expired. Please try again.");
        }
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {"content-type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                code,
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: "authorization_code"
            })
        });
        if (!tokenResponse.ok) {
            return page(502, "Google sign-in failed. Please try again.");
        }
        const {id_token} = await tokenResponse.json<{id_token?: string}>();
        // The ID token came straight from Google's token endpoint over TLS, so its claims are checked
        // without verifying the signature (OpenID Connect Core 3.1.3.7)
        const claims = id_token ? decodeIdToken(id_token) : undefined;
        const valid = claims
            && claims.aud === env.GOOGLE_CLIENT_ID
            && ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)
            && claims.exp * 1000 > Date.now()
            && claims.email_verified === true;
        const email = claims?.email?.toLowerCase();
        if (!valid || !email || email !== env.ALLOWED_EMAIL.toLowerCase()) {
            return page(403, "This Google account can't use ADHD Assist.");
        }
        return redirect("/", [await startSession(env, email), cookie(stateCookie, "", 0)]);
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
        const token = getCookie(request, sessionCookie);
        if (token) {
            await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
        }
        return new Response(null, {status: 204, headers: {"set-cookie": cookie(sessionCookie, "", 0)}});
    }

    // For local development only: wrangler dev with DEV_LOGIN=1 in .dev.vars
    if (url.pathname === "/auth/dev-login" && env.DEV_LOGIN === "1" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
        return redirect("/", [await startSession(env, env.ALLOWED_EMAIL.toLowerCase())]);
    }

    throw new HttpError(404, "Not found.");
}
