export interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    /* grants and tokens for the Claude connector, kept by Cloudflare's OAuth library */
    OAUTH_KV: KVNamespace;
    /* Google OAuth client (Web application) */
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    /* The one Google account allowed in */
    ALLOWED_EMAIL: string;
    /* Optional: a long random value that lets a helper read (never write) with an Authorization: Bearer header */
    VIEWER_TOKEN?: string;
    /* "1" only in .dev.vars: enables /auth/dev-login on localhost */
    DEV_LOGIN?: string;
}
