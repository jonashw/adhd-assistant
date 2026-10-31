# Running ADHD Assist on Cloudflare

One Worker serves the app, `/api`, `/auth` and the Claude connector (`/mcp`), and keeps the map in a D1 database.
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

   Turn off **Builds for Preview branches** (Settings → Build → Previews Base). PR builds always
   run `npx wrangler preview`, whatever the preview command says, and it fails until the config
   names a separate preview database. Google sign-in wouldn't work on preview URLs anyway; the
   Netlify preview covers the UI.

6. **Bring maps over.** On the old site, export each mind map (download button in the list).
   On the new site, sign in and use + → Import.

7. **Move the domain** when ready: in the Worker's settings add the custom domain
   `adhd.jonashw.dev`, add its `/auth/callback` URL to the Google client, then remove the
   domain from Netlify.

## The Claude connector (E4)

The same Worker is a remote MCP server at `/mcp`. Cloudflare's OAuth library
(`@cloudflare/workers-oauth-provider`) handles discovery, client registration and tokens;
the consent page at `/authorize` only lets the signed-in `ALLOWED_EMAIL` allow a connection.
Nothing secret is copied or pasted: Claude registers itself and sends you to the consent page.

1. **Create the KV namespace** the OAuth library keeps grants and tokens in, and put the id it
   prints into `wrangler.jsonc` (`kv_namespaces`, binding `OAUTH_KV`). The id is not a secret.
   `npx wrangler kv namespace create OAUTH_KV`

   If a Workers Builds deploy fails on the KV binding, give the build's API token Workers KV Storage Edit.

2. **Connect Claude.** In Claude: Settings → Connectors → Add custom connector, with the address
   `https://<your worker host>/mcp`. Claude opens the consent page; sign in with Google if asked and
   press Allow. The app's home screen lists connections under **Connected apps**, each with Revoke.

The connector's tools: `check_in`, `report_state`, `find_places`, `read_place`, `whats_next`.
It can't change places, statuses or links. Its instructions ask each thread to check in when work
starts and to report `waiting`, `working`, `done` or `failed` as its state changes; a project's own
instructions can repeat that if threads forget.

## Local development

Create `.dev.vars` (it is git-ignored):

```
DEV_LOGIN=1
ALLOWED_EMAIL=you@example.com
GOOGLE_CLIENT_ID=dev
GOOGLE_CLIENT_SECRET=dev
```

Then `npm run worker:dev` and open `http://localhost:8787/auth/dev-login` to sign in without
Google. Local KV needs no namespace id. To try the connector locally, point the MCP Inspector
(`npx @modelcontextprotocol/inspector`) at `http://localhost:8787/mcp`. `DEV_LOGIN` only works on localhost and must never be set as a deployed secret.

The Netlify SPA rewrite lives in `netlify.toml`, not `public/_redirects`: Cloudflare reads a `_redirects` file in the assets and rejects that rule as an infinite loop. The Worker's `not_found_handling` already does the same job.

Wrangler needs Node 22 or later (see `.nvmrc`).
