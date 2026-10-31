export class HttpError extends Error {
    constructor(public readonly status: number, message: string, public readonly body?: unknown) {
        super(message);
    }
}

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers}
    });

export function getCookie(request: Request, name: string): string | undefined {
    const header = request.headers.get("cookie") ?? "";
    for (const part of header.split(/;\s*/)) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq) === name) {
            return decodeURIComponent(part.slice(eq + 1));
        }
    }
    return undefined;
}

export const cookie = (name: string, value: string, maxAgeSeconds: number) =>
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;

export function randomToken(bytes = 32): string {
    const buffer = crypto.getRandomValues(new Uint8Array(bytes));
    return base64Url(buffer);
}

export function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return base64Url(new Uint8Array(digest));
}
