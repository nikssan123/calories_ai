# Day So Far

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

## Getting started

**Prerequisites**

- **An AI provider.** By default that is **a Claude Code subscription**, signed in
  on this machine — the journal runs on the subscription you already pay for, with
  no API key and no per-token billing. If you don't have it yet, install it and run
  `claude` once to sign in: <https://claude.com/claude-code>
  Prefer an API key, or use OpenAI or an OpenAI-compatible service instead? See
  [Choosing an AI provider](#choosing-an-ai-provider) — it is two lines in `.env`.
- **Node 22+**, **pnpm**, and **Docker** — Postgres runs in a container, the app
  itself runs on the host.

**Setup**

```bash
pnpm setup     # deps, .env, Postgres, migrations
pnpm dev       # API on :4000, web on :3000
```

`pnpm setup` is safe to re-run and never overwrites an existing `.env`. It checks
its prerequisites first, so a missing Docker daemon or an old Node fails with a
sentence telling you what to fix rather than a stack trace three steps later.

Open <http://localhost:3000>. Signed out you get the landing page; create an
account from it and the journal will interview you.
Then optionally `pnpm seed -- --email=you@example.com` for 21 days of demo history.

**Other scripts:** `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:reset` (drop
the volume and start over). Don't run `build` while `dev` is running — they share
`apps/web/.next` and will corrupt each other.

## Choosing an AI provider

The journal talks to a provider through one small interface (`apps/api/src/ai/providers/`),
so which service answers is a config change, not a code change. Set `AI_PROVIDER`
in `.env` to `anthropic` (the default) or `openai`.

Both providers share the same tool handlers, so a meal is logged identically
whichever one ran the turn.

### anthropic — your Claude Code subscription (default)

Built on the **Claude Agent SDK**, which reads the OAuth credentials `claude`
writes to `~/.claude/.credentials.json`. There is no API key and no per-token
billing — the subscription you already pay for covers it.

This works because the Agent SDK spawns the signed-in `claude` binary rather than
calling an HTTP endpoint. Two consequences worth knowing:

- Rate limits are shared with your own Claude Code usage. A heavy session at the
  terminal and a meal log compete for the same budget.
- Anthropic's docs say third-party developers may not *offer* claude.ai login for
  their products. A tool only you use isn't that, but it is their line to draw — if
  this ever becomes something other people sign into, move it to an API key.

Setting `ANTHROPIC_API_KEY` overrides the subscription and bills per token instead.

### openai — an API key

**A ChatGPT subscription does not cover this.** ChatGPT Plus/Pro and the OpenAI
API are separate products with separate billing; there is no supported way to
spend a ChatGPT subscription on API calls. This path is metered per token.

```bash
# .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...        # https://platform.openai.com/api-keys
OPENAI_MODEL=gpt-4o          # whatever your account can see
```

Then `pnpm dev` as usual. Nothing else changes.

Because this provider speaks the Chat Completions dialect over plain `fetch` and
adds no dependency, **any OpenAI-compatible endpoint works** — Groq, Together,
OpenRouter, a local Ollama. Point `OPENAI_BASE_URL` at it and use its key:

```bash
OPENAI_BASE_URL=http://localhost:11434/v1
```

Those vendors' line-ups are uneven — several cannot see an image at all — so each
kind of turn can take its own model, falling back to `OPENAI_MODEL`:

```bash
OPENAI_MODEL=deepseek-chat            # the floor, and the high-volume logging path
OPENAI_MODEL_VISION=qwen-vl-max       # photo turns
OPENAI_MODEL_REVIEW=deepseek-reasoner # once a week, so worth the good model
OPENAI_MODEL_SETUP=                   # the onboarding interview
```

The trade-off against the Claude path is that OpenAI has no server-side
conversation store, so this provider replays the recent transcript on every turn
and drives the tool-calling loop itself. Expect slightly more input tokens per
message, and note that `cost_usd` is recorded as 0 because the API does not
return a price.

### Adding another provider

Implement `AiProvider` from `apps/api/src/ai/providers/types.ts` — `checkAuth()`
and `run()` — and add a case to the factory in `providers/index.ts`. The interface
is deliberately neutral about whether you keep conversation state (`needsHistory`)
and hands you the tool definitions already built, so a new provider is one file.

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

## The landing page

`/` is two screens at one address: the journal for an account, and the landing page
for anyone without a session. `AuthGate` treats it as public rather than bouncing
strangers to `/login`, `AppFrame` hands it the window bare — no sidebar, no tab bar,
and the document scrolls itself so mobile browser chrome can collapse — and
`components/landing/` holds the page.

It is built from the app's own `CalorieRing`, `ChatActionCard` and `MacroBars`
rather than screenshots, so the product shot cannot drift away from the product.
`HeroDemo` plays a scripted two-turn conversation through them: a meal is logged,
then corrected, and the *same* entry card changes its numbers in place — which is
the thing worth advertising and the thing a still image cannot show. It pauses when
scrolled off screen, and `prefers-reduced-motion` gets the finished conversation
with no animation at all.

The CTA reads `signup_allowed` off the session check, so a server with registration
closed offers a stranger "Sign in" instead of a wall.

The logo is a progress ring that is also a speech bubble, and it is the name
drawn: a faint track carries the whole day, the solid arc is the part of it that
has been logged, and the arc stops where you have got to — the day so far —
running out into the bubble's tail, because what moves it is always something you
said. The three dots read at once as a typing indicator and as the macros.
`components/Logo.tsx` draws it from the tokens so it follows the in-app theme
toggle; `public/logo.svg`, `app/icon.svg` and `app/apple-icon.png` are the same
geometry with the colours baked in — the last on a filled tile, since a home
screen icon has no page behind it to sit on.

## Tests

```bash
pnpm test              # the API suite
pnpm test:coverage     # the same, with a coverage report and thresholds
```

Everything under `apps/api` is covered: ~99% of lines, ~98% of statements and functions.
The suite runs against a real Postgres rather than mocks, because most of what could go
wrong here is a query — `apps/api/src/env.ts` forces a `_test` suffix onto the database
name whenever `NODE_ENV=test`, so `pnpm test` cannot empty your development database even
if `DATABASE_URL` points straight at it. The database is created and migrated on first
run; if you have run `pnpm setup` there is nothing else to do.

The Agent SDK's `query` is the only thing stubbed. `tool` and `createSdkMcpServer` stay
real, so the in-process MCP server under test is the one that ships and the tool handlers
are called exactly as the model would call them.

Two things are deliberately not covered. `src/index.ts` is process wiring — `listen()`,
signal handlers, one log line — with nothing reachable without starting a real server. And
`apps/web` has no tests at all: it holds no business logic (that was the point of the
API-client split), and the React/Next scaffolding needed to assert on it would cost more
than it caught. If that stops being true, `apps/web/lib` is where to start.

Writing these found two real bugs, which is roughly what they were for:

- `resolveWhen('this afternoon')` returned 13:00. The pattern `/\blunch|midday|noon\b/`
  anchors its word boundaries to the first and last alternative only — and "after**noon**"
  ends in "noon".
- The adaptive window included today, a partial day, biasing every weekly target downward.

## Accounts

Email and password, hashed with node's built-in scrypt, with server-side sessions in
an httpOnly cookie. No third-party auth service.

- The first account is always allowed. Set `ALLOW_SIGNUP=false` afterwards to close
  registration.
- Set `SECURE_COOKIES=true` when serving over HTTPS.
- Upgrading from the single-user build: the first signup adopts the existing
  credential-less row, so nothing already logged is orphaned.

**Forgotten passwords** work the way you would expect: `/reset` emails a single-use
link that lives for an hour, and spending it signs every device out. That last part is
the substantive half — someone resetting a password they did not choose to change is
telling you they think somebody else is inside, and leaving that session alive would
make the reset theatre. It deliberately does not sign you back in.

**Email confirmation is soft.** Signing up sends a link, but nothing in the product
waits for it and no screen is gated on it. Two things do depend on it: a password can
only be reset to a mailbox someone has proved they can read, and the weekly review
email is not sent to an unproved address — a recurring message to an address that was
typed in by mistake is how a sending domain loses its reputation. Accounts that existed
before this shipped are grandfathered in by the migration.

## Email

Transactional email goes through [Resend](https://resend.com), over one `POST` with
`fetch` rather than their SDK — this project builds HTML with strings, and the SDK
brings a React renderer with it.

**It is optional.** With no `RESEND_API_KEY` the server writes each message to its log
instead of sending it, including reset links, which is exactly what you want on a
laptop. Set `EMAIL_REDIRECT_TO` to send everything to one address instead, which makes
Resend's sandbox sender usable for testing the whole flow before you own a domain.

| Message | When | Category |
|---|---|---|
| Confirm your email | Signup, and on request | account |
| Reset your password | `/auth/password/forgot` | security |
| Your password was changed | After a reset, self-service or by an admin | security |
| New sign-in | A sign-in from a client this account has not used | security |
| Your account has been deleted | Deletion, by the owner or an admin | account |
| Your account has been suspended / is active again | An admin toggling access | account |
| Your week | Monday, with the weekly review | product |

Only the last one has an unsubscribe link, and that is the whole distinction: the
others are about the account itself and are not something to have an opinion about
receiving. `notify_weekly_review` on the user row is the only preference, editable from
the setup screen or from the link in the footer — which is signed rather than stored,
so it still works from a two-year-old email and needs no session.

The **new sign-in** alert is fingerprinted on the user agent alone, not the address.
Home broadband, mobile data and a train's wifi are the same laptop, and an alert that
fires on every commute is one people filter — which costs it its value on the day it
matters. `known_devices` is separate from `auth_sessions` for the same reason: signing
out and back in must not report itself as a new device.

Everything sent is recorded in `email_deliveries`, because a self-hosted install has no
provider dashboard and "did the reset email actually go out?" is the first question
asked when someone cannot get in. Its unique `idempotency_key` is also what stops the
hourly review tick emailing Monday twice. Sending can never fail the thing that caused
it: `sendEmail` records the failure and returns, so nobody's signup 500s because Resend
is having an afternoon.

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
logging you already did rather than being a separate feature. The Today screen has the
same thing as a button: `GET /history/meals` collapses your entries by description so
the list is *the eight things you eat* rather than the last eight things you ate, and
`POST /entries/food/:id/repeat` clones one to now. The clone is a new entry with its own
items, so correcting it later touches only today.

The system prompt is assembled in four parts: a stable half, a volatile half with
today's numbers and entry ids, — only while the profile is incomplete — an
onboarding brief, and — for ten days after one is published — last week's review.

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

Model lives in `apps/api/src/ai/client.ts` (`claude-opus-5`). Effort is pinned to `high`
rather than left to the SDK default, so a Claude Code release cannot silently move the
cost and latency of every meal log.

## Targets adapt to you, not to a formula

Mifflin-St Jeor predicts what a population of people your size burns. After a fortnight
of logging there is something better available: what *you* burn, read off the only
experiment that matters.

```
TDEE = mean daily intake − (weight change per day × 7,700 kcal/kg)
```

Eat 2,000 while losing 0.5 kg a week and you were burning about 2,550. `services/adaptive.ts`
solves that every Monday and writes a new `targets` row — which is why `targets` was
versioned by `effective_from` from the start, and why every entry carries a `confidence`
flag: days built from vague restaurant estimates are weighted at half a day of weighed,
packaged food.

The arithmetic is three lines. The guardrails are the feature, because a tracker that
moves your target on a fortnight of water weight is worse than one that never moves it:

- **Ten logged days and four weigh-ins**, spanning at least ten days. Below that the
  estimate is noise.
- **±200 kcal per pass**, scaled by data quality, so successive weeks converge instead of
  oscillating. Under 40 kcal it does nothing at all.
- **±35% of the formula's prediction.** A fortnight can imply a maintenance of 900 or
  5,000; anything that far out is disbelieved rather than acted on.
- **A number you set by hand is never touched.**
- **The window ends yesterday.** Today is a partial day nearly every time the pass runs,
  and counting it dragged the mean — and the target — down every single week.

It calibrates against *logged* intake rather than true intake, so a consistent
under-logger converges on a target that works for the way they log. That is deliberate:
the useful number is the one that produces the intended trend.

`GET /targets/adaptive` returns what it would do right now without doing it, which is what
the Progress screen shows — an unexplained calorie target is one people ignore.

## Weekly reviews

Monday morning, in your own timezone, the journal posts a short read on the week. Every
number in it is computed in SQL (`services/reviews.ts`); the agent is handed those stats
and writes the prose. A model asked to both recall and narrate will get one of them
wrong, and it is always the recall.

The adaptive pass runs *first*, so the review explains a target that has already changed
rather than proposing one that might not stick. The review agent gets the read tools only
— one that could log food would eventually log food — and runs in its own session so it
neither inherits nor pollutes the journal's conversation. `recentReviewPrompt` carries it
back the other way, so "why did my target go up?" has an answer.

There is no cron and no queue. The API ticks hourly and asks each user's own clock whether
their week has turned over — one process serves every timezone. The window is "Monday, from
08:00 onward" rather than "at 08:00", so a process that was down at eight catches up at
nine; the review is written once and found thereafter, so every later tick is a no-op.
`POST /reviews/run` generates one on demand.

Publishing it also emails it, unless the account has turned that off — see
[Email](#email). The send is keyed on the week, so the re-entrant tick cannot deliver
Monday twice, and a provider failure is logged without touching the published review.

## Rate limits

Two kinds of route have a ceiling, and nothing else does — a blanket limit would only
throttle the dashboard polling the app does normally.

| Route | Limit | Keyed by |
|---|---|---|
| `POST /chat` | 40 / hour | account |
| `POST /reviews/run` | 5 / day | account |
| `POST /auth/login` | 10 / 15 min | IP |
| `POST /auth/signup` | 5 / hour | IP |
| `POST /auth/password/forgot` | 5 / hour | IP |
| `POST /auth/verify/resend` | 5 / hour | account |
| `POST /auth/password/reset` | 20 / hour | IP |
| `POST /auth/verify` | 20 / hour | IP |
| `DELETE /account` | 5 / 15 min | account |

The chat limits exist because turns are spent from your Claude subscription's budget. The
password limits exist because those are the only routes an anonymous caller can make burn
CPU (scrypt, deliberately) and the only ones where guessing pays.

The two email routes are protecting something else again: not this server, but the
address on the other end. Without a ceiling, `/auth/password/forgot` is a machine for
mailing a stranger fifty reset links over your sending domain — which costs you the
domain and costs the caller nothing.

## Admin and what it costs to run

`/admin` is a read-only window onto the database, the account actions support
actually gets asked for, and — the reason it exists — a cost report.

Who gets in is config, not a column: `ADMIN_EMAILS` in `.env`, and if that is
unset, the oldest account. A personal install therefore needs no configuration,
and admin is never something a row in the database can quietly acquire. Every
`/admin` route answers 404 rather than 403 to everyone else, so an ordinary
account cannot learn the panel is mounted.

**Read-only means read-only.** There is no route that takes SQL. The browser
reads from an allowlist of tables, and `password_hash` and `token_hash` are
withheld from the response rather than hidden in the markup. The write side is
six named actions: reset a password, revoke every session, suspend or restore
an account, delete one (typing its email to confirm), publish this week's
review, and re-run the adaptive pass.

Suspending an account revokes its sessions *and* refuses its next login with a
sentence — without the second half a suspended user signs in successfully and
then gets a 401 on everything, which looks like a broken server.

### The cost report

Every agent run writes a row to `ai_usage`: tokens in and out, cache reads and
writes kept apart, the model, the wall clock, and what it cost. Failed turns are
recorded too — a turn that burns tokens and then errors is the most expensive
kind, and averaging it away would flatter every figure.

Cost comes from three places, and the panel says which:

| | Where the number comes from |
|---|---|
| `reported` | Claude Code priced the turn itself. Always fresher than a rate card. |
| `estimated` | Priced here, from `ai/pricing.ts`. |
| `unknown` | Tokens counted, no rate available. `0` means unpriced, **not** free. |

**On the default subscription nothing here is billed.** The figure is what the
same tokens would cost at API rates — which is exactly the number the viability
question wants, because a product pays API rates. The panel says so above the
numbers, since it is otherwise the sort of thing someone reads as their bill.

The headline is cost per active user per month, built from observed per-user
spend rather than dividing the total by the headcount — a fortnight where one
account did all the logging would otherwise report a per-user cost an order of
magnitude too low. It is shown next to the heaviest single user, because the
mean is not what sizes the worst case, and next to the assumption it rests on:
that new users behave like current ones, which for a tracker used by its own
author is the thing most likely to be wrong.

The OpenAI-compatible path returns tokens but never a price, and the endpoint
behind it might be OpenAI, Groq, or a local Ollama — so there is no rate card
that could be right. Set `OPENAI_PRICE_INPUT` and `OPENAI_PRICE_OUTPUT` (USD per
million) to cost it; leave them unset and the panel reports the share of turns
it could not price rather than quietly counting them as free.

Cache tokens are tracked apart from plain input because they bill at a tenth
(reads) and 1.25× (writes) of the input rate. The journal's system prompt is
half stable and half today's numbers, so that line is a real part of the bill
rather than a rounding error — folding it into input would misprice a turn by
more than the turn costs.

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

# The agent runs on the Claude Code subscription, so sign in once. The token
# lives in the claude-home volume and survives rebuilds. Note `auth login`, and
# note that this is interactive — it prints a URL to open.
docker compose -f docker-compose.prod.yml run --rm api claude auth login

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
- **Two things are backed up, not one.** Meal photos are files in the `uploads`
  volume rather than rows in Postgres, so a pg_dump on its own would restore a
  database full of `photos` rows pointing at files that no longer exist. The
  script tars the volume through a throwaway container — which works whether or
  not the stack is up — and refuses to deploy if either backup fails.
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

Weekly reviews and adaptive targets were v2 and are now built — see the two sections
above. Notifications are not: the review lands in the journal and waits to be read,
because a nutrition app that pushes at you is a different and worse product.

Streaming the chat turn is the obvious next thing. `POST /chat` awaits the whole agent
loop and returns one JSON blob, but `ai/agent.ts` already iterates the SDK's messages —
the hard half of an SSE endpoint is written.
