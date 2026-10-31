export interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    /* Google OAuth client (Web application) */
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    /* The one Google account allowed in */
    ALLOWED_EMAIL: string;
    /* "1" only in .dev.vars: enables /auth/dev-login on localhost */
    DEV_LOGIN?: string;
}
