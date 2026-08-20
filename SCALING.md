# Scaling plan

Nothing here is built. This is the plan for the day the account count stops being a
number you recognise, written down now while the reasoning is fresh rather than
rediscovered under load.

It assumes one decision has been made: **the agent runs on a metered Anthropic API key,
not on a Claude Code subscription.** The subscription stays for development, where it is
exactly the right thing. Everything below is about what production looks like once turns
are billed per token, because that changes which constraint binds first.

## The short version

The product does not have a throughput problem. At 10,000 users it is half a turn per
second on average. What it has is a per-turn *cost* problem, in two currencies: today
each turn holds a whole Claude Code process for twenty seconds, and after that is fixed
each turn reads roughly 24,000 input tokens against an org-wide per-minute ceiling.

Fix the first and two replicas carry you to five figures of users. Fix the second and the
ceiling stops being interesting.

## Where the ceilings are today

**Memory.** `docker-compose.prod.yml` caps the API container at 2 GB, with a comment
noting that Claude Code can spike well past its usual footprint. The Agent SDK spawns the
`claude` binary once per turn — call it 250 MB for the twenty seconds a turn lasts — so
the container OOMs somewhere around eight concurrent turns. That is roughly 2,000 users
during a lunch window.

**Replication.** Three things pin the deployment to one box, so the memory ceiling cannot
be answered by adding boxes: `users.agent_session_id` points at a session file on that
container's disk, meal photos are written to a local volume by `services/photos.ts`, and
`@fastify/rate-limit` keeps its counters in process memory. `container_name` in the
compose file means `--scale` will not even start.

**The weekly review.** `runDueReviews` in `scheduler.ts` walks every active user
serially, generating each review on Opus. At a few hundred users in one timezone this
already runs longer than the hour between ticks, and `tick()` has no re-entrancy guard —
two overlapping runs can both call the model for the same user before either commits,
which is two reviews and two emails.

## What a turn costs, in tokens

Once turns run in-process against the Messages API, the budget for a `text_log` looks
roughly like this:

| | |
|---|---|
| Cached prefix — tool definitions plus `STABLE_SYSTEM_PROMPT` | ~6k tokens |
| Volatile — day context plus replayed history | ~2k tokens |
| Model calls per turn (initial → tool results → final) | 2–3 |
| **Input tokens per turn** | **~24k** |
| Output tokens per turn | ~600 |

The prefix is re-read on every model call inside the turn. That multiplier is the whole
story, and §Stage 5 is about removing it.

Peak load, assuming a quarter of the day's turns land in a ninety-minute meal window and
four turns per user per day:

| Users | Peak turns/min | Peak input tokens/min | Peak output tokens/min |
|---|---|---|---|
| 1,000 | ~11 | ~260k | ~7k |
| 10,000 | ~110 | ~2.6M | ~66k |
| 100,000 | ~1,100 | ~26M | ~660k |

## Answer this before planning anything

**Do cache-read tokens count against the input-tokens-per-minute limit at full rate, or
at the discounted rate they are billed at?**

They cost a tenth as much in dollars. If they also count a tenth as much against the rate
limit, the table above is comfortable well past 10,000 users. If they count in full, the
ceiling is ten times lower than the dollar figure suggests and Stage 5 stops being an
optimisation and becomes a prerequisite. The Console's limits page, or whoever holds the
account relationship, has the answer. It is one question and it moves the whole plan.

## Stage 0 — A direct Messages API provider

Everything else depends on this, and nothing else is worth doing first.

The Agent SDK is doing very little here that is worth its cost. `providers/anthropic.ts`
already strips every built-in tool and disables all config loading, so what the SDK
actually supplies is an agent loop and a session store. Both already exist in this
repository: `providers/openai.ts` drives the same tools over plain `fetch`, and
`loadHistory` in `ai/run.ts` replays the transcript for providers that cannot remember it
themselves.

The in-house MCP server is not an obstacle. `buildNutritionServer` already returns the
raw `ToolDefinition[]` alongside the MCP wrapper, precisely so a handler can be called
without an agent — `run.ts` destructures `tools` and never touches `server`. Going direct
means deleting the `createSdkMcpServer` wrapper and the `mcp__ct__*` name prefixes, not
porting a protocol. If owning the loop is unappealing, the Anthropic SDK's tool runner
(`client.beta.messages.tool_runner`) will drive it instead.

What genuinely needs writing:

- Zod raw shape to JSON Schema for `input_schema`. Zod 4 has `z.toJSONSchema()` built in,
  so this costs no new dependency.
- `ToolResult` to the API's `tool_result` block. Near enough one-to-one.
- `cache_control` placed by hand. `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` is an Agent SDK
  concept; on the Messages API the same split is a `system` array with
  `cache_control: {type: 'ephemeral'}` on the stable block and the volatile day context
  after it. This is the single largest line on the bill — verify it with a non-zero
  `cache_read_input_tokens` on the second turn, not by reading the code.
- Parallel tool calls. Claude may emit several `tool_use` blocks in one assistant
  message. Execute them, then return **all** the `tool_result` blocks in a **single**
  user message. Splitting them across messages raises no error; it quietly teaches the
  model to stop calling tools in parallel, and you would only ever notice it as a latency
  regression. A failed tool still needs its block, with `is_error: true`.

Two things are lost, both wanted. Server-side sessions go, which is the point — that
column is what pins the deployment to one host. And the SDK's self-reported
`total_cost_usd` goes, so pricing falls back to `ANTHROPIC_RATES` in `ai/pricing.ts`;
`cost_source` already models exactly this distinction, and the rate card is current,
including Sonnet 5's introductory rate expiring 2026-08-31. This costs a maintenance
obligation, not accuracy.

## Stage 1 — Make the process stateless

1. **Drop `users.agent_session_id`.** Set `needsHistory: true` and delete the
   `staleSession` retry in `ai/run.ts` — it exists only to handle the Agent SDK losing a
   session file, and there is no such file any more.
2. **Photos to object storage.** `savePhoto`/`readPhoto` change bodies; the signed-URL
   scheme in `verifyPhotoUrl` survives untouched. While in there, have the client upload
   directly and stop pushing base64 through a 25 MB JSON body.
3. **Rate limiter to Redis.** In-process counters mean N replicas silently enforce N
   times the intended limit.

Then remove `container_name`, run two or three replicas behind Caddy, and set `max`
explicitly on the pool in `db.ts` — it currently takes the default of ten connections
*per replica*. pgbouncer is not needed at three replicas and is needed well before
twenty.

The `claude-home` volume, the `.agent-workspace` directory and the 2 GB memory cap can
all go at the same time.

## Stage 2 — Govern in tokens, not in requests

`CHAT_LIMIT` counts requests per account per hour. That is the right shape for stopping
one abusive account and the wrong shape for protecting an org-wide token ceiling, because
a photo turn and a text turn differ by an order of magnitude in tokens and the limiter
cannot tell them apart.

- **A token bucket in front of the model call**, sized in tokens per minute against the
  real limit with about 20% headroom. Estimate a turn's cost before admitting it —
  `messages.count_tokens` for the exact figure, or a constant per `TurnKind`, which is
  accurate enough given every turn is already classified.
- **A per-user in-flight lock.** One turn at a time per account. This is a correctness fix
  as much as a load fix: two concurrent turns both read `buildDaySummary` before either
  writes, and can double-log the same meal.
- **Explicit 429 handling.** The SDK retries twice with exponential backoff by default,
  which is wrong for an interactive turn — better to retry once, then return an honest
  "try again in a moment" than to leave someone watching a spinner for a minute. Set
  `maxRetries: 1` and catch `RateLimitError`, reading `retry-after`.
- **Streaming.** Not optional at this point. Twenty silent seconds reads as broken; the
  same twenty seconds with text arriving reads as thinking. It also removes any risk of
  HTTP timeouts on the longer photo turns. The README already notes this is the obvious
  next thing.

Chat should not go behind a job queue. Someone is watching the screen, and a queue moves
the wait rather than removing it. Admission control and a fast, honest rejection are the
right answer for an interactive path.

## Stage 3 — The Monday cliff

This is the only genuine spike the product has. At 10,000 users the largest timezone
bucket is perhaps 3,000 reviews all falling due at 08:00 local, against a serial loop at
roughly forty seconds each.

1. **A Postgres advisory lock** around the tick, so overlapping runs and multiple replicas
   cannot double-fire.
2. **Move it out of the API process** into a worker — same image, different command. A
   weekly review must never compete for the token budget with someone logging lunch.
3. **The Batch API.** Reviews are the textbook case: non-interactive, bulk, and
   deadline-insensitive. Half price, results within 24 hours, and — the part that matters
   here — batch traffic does not consume the standard per-minute limits, so the entire
   Monday spike leaves the budget that serves live turns. Submit at the top of the hour,
   poll until the batch ends, publish and mail as results land. Key results by
   `custom_id`; they return in arbitrary order.

`isReviewTime` is already a window rather than an instant, deliberately, so a review
landing at 09:30 instead of 08:00 needs no other change anywhere.

## Stage 4 — Caching improves with scale

Worth writing down because it inverts the intuition and it corrects the cost projections.

The cached prefix is identical for every account — same system prompt, same tool
definitions. It is not per-user. So the only question is whether *anybody* hit that prefix
within the cache's five-minute lifetime.

At today's headcount, mostly nobody has, and nearly every turn pays a 1.25× cache write.
At 1,000 users it is a turn every fourteen seconds across waking hours in many timezones,
and the prefix never goes cold. The cache hit rate is a function of concurrency, and it
rises.

Three consequences:

- **Do not add a re-warm timer and do not reach for the one-hour TTL.** Real traffic keeps
  the entry warm on its own past a few hundred users, and the longer TTL doubles the write
  cost to solve a gap that will not exist. A `max_tokens: 0` pre-warm at worker boot is
  worth it only for the post-deploy cold start; there are two prefixes (the journal's
  read-write toolset and the review's read-only one), so it is cheap to do and cheap to
  skip.
- **The projections in `economics()` are pessimistic.** They extrapolate observed per-user
  cost linearly, but that cost was observed at low volume against a mostly-cold cache. At
  scale the input line falls toward a tenth. Read the 1,000 and 10,000 user tiers as a
  ceiling rather than a forecast.
- **Track `cache_read_input_tokens` as an operational metric, not only a cost one.** If it
  drops, something began varying inside the prefix. Tool definitions render *before* the
  system prompt in the cache key, so non-deterministic ordering out of
  `buildNutritionServer` is the first place to look.

One caveat: the minimum cacheable prefix is not uniform across models — 512 tokens on
Opus 5, 1024 on Sonnet 5. The current prefix clears both easily, but the assumption is
worth re-checking if a cheaper tier is ever added.

## Stage 5 — Remove the multiplier

Every number above treats ~24k input tokens per turn as fixed. It is not, and this is the
highest-leverage change available.

`text_log` is around 70% of all turns and it is structured extraction, not reasoning — the
`TurnKind` comment in `providers/types.ts` says as much. A single `messages.create` with
structured outputs, in place of a two-or-three call tool loop, cuts input tokens per turn
by roughly two thirds. That is not a cost optimisation. It is a threefold increase in how
many users a given per-minute ceiling supports, and it decides whether the 10,000-user row
is comfortable.

After that:

- **Re-tune `effort`.** `MODELS` in `ai/client.ts` runs `effort: 'high'` on all four
  kinds. For extraction, low or medium is likely indistinguishable in output and
  materially cheaper in thinking tokens.
- **Keep the agent loop** for `photo_log` and `setup`, where the open-endedness earns its
  cost.
- **Then** revisit Opus-for-photos, with real numbers rather than an assumption.

## What each stage buys

| Users | What is required |
|---|---|
| ~2,000 | Stage 0. Two replicas. Nothing else. |
| ~10,000 | Stages 1–3, plus Stage 5 if cache reads count in full against the rate limit. |
| ~100,000 | All of it, pgbouncer, and a negotiated rate-limit tier. |

Stage 0 unblocks. Stage 3 removes the only real spike. Stage 5 is what actually buys
headroom. Stage 2 is the seatbelt that stops a bad afternoon becoming an outage.

## Not in this plan (deliberately)

Putting chat behind a job queue — see Stage 2. Sharding Postgres, which is nowhere near
being the constraint; a nutrition log is small and the reads are all keyed by user.
Caching model responses across users, because two people describing the same lunch still
have different day contexts and different targets, so there is nothing to share. And a
second region, which buys latency this product does not need and costs a data-residency
conversation it has not had.
