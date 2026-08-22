# Scaling plan

The plan for the day the account count stops being a number you recognise, written
down while the reasoning was fresh rather than rediscovered under load.

## Two lanes, and both of them stay

`AI_PROVIDER` picks the provider. Two of the three are Claude, and **both are
permanent** — this is a standing split, not a migration with a subscription left
behind while it finishes:

- **`anthropic` — the Claude Code subscription.** The instance I run for myself. The
  Agent SDK spawns the signed-in `claude` binary, so there is no key and no per-token
  bill, and the SDK owns the agent loop and the conversation store. One person on one
  box is precisely the shape it is good at.
- **`anthropic-api` — the Messages API on a metered key.** What the product runs. No
  subprocess, no session file, no per-turn process; it replays the transcript and holds
  nothing between turns, which is what lets it run behind more than one replica.

Same models, same tool handlers, same prompts. A meal is logged identically whichever
lane ran the turn, and that is the property worth protecting — it is what makes the
personal instance a genuine test of the product rather than a lookalike.

Three consequences the rest of this document now depends on:

- **`users.agent_session_id` is not going anywhere.** It is what the subscription lane
  resumes from. It is nullable and the API lane never reads or writes it, so it costs
  the product one unused column — which is the correct price for keeping a lane that
  earns its place.
- **Nothing on the product's path may assume the Agent SDK is present**, and nothing
  on the subscription's path may assume it is absent. `staleSession`, the `claude-home`
  volume, the `.agent-workspace` directory and the container memory cap all belong to
  the subscription lane and stay with it.
- **Every future change has to work on both**, or say plainly which lane it is for.
  Streaming and the token bucket are both in this category — see where they land below.

## Status

**Built:** Stage 0 in full, and all of Stage 1 — shared rate-limit counters and photos in
a bucket, both optional and both off by default — plus the pieces of Stages 2 and 3 that
are code rather than infrastructure: the pool ceiling, admission control on a turn, and
the scheduler's re-entrancy guard.

**Left:** the deploy topology, streaming, and whatever the one unanswered question below
turns out to imply. Each is marked in place, and the ordered list is at the end.

## The short version

The product does not have a throughput problem. At 10,000 users it is half a turn per
second on average. What it had was a per-turn *cost* problem in two currencies: a turn
held a whole Claude Code process for twenty seconds, and beneath that each turn reads
roughly 24,000 input tokens against an org-wide per-minute ceiling.

Stage 0 settled the first — the product's lane spawns nothing — and with Stage 1's two
pins now pulled, two replicas carry the product to five figures of users as soon as
somebody starts them. Fix the second and the ceiling stops being interesting.

## Where the ceilings are today

Two of the three below were properties of the Agent SDK rather than of the product, so
Stage 0 did not merely raise them — it took them off the product's lane entirely. They
are recorded because they still describe the subscription lane exactly, and because the
reasoning is what says whether a future change belongs on one lane or both.

**Memory — no longer a product ceiling.** `docker-compose.prod.yml` caps the API
container at 2 GB, with a comment noting that Claude Code can spike well past its usual
footprint. The Agent SDK spawns the `claude` binary once per turn — call it 250 MB for
the twenty seconds a turn lasts — so the container OOMed somewhere around eight
concurrent turns, roughly 2,000 users during a lunch window.

The product's lane spawns nothing, so its per-turn footprint is a few HTTP requests and
the transcript. The cap stays in the compose file because the subscription lane still
wants it; it simply no longer describes what the product runs into first.

**Replication — one pin fewer than it looks, and now two.** Three things pinned the
deployment to one box. `users.agent_session_id` points at a session file on that
container's disk — but only for the lane that keeps one, and the product's lane never
reads the column, so this is not a pin on the product and is not going to become one.
The two that genuinely remained were real for both lanes and were what Stage 1 was
about: meal photos written to a local volume, and `@fastify/rate-limit` counting in
process memory. Both are now configurable — a bucket and a Redis respectively, each
unset by default — so the last one standing is `container_name` in the compose file,
which means `--scale` will not even start.

**The weekly review.** `runDueReviews` in `scheduler.ts` walks every active user
serially, generating each review on Opus. At a few hundred users in one timezone this
already runs longer than the hour between ticks.

The re-entrancy half of this is now fixed — see Stage 3 — but it is worth recording what
it was, because the shape recurs. `tick()` had no guard, so two overlapping runs could
both call the model for the same user before either committed, which is two reviews and
two emails. The pass looks idempotent: it asks whether this week has been written before
writing it. But that question is answered forty seconds before the write that settles it,
which is plenty of room for the other run to ask it too and get the same answer. The
serial walk is still there, and is what Stage 3 is otherwise about.

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

## Stage 0 — A direct Messages API provider — **built**

`providers/messages.ts`, selected with `AI_PROVIDER=anthropic-api`. Everything else
depended on this, and nothing else was worth doing first.

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

It came out at about 300 lines. What genuinely needed writing, and how each landed:

- Zod raw shape to JSON Schema for `input_schema`. Zod 4 has `z.toJSONSchema()` built
  in, so this cost no new dependency — the OpenAI provider was already doing it. One
  wrinkle worth knowing: it emits a `$schema` key, which is inert to the API but sits
  in the cached prefix, so it is stripped.
- `ToolResult` to the API's `tool_result` block. Near enough one-to-one. An empty
  result is rejected outright, so a tool with nothing to say says `(no output)`.
- `cache_control` placed by hand. `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` is an Agent SDK
  concept; on the Messages API the same split is a `system` array with
  `cache_control: {type: 'ephemeral'}` on the stable block and the volatile day context
  after it. This is the single largest line on the bill — verify it with a non-zero
  `cache_read_input_tokens` on the second turn, not by reading the code.

  One consequence that was not obvious from here: the plain `ephemeral` breakpoint is
  the *five-minute* TTL, which bills writes at 1.25x, where the Agent SDK takes the
  one-hour TTL at 2x. `CACHE_WRITE_MULTIPLIER` was 2 for exactly that reason, so
  pricing the new path with it overstated the largest line by 60% at precisely the
  volumes where cache writes still dominate. The multiplier now travels on the
  outcome, because it is the writer's choice and only the writer knows it.
- Parallel tool calls. Claude may emit several `tool_use` blocks in one assistant
  message. Execute them, then return **all** the `tool_result` blocks in a **single**
  user message. Splitting them across messages raises no error; it quietly teaches the
  model to stop calling tools in parallel, and you would only ever notice it as a latency
  regression. A failed tool still needs its block, with `is_error: true`.

  The calls are run one at a time rather than concurrently, which is a separate
  decision from how they are returned: the handlers write to the log and push cards
  onto the turn, so serial execution keeps the cards in the order the model asked for
  them and keeps two writes to the same day from reading each other half-applied.

Two other things needed writing that this plan did not anticipate. The transcript has
to be trimmed to something the API will accept — it must open on a user message, and
the recent window can easily begin on an assistant reply, or on the weekly review,
which is published into the journal as one. And `max_tokens` is required, where the
Agent SDK supplied it; `MAX_OUTPUT_TOKENS` is a runaway guard well above the longest
thing the product writes.

Two things are lost on this lane, both wanted.

Server-side sessions go, which is the point: a session file on one container's disk is
what pins a deployment to one host. Note the loss is the *sessions*, not the column —
`users.agent_session_id` stays for the subscription lane, where one person on one box
makes it no constraint at all. This lane simply never reads it.

And the SDK's self-reported `total_cost_usd` goes, so pricing falls back to
`ANTHROPIC_RATES` in `ai/pricing.ts`; `cost_source` already models exactly this
distinction, and the rate card is current, including Sonnet 5's introductory rate
expiring 2026-08-31. This costs a maintenance obligation, not accuracy — and the
obligation is now load-bearing rather than a fallback, since nothing else prices these
turns.

## Stage 1 — Make the *product's* process stateless

Originally three items. The first is now void: **`users.agent_session_id` stays.** It
was on this list because the Agent SDK was what production ran, and it is not; the
product's lane already holds nothing between turns, so the column is inert there and
the subscription lane needs it. Deleting it would buy the product nothing and cost the
other lane its conversation.

For the same reason the `claude-home` volume, the `.agent-workspace` directory and the
memory cap are not cleanup items any more. They are the subscription lane's furniture.
What is worth doing instead, when the product's compose file is next opened, is
splitting them out so it is obvious which lane each belongs to — a deployment running
`anthropic-api` should not be carrying a volume for a binary it never spawns.

That leaves two, and they are real for both lanes:

1. **Photos to object storage — built.** `services/storage.ts`, switched on with the four
   `S3_*` variables and off by their absence, on the same terms as `REDIS_URL`: one box
   with a volume is a perfectly good place for photos, and it is what the subscription
   lane should keep doing.

   `savePhoto` and `readPhoto` changed bodies as predicted and `verifyPhotoUrl` did not
   change at all. Four things about it were decided along the way and are worth having
   written down.

   **It is a switch, not a cutover.** `photos.storage_key` is null for a row on disk and
   the object key for a row in the bucket, so the column is both the address and the
   discriminator — nothing can disagree with the thing it describes. Turning the bucket
   on sends new photos to it and leaves every existing one being read off the volume.
   No backfill, and no moment where both have to be true at once.

   **A read is a redirect, not a proxy.** `/photos/:id` still decides whether this caller
   may have the photo — signature or session, unchanged — and then hands over a
   five-minute presigned URL rather than streaming the bytes. Proxying would spend our
   bandwidth and hold a multi-megabyte buffer in the event loop for a file R2 serves for
   free, which is most of the reason for having R2. The route became a turnstile instead
   of a pipe, and the 302 carries `no-store` because the URL inside it expires long
   before the photo does.

   **SigV4 over `fetch`, not the AWS SDK.** Three verbs and one presigned URL do not
   justify tens of megabytes on a cold start — the deployment already has a 30-second
   health probe it has come close to missing. `aws4fetch` is 65 KB and signs the request
   this code was going to make anyway. Its default of ten retries is turned down to two:
   the default backs off to roughly fifty seconds inside a request somebody is watching,
   which is the same mistake `maxRetries: 1` fixed on the model client.

   **Half-configured refuses to boot.** All four variables or none. The alternative is a
   deployment that starts happily and fails at the first photo anybody takes, which is
   the least convenient moment to discover it and the hardest place to see why.

   Client-side resizing turned out to already exist — `apps/web/lib/image.ts` caps the
   long edge at 2576px, which is what the vision model reads at anyway, so anything
   larger was being paid for twice. What is still true is that the bytes go up base64 in
   a JSON body at +33%. Having the client PUT straight to a presigned URL is the next
   step there, and it is an optimisation rather than a blocker — see the list at the end.
2. **Rate limiter to Redis — built.** In-process counters mean N replicas silently
   enforce N times the intended limit. `REDIS_URL` switches the store; unset keeps the
   counters in process, which is right for a single-process install and is what the
   subscription lane runs.

   Two things about it are deliberate. It **fails open** — `skipOnError`, so a store
   that cannot answer lets the request through rather than turning a cache outage into
   an API outage; these limits guard spending and password guessing, and both survive a
   few unthrottled minutes better than everyone survives a 500. And the offline queue
   stays **on**: turning it off loses the first requests after every boot, because the
   client is still opening its socket while the limiter's check fails instantly and
   `skipOnError` waves them through uncounted. `maxRetriesPerRequest: 1` is what keeps
   the queue bounded, so a blip is absorbed and a real outage still falls through.

Then remove `container_name`, run two or three replicas behind Caddy. pgbouncer is not
needed at three replicas and is needed well before twenty.

**Built:** `max` is now explicit on the pool in `db.ts`, configurable with
`DATABASE_POOL_MAX`. It was taking the default of ten connections *per replica*, which
reads as a global ceiling and is not one — leaving it implicit is how a deployment
that scaled out perfectly happily runs into `max_connections` instead, and the error
arrives at whichever query was unlucky rather than at the thing that caused it.

**Left in Stage 1:** nothing in the code. What remains is the deploy topology itself —
drop `container_name`, run two or three replicas behind Caddy — and that is a decision
about the host rather than a change to this repository.

## Stage 2 — Govern in tokens, not in requests

`CHAT_LIMIT` counts requests per account per hour. That is the right shape for stopping
one abusive account and the wrong shape for protecting an org-wide token ceiling, because
a photo turn and a text turn differ by an order of magnitude in tokens and the limiter
cannot tell them apart.

- **A token bucket in front of the model call — not built.** Sized in tokens per minute
  against the real limit with about 20% headroom. Estimate a turn's cost before
  admitting it — `messages.count_tokens` for the exact figure, or a constant per
  `TurnKind`, which is accurate enough given every turn is already classified.

  Not built because sizing it needs the answer to the question above. It is also the
  clearest example of a **lane-specific** change: the ceiling it protects is the API
  key's tokens-per-minute limit, which the subscription lane does not have — that lane
  shares a budget with my own terminal instead, which is a real constraint but not this
  one. So it belongs in the `anthropic-api` provider or in front of it, keyed on
  whether the running provider is metered, and not in `runTurn` where it would tax a
  lane it cannot help.
- **A per-user in-flight lock — built.** One turn at a time per account, in
  `services/turn-lock.ts`, and the second turn gets a 429 rather than a queue slot.
  This is a correctness fix as much as a load fix: two concurrent turns both read
  `buildDaySummary` before either writes, and can double-log the same meal.

  It is a lease on the user row, not an advisory lock and not an in-process map. An
  advisory lock lives on a connection and would hold one for the whole twenty seconds
  of a turn, which is the resource this is trying to protect; an in-process map stops
  defending anything the moment there is a second replica, which is the direction of
  travel. A timestamp costs neither and self-heals when the process holding it dies.
- **Explicit 429 handling — built.** The SDK retries twice with exponential backoff by
  default, which is wrong for an interactive turn — better to retry once, then return
  an honest "try again in a moment" than to leave someone watching a spinner for a
  minute. `maxRetries: 1`, and a `RateLimitError` becomes a sentence carrying the
  server's own `retry-after` rather than the SDK's string.
- **Streaming — not built.** Not optional at this point. Twenty silent seconds reads as
  broken; the same twenty seconds with text arriving reads as thinking. It also removes
  any risk of HTTP timeouts on the longer photo turns. The README already notes this is
  the obvious next thing.

  Unlike the token bucket, this one has to work on **both** lanes, and that decides
  where it goes. Both can stream — the Agent SDK already yields assistant messages as
  they arrive, and the Messages API streams natively — but they stream differently
  enough that expressing it in either provider alone would strand the other on a
  spinner. It belongs at the seam: a streaming variant of `AiProvider.run`, with the
  route and the web client speaking one shape regardless of which lane answered.

Chat should not go behind a job queue. Someone is watching the screen, and a queue moves
the wait rather than removing it. Admission control and a fast, honest rejection are the
right answer for an interactive path.

## Stage 3 — The Monday cliff

This is the only genuine spike the product has. At 10,000 users the largest timezone
bucket is perhaps 3,000 reviews all falling due at 08:00 local, against a serial loop at
roughly forty seconds each.

1. **A Postgres advisory lock around the tick — built**, in `services/job-lock.ts`, so
   overlapping runs and multiple replicas cannot double-fire. Here the advisory lock
   *is* the right instrument, where it was the wrong one for a user's turn: a
   background pass can happily hold a connection for its duration, there is exactly
   one of them by construction, and the lock dies with the connection, so a killed
   process releases it rather than blocking the next hour. The two passes take
   separate locks — they share a tick and nothing else, and a review pass grinding
   through a timezone must not be why nobody gets a nudge.
2. **Move it out of the API process — not built** — into a worker — same image, different command. A
   weekly review must never compete for the token budget with someone logging lunch.
3. **The Batch API — not built.** Reviews are the textbook case: non-interactive, bulk, and
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

This table is about the product's lane. The subscription lane is one account on one box
and none of it applies there — which is the point of keeping the two apart.

| Users | What is required | State |
|---|---|---|
| ~2,000 | Stage 0. Two replicas. Nothing else. | Code done; replicas need starting |
| ~10,000 | Stages 1–3, plus Stage 5 if cache reads count in full against the rate limit. | Stage 3's guard done; the rest open |
| ~100,000 | All of it, pgbouncer, and a negotiated rate-limit tier. | open |

Stage 0 unblocked. Stage 3 removes the only real spike. Stage 5 is what actually buys
headroom. Stage 2 is the seatbelt that stops a bad afternoon becoming an outage.

### What is left, in the order it wants doing

1. **Answer the rate-limit question above.** It is one question, it costs a look at the
   Console, and it decides whether Stage 5 is an optimisation or a prerequisite.
2. **Streaming**, at the provider seam so both lanes get it. Twenty silent seconds reads
   as broken. This is the largest remaining piece and the only one a user sees directly.
3. **Stage 5**, at the priority step 1 assigns it.
4. **Direct uploads.** The client PUTs to a presigned URL and sends the API a photo id
   instead of several megabytes of base64. Worth doing, but an optimisation rather than
   a blocker now the bucket exists: it takes the +33% encoding and a 25 MB body off the
   API's path, and it means a slow phone uplink is no longer holding a request open.
   The wrinkle is that the model needs the bytes, so the turn either fetches them back
   or passes the presigned URL as an image source.

Two smaller things worth doing whenever their file is next open, neither urgent:

- **Split the compose files by lane.** The `claude-home` volume, `.agent-workspace` and
  the memory cap are the subscription lane's; a deployment running `anthropic-api`
  should not carry a volume for a binary it never spawns.
- **Fix the auth gate in `routes/index.ts` and `scheduler.ts`.** Both still ask
  `hasSubscriptionAuth() || ANTHROPIC_API_KEY` before admitting a turn, which is a
  Claude-shaped question asked on behalf of whichever provider is configured — it
  already 503s a correctly configured `openai` deployment. The provider's own
  `checkAuth()` is the right thing to ask, and every provider already implements it.

## Not in this plan (deliberately)

Putting chat behind a job queue — see Stage 2. Sharding Postgres, which is nowhere near
being the constraint; a nutrition log is small and the reads are all keyed by user.
Caching model responses across users, because two people describing the same lunch still
have different day contexts and different targets, so there is nothing to share. And a
second region, which buys latency this product does not need and costs a data-residency
conversation it has not had.
