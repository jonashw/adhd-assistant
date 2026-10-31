# Running ADHD Assist on Cloudflare

One Worker serves the app, `/api` and `/auth`, and keeps the map in a D1 database.
Only one Google account can sign in. Until the domain moves, the Netlify site keeps
working as before and stores maps in the browser only.

## One-time setup

1. **Sign in to Cloudflare from this repo.**
   `npx wrangler login`

2. **Create the database** and copy the `database_id` it prints into `wrangler.jsonc`.
   `npx wrangler d1 create adhd-assist`

3. **Create a Google OAuth client** in Google Cloud Console → APIs & Services → Credentials →
   Create credentials → OAuth client ID → Web application.
   - Authorized redirect URIs: `https://<your worker host>/auth/callback`
     (for example `https://adhd-assist.<account>.workers.dev/auth/callback`, and later
     `https://adhd.jonashw.dev/auth/callback`)
   - The consent screen only needs the `openid` and `email` scopes.

4. **Store the secrets** (each command prompts for the value):
   ```
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put ALLOWED_EMAIL
   ```
   `ALLOWED_EMAIL` is the one Google address allowed in.

5. **Deploy.** This builds the app, applies database migrations and deploys the Worker:
   `npm run worker:deploy`

   After the first deploy, let Cloudflare deploy every push to `main` (Workers Builds):
   Workers & Pages → adhd-assist → Settings → Build → connect `jonashw/adhd-assistant`, then set
   - Build command: `npm run build`
   - Deploy command: `npx wrangler d1 migrations apply adhd-assist --remote && npx wrangler deploy`

   If the migration step fails with an auth error, give the build's API token D1 Edit.

6. **Bring maps over.** On the old site, export each mind map (download button in the list).
   On the new site, sign in and use + → Import.

7. **Move the domain** when ready: in the Worker's settings add the custom domain
   `adhd.jonashw.dev`, add its `/auth/callback` URL to the Google client, then remove the
   domain from Netlify.

## Local development

Create `.dev.vars` (it is git-ignored):

```
DEV_LOGIN=1
ALLOWED_EMAIL=you@example.com
GOOGLE_CLIENT_ID=dev
GOOGLE_CLIENT_SECRET=dev
```

Then `npm run worker:dev` and open `http://localhost:8787/auth/dev-login` to sign in without
Google. `DEV_LOGIN` only works on localhost and must never be set as a deployed secret.

The Netlify SPA rewrite lives in `netlify.toml`, not `public/_redirects`: Cloudflare reads a `_redirects` file in the assets and rejects that rule as an infinite loop. The Worker's `not_found_handling` already does the same job.

Wrangler needs Node 22 or later (see `.nvmrc`).
