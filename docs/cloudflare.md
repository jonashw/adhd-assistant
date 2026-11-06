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

The connector's tools: `check_in`, `report_state`, `find_places`, `read_place`, `suggest_place`, `whats_next`, `sync_project`, `log_monologue`, and the to-do tools `add_checklist_items`, `list_checklist_items` and `complete_checklist_item`.
It can't change places, statuses or links. When no place fits, a thread suggests new names under the
closest place, and Jon charts the suggestion from What's next. Its instructions ask each thread to check in when work
starts and to report `waiting`, `working`, `done` or `failed` as its state changes; a project's own
instructions can repeat that if threads forget.

## The Claude map

A separate map, kept by Claude, at `/claude`: one region per opted-in Claude project, one node per thread,
each with a badge (Needs you, Ready to review, Working, Stuck, Stopped, Done). Double-click a node, or tap it
and press **Open in Claude**, to jump to that thread. Jon only reads it, and can hide a project from the list
view. Try it without a server at `/claude?demo`.

**Opting a project in.** Threads do the syncing: project coordinators don't get the connector, so they can't.
This repo's `CLAUDE.md` opts in every project that has the repo attached. For any other project, paste this
into its project instructions (or into Settings → Your Claude → Instructions to cover every project):

> ADHD Assist Claude map: if you are a thread in a Claude project and have both a list_threads tool and the
> ADHD Assist sync_project tool, call sync_project when you start work, whenever you call check_in or
> report_state, and as the last step of every turn, with the project's id and name and every one of its
> threads as list_threads gives them (id, title, state, created and last-activity times). If either tool is
> missing, skip this silently.

**What that covers.** A project syncs only while one of its threads is working. Each sync carries every thread,
so one active thread refreshes all of them. When a project goes quiet, its last snapshot stays, and after 4 hours
its open threads read "Not heard lately". A thread's last sync comes just before its turn ends, so it may still
read Working after it finishes, until another thread in the project syncs or the 4 hours pass.

**How it stays right.** Every snapshot carries the whole project, so any one Claude remembering brings every
thread up to date. Snapshots land in the `claude_snapshots` inbox before they are applied, and an older
snapshot never overwrites a newer state. A thread a snapshot leaves out is marked "Not seen lately", never
deleted. Decision record: "AA: Mirror Claude threads on the map".

**Glance cards.** Each thread also sends its own card with `sync_project` as `this_thread`: a one-line headline of
its latest reply, what it asks of Jon (question, decision, go-ahead or review), its checklist counted ("3 of 5",
the step in progress), its latest artifact, and a topic line with a few keywords. Any thread passes on the
project's PRs (`prs`, from the platform's PR list) with each matched to the thread that opened it, so the card shows
the PR number, state and checks. A card replaces the last one whole; a repeat keeps its time. "New" means the card
changed since Jon last opened that thread from the map. Every topic a thread has had stays searchable from the
list view, along with day words like "monday". To save tokens, a sync may leave `threads` out when no title or state
changed since the thread's last sync; the map then counts the last list as current. Decision record: "Richer
thread cards on the Claude map: design proposal" (Jon chose Glance).

**A thread's own state.** Claude's thread list only shows a thread as done (or waiting) after its turn ends, so a
thread's last sync of a turn always lists itself as working. To keep its badge from lagging a turn behind, that
sync sets `this_thread.state` to the state the thread ends its turn in. It counts as the newest word on that
thread until a later list from the platform says otherwise.

## Live updates

Every open tab keeps a WebSocket to one Durable Object, `LiveHub` (`worker/src/live.ts`), at `/api/live`. After
each write, from the app or from the connector, the Worker rings the hub with what changed (`maps`, `trail`,
`claude` or `monologues`, plus the map id where there is one), and each tab refetches just that piece from the
usual endpoints. The ring carries no data. A tab skips the ring for its own writes (the `x-live-tab` header).

- Nothing to set up: the binding and its migration are in `wrangler.jsonc`, and Workers Builds applies them on
  deploy. The class is SQLite-backed, which the free plan allows.
- The sockets hibernate, so the hub sleeps between rings; a tab's "ping" every 25 seconds is answered "pong"
  without waking it.
- If the socket drops, the tab shows a grey dot, retries with backoff, and refetches everything once it is back.
  Tabs also refetch when they come to the front, and take a safety look every 5 minutes while visible.
- A failed ring never fails the write.

## Read-only viewer token (for Claude's browser)

Claude's cloud sessions can't sign in with Google, so the app takes an optional read-only token.
A request carrying `Authorization: Bearer <VIEWER_TOKEN>` can read anything (every `GET` under `/api/`) and
nothing else: every write, the connector's consent page and sign-out still need a Google session.

1. Make a long random value (at least 32 characters; shorter values are refused):
   ```sh
   openssl rand -base64 32
   ```
2. Store it as a Worker secret: `npx wrangler secret put VIEWER_TOKEN`, or in the Cloudflare dashboard under
   the Worker's Settings, Variables and Secrets, as a Secret named `VIEWER_TOKEN`.
3. Give it to Claude as a **network secret**, not an environment variable: in the Claude cloud environment's
   settings, add it under Network secrets for the host `adhd-assist.2jonwilson.workers.dev` (and allow that
   domain). The environment's proxy then adds the header to requests for that host only. Claude's sessions,
   shell and browser never see the value, and it is never sent to any other host.

To revoke it, delete the secret or set a new value. Leaving `VIEWER_TOKEN` unset turns the feature off.

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
