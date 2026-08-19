# Nutrition

An AI-first calorie tracker. You say what you ate; it produces structured nutrition data.

> "I had two eggs, toast and some cheese."
> → **Breakfast · ~407 kcal · 24g protein.** You're at 407 of 2,290.

## Why it's built this way

The product is one continuous conversation, so three constraints drove the architecture:

1. **The conversation is a view, not the source of truth.** Meals live in `food_entries`
   / `food_items`. Chat messages live separately. "There was more rice" *mutates the
   existing entry* rather than appending a correction — which is why food is stored per
   item rather than as one blob per meal.
2. **The web app is only a client of the API.** No database access from Next.js, no
   business logic in React. That's what makes the React Native migration a new UI shell
   rather than a rewrite.
3. **A day is not a calendar day.** Every entry stores `local_date`, computed at write
   time from your timezone and a configurable `day_start_hour` (default 04:00), so a 1am
   snack counts toward the evening it belongs to.

## Layout

```
apps/
  api/       Fastify + Postgres. Owns all data and the agent.
  web/       Next.js. Talks to the API and nothing else.
packages/
  shared/    Zod schemas + types — the wire contract.
  api-client/  fetch-only client. No node imports, so RN can use it as-is.
```

## Phone and desktop are different layouts, not one scaled

Below `lg` it is a phone: single column, bottom tab bar, the day on its own tab.
From `lg` up the sidebar takes over navigation and each screen composes itself for
the width — Today splits into a sticky ring column and a meal list, Progress and
Setup become two-column grids, and from `xl` the journal keeps a live day rail
beside the conversation so logging a meal visibly moves the ring.

Colour lives in `app/globals.css` as iOS system tokens. Indigo carries calories and
every interactive accent; the macros are spaced around the wheel (green protein,
cyan carbs, pink fat, teal exercise) so no two read alike in a row of bars. Changing
the accent is one token — `--calories`, in both the light and dark blocks.

## Running it

Needs Docker (for Postgres), Node 22+, pnpm, and a signed-in Claude Code
(`claude`) on the same machine.

```bash
pnpm install
cp .env.example .env
pnpm db:up                    # Postgres on :5433
pnpm migrate
pnpm dev                      # API on :4000, web on :3000
```

Open http://localhost:3000, create an account, and the journal will interview you.
Then optionally `pnpm seed -- --email=you@example.com` for 21 days of demo history.

Other scripts: `pnpm typecheck`, `pnpm build`, `pnpm db:reset` (drop the volume and
start over). Don't run `build` while `dev` is running — they share `apps/web/.next`
and will corrupt each other.

## The AI runs on your Claude Code subscription

The journal is built on the **Claude Agent SDK**, which reads the OAuth credentials
`claude` writes to `~/.claude/.credentials.json`. There is no API key and no
per-token billing.

Two consequences worth knowing:

- Rate limits are shared with your own Claude Code usage. A heavy session at the
  terminal and a meal log compete for the same budget.
- Anthropic's docs say third-party developers may not *offer* claude.ai login for
  their products. A tool only you use isn't that, but it is their line to draw — if
  this ever becomes something other people sign into, move it to an API key.

Setting `ANTHROPIC_API_KEY` overrides the subscription and bills per token instead.

## Accounts

Email and password, hashed with node's built-in scrypt, with server-side sessions in
an httpOnly cookie. No third-party auth service.

- The first account is always allowed. Set `ALLOW_SIGNUP=false` afterwards to close
  registration.
- Set `SECURE_COOKIES=true` when serving over HTTPS.
- Upgrading from the single-user build: the first signup adopts the existing
  credential-less row, so nothing already logged is orphaned.

## How the AI layer works

One agent, two groups of tools. The plan's logging / analysis / coaching split is
expressed as tool groups rather than three prompts, so the model routes between them
itself:

| Writes | Reads |
|---|---|
| `log_food`, `log_exercise`, `log_weight` | `get_day` |
| `update_food_entry`, `delete_entry` | `search_food_history`, `get_progress` |
| `set_profile` | |

They run as an **in-process MCP server** — no subprocess per call, straight into the
same services the REST routes use. Every built-in Claude Code tool is stripped
(`tools: []`) and `settingSources: []` keeps your personal `~/.claude` config, skills
and CLAUDE.md out of the nutrition agent.

`search_food_history` is what makes "my usual breakfast" work — it looks up what you
actually ate before and reuses those quantities, so personal memory falls out of the
logging you already did rather than being a separate feature.

The system prompt is assembled in three parts: a stable half, a volatile half with
today's numbers and entry ids, and — only while the profile is incomplete — an
onboarding brief.

## First run

A new account has no height, age, sex, goal or weight, so its targets are generic
defaults. Rather than sending someone to a settings form, the journal opens in **setup
mode**: the agent introduces itself, asks for two or three things at a time, and calls
`set_profile` the moment it learns a value. It accepts whatever units you use
(pounds, stones, feet and inches, an age instead of a birth date), maps vague answers
like "pretty active" onto the closest option and says which it picked, and will happily
log a meal mid-interview and then pick up where it left off.

When the last value lands, targets are recalculated, the account is marked onboarded,
and the status bar stops flagging the target as a placeholder. The Setup screen remains
for editing any of it later.

Model lives in `apps/api/src/ai/client.ts` (`claude-opus-5`). Effort is managed by the
Agent SDK harness rather than set per request.

## Migrating to React Native

Unchanged: `apps/api`, `packages/shared`, `packages/api-client`.

Replaced: `apps/web` becomes `apps/mobile`. Screens map one to one (Login, Journal,
Today, Progress, Setup), and the state each one holds is already local to the
component. Three things need real work:

- **Styling.** The UI is shadcn/Tailwind; RN needs its own. The design tokens in
  `app/globals.css` are already iOS system colours, so they port as constants.
- **Camera.** `expo-image-picker` replaces the `<input type="file">` in
  `Composer.tsx`, producing the same base64 payload the API already takes.
- **Session.** Cookies are awkward on RN — construct the client with a bearer token
  from secure storage instead. The API would need to accept `Authorization: Bearer`
  alongside the cookie, which is a few lines in the session hook.

One caveat: the Agent SDK spawns a local `claude` process, so the API must run on a
machine with Claude Code installed. A phone talks to that machine over the network; it
cannot host the agent itself.

## Deploying to a server

Runs at **https://eat.webwork.bg** on the same VPS as the trading bot, using the
same pattern: its own compose stack in `/srv/calorytracker`, joined to the shared
external `web` network, fronted by the Caddy that `site_maker` owns. Nothing
publishes a port.

```
                    internet
                       │  :443
              ┌────────▼─────────┐
              │ Caddy (site_maker)│  TLS, security headers, 32MB body cap
              └────────┬─────────┘
                       │  docker network `web`
              ┌────────▼─────────┐
              │ calorytracker-web│  Next.js — the only container on `web`
              └────────┬─────────┘
                       │  private network `internal`
          ┌────────────┴───────────┐
   ┌──────▼──────┐          ┌──────▼──────┐
   │     api     │          │ db (Postgres)│
   │ + agent     │          │  volume      │
   └─────────────┘          └──────────────┘
```

The API and the database are deliberately **not** on `web`: they hold the
credentials and run the agent, and nothing on the shared network needs them.
Only the Next.js container is reachable, and it proxies to the API internally.

### Reverse proxy

The route lives in the **site_maker** repo, not this one:
`site_maker/caddy/Caddyfile`, block `eat.webwork.bg`. It must stay more specific
than the `*.webwork.bg` wildcard or requests fall through to the hosting
app-runner and get a "domain not found" page. Reload Caddy there after changing it.

### First-time setup on the host

Not automated: it needs secrets and an interactive Claude login, and happens once.

```bash
# DNS first — an A record for eat.webwork.bg pointing at the VPS. Caddy issues the
# certificate over HTTP-01 on first request, which cannot work until DNS resolves.

git clone <this repo> /srv/calorytracker && cd /srv/calorytracker

cat > .env <<'ENV'
POSTGRES_PASSWORD=<generate a long random string>
TZ=Europe/Sofia
ALLOW_SIGNUP=true      # flip to false once your account exists
ENV

docker network create web        # only if this host has never run the bot/site_maker

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d db

# The agent runs on the Claude Code subscription, so log in once. The token lives
# in the claude-home volume and survives rebuilds.
docker compose -f docker-compose.prod.yml run --rm api pnpm exec claude login

docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
```

Then open https://eat.webwork.bg, create your account, and let the journal
interview you. Afterwards set `ALLOW_SIGNUP=false` in `.env` and
`docker compose -f docker-compose.prod.yml up -d api` to close registration.

Prefer per-token billing to the subscription login? Put `ANTHROPIC_API_KEY` in
`.env` and skip the `claude login` step.

### Shipping a change

```bash
bin/deploy.sh --push          # push local main, then deploy it
bin/deploy.sh --dry-run       # show the plan, change nothing
bin/deploy.sh --ref <sha>     # deploy, or roll back to, a specific commit
bin/deploy.sh --build always  # force a rebuild of both images
```

Set `DEPLOY_SSH_HOST=user@host` (and `DEPLOY_PATH` if not `/srv/calorytracker`).
The script SSHes in, **pg_dumps the database first**, fast-forwards the host's
clone to a commit already on origin, rebuilds only the images whose inputs
changed, and verifies the result. Nothing is copied from your laptop, so an
unpushed commit cannot deploy.

Two things to know:

- **Migrations run when the API boots**, so schema and code ship together. That
  also means rolling the code back does *not* undo a migration — restore from
  `.deploy-backups/` on the host if a schema change is the problem. The script
  says so explicitly when the deploy included one.
- **Both images compile their code in**, so unlike the bot nothing is live
  without a rebuild. Anything under `packages/` rebuilds both.

### Two footguns worth knowing

- `docker-compose.yml` (dev) and `docker-compose.prod.yml` sit in the same
  directory. Both now pin an explicit `name:` — without it they derive the same
  project name and `down -v` on one deletes the other's volumes.
- Session cookies are `Secure` in production, so you cannot smoke-test a signed-in
  request against the prod stack over plain HTTP. Test through Caddy over HTTPS.

## Not built (deliberately)

Social features, barcode scanning, Apple Health, recipe databases, micronutrients,
payments. See §21 of the product plan. (§21 also ruled out multiple users — that one
was overridden on purpose.)

Weekly reviews, adaptive targets, and notifications are v2 — the schema supports them
today (`targets` is versioned by `effective_from`, and every entry carries a
`confidence` flag so uncertain days can be weighted down), but nothing computes them yet.
