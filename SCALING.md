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
  Streaming was in this category and went to both, at the seam; the token bucket is in it
  and goes to one. See where each lands below.

## Status

**Built:** Stage 0 in full, and all of Stage 1 — shared rate-limit counters and photos in
a bucket, both optional and both off by default — plus the pieces of Stages 2 and 3 that
are code rather than infrastructure: the pool ceiling, admission control on a turn, and
the scheduler's re-entrancy guard. Streaming landed on 2026-08-22 and is the only item so
far that a user can see.

**Deployed and verified**, 2026-08-22, at `7bfd1e6`. Redis was already carrying the
limiter's counters; this deploy added the bucket. Migration `023` applied, the API
resolved its endpoint correctly, and a round trip from inside the production container
wrote, read, presigned and deleted an object — including the check that matters most for
privacy, that an unsigned read of a known key is refused. Production photos have gone to
`day-so-far` since.

Worth recording that the endpoint in the server's `.env` was pasted from R2's bucket
settings page with the bucket name on the end, which is the form Cloudflare offers. The
normalisation added the same day is the only reason this deploy worked rather than 404ing
every photo on `day-so-far/day-so-far/…` — a fix written an hour before the mistake it
prevents, which is the sort of luck worth turning into a note.

**Deploy topology written, 2026-08-22.** `api` is `deploy.replicas: 2` in
`docker-compose.prod.yml` and no longer carries a `container_name`. Writing it turned up
one thing this document had called a pure deploy change and was not: migrations run on
boot in every container, and the runner had no lock, so two replicas starting together
both read an empty ledger and both applied the same migration. The loser took its boot
chain down with it and restarted — recovering on the retry, which is what made it worth
finding now rather than later, because a replica that flaps once per deploy is a symptom
a deploy learns to ignore. `src/migrate.ts` now takes a blocking advisory lock and reads
the ledger inside it; `test/migrate.test.ts` boots two pools at once and fails without it.

**Left:** running it — the topology is in the file, but the file has not been applied to
the host. And Stage 5, which the rate-limit question, now answered, demotes from
prerequisite to optimisation. Each is marked in place, and the ordered list is at the end.

## The short version

The product does not have a throughput problem. At 10,000 users it is half a turn per
second on average. What it had was a per-turn *cost* problem in two currencies: a turn
held a whole Claude Code process for twenty seconds, and beneath that each turn reads
roughly 24,000 input tokens against an org-wide per-minute ceiling.

Stage 0 settled the first — the product's lane spawns nothing — and with Stage 1's two
pins now pulled, two replicas carry the product to five figures of users as soon as
somebody starts them.

The second turned out to be much less of a problem than it looked, because cache reads do
not count against the per-minute ceiling at all. Most of that 24,000 is the prefix being
re-read, and a re-read prefix is a cache read. See the section below.

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
unset by default. The last one standing was `container_name` in the compose file, which
meant `--scale` would not even start; it is gone, and the service declares
`deploy.replicas: 2` instead. Nothing in this repository now pins the product's lane to
one container.

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
story for the *bill* — a cache read still costs a tenth of the input rate, and a tenth of
18,000 tokens on every turn is real money at volume. It is not the story for the
*ceiling*: cache reads are excluded from ITPM entirely. §Stage 5 is about removing the
multiplier; the section below is about which of the two problems that solves.

Peak load, assuming a quarter of the day's turns land in a ninety-minute meal window and
four turns per user per day. These are *gross* token figures — what the model reads, not
what the rate limiter counts; the governed figure is in the next section and is roughly a
quarter of this:

| Users | Peak turns/min | Peak input tokens/min | Peak output tokens/min |
|---|---|---|---|
| 1,000 | ~11 | ~260k | ~7k |
| 10,000 | ~110 | ~2.6M | ~66k |
| 100,000 | ~1,100 | ~26M | ~660k |

## The question that moved the plan — **answered**

**Do cache-read tokens count against the input-tokens-per-minute limit at full rate, or
at the discounted rate they are billed at?**

**Neither. They do not count at all.** Anthropic's rate-limit documentation is explicit:
what counts toward ITPM is `input_tokens` plus `cache_creation_input_tokens`.
`cache_read_input_tokens` is excluded outright — not discounted, excluded — for every
current model. The one exception is Claude Haiku 3.5, which is retired and which this
product never used; it is marked with a dagger in the tier tables precisely because it is
the odd one out.

That is better than the optimistic branch this section was written to choose between, and
it settles three things.

**Stage 5 is an optimisation, not a prerequisite.** It was only ever going to be a
prerequisite on the pessimistic branch. It is still worth doing — see the re-framing in
its own section, which is now about requests and the bill rather than about headroom —
but nothing waits on it.

**The peak table above is a gross figure, not a governed one.** Of the ~24k input tokens
a turn reads, roughly 18k is the ~6k prefix re-read on each of two or three model calls,
and once the prefix is warm every one of those re-reads is a cache read. What actually
counts is the volatile remainder, near enough ~6k a turn:

| Users | Peak turns/min | Gross input tokens/min | Counted against ITPM |
|---|---|---|---|
| 1,000 | ~11 | ~260k | ~66k |
| 10,000 | ~110 | ~2.6M | ~660k |
| 100,000 | ~1,100 | ~26M | ~6.6M |

And that total is split before it meets a ceiling, because **rate limits are per model**
and `MODELS` already routes by turn kind — the text log on Haiku 4.5, photos and setup on
Opus 5, the fridge scan and the nudge on Sonnet 5. Each has its own bucket, so the number
that matters is the busiest one: `text_log` is ~70% of turns, which puts roughly 460k of
the 10,000-user row's 660k on Haiku. Against 2M ITPM on the lowest published tier, that is
about four times the peak in headroom, before any tier increase is asked for.

**The limit that binds first at the top of the table is requests, not tokens.** At 100,000
users the tokens are still comfortable, but ~1,100 turns a minute at two or three model
calls each is ~2,750 requests a minute — ~1,900 of them on Haiku. That clears the lowest
tier's 1,000 RPM and fits the next one several times over, which makes RPM the first
ceiling this product would actually have to ask about. It is also the one Stage 5 moves
most directly: collapsing a three-call tool loop into one call is a threefold cut in
requests, not only in tokens.

One consequence worth carrying forward. Cache reads being free against the ceiling makes
the hit rate **operationally** load-bearing rather than merely a line on the bill: if the
prefix goes cold or something starts varying inside it, those tokens do not get more
expensive by a tenth, they move from the uncounted bucket to the counted one and the
effective ITPM capacity drops about fourfold. That is a cliff rather than a slope, and it
is why the metric in §Stage 4 is worth a threshold rather than a glance.

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

**Left in Stage 1:** nothing in the code, and nothing in the configuration either — both
stores are live in production as of 2026-08-22. What remains is the deploy topology
itself: drop `container_name`, run two or three replicas behind Caddy. That is a decision
about the host rather than a change to this repository, and it is now the only thing
standing between this deployment and a second replica.

One operational note from turning it on. The `uploads` volume stays mounted and stays in
the deploy script's backup, because it still holds every photo written before the switch
— six megabytes of them on the first deploy — and a `photos` row with a `file_path` has
nowhere else to look. The volume stops growing; it does not stop mattering.

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
- **Streaming — built.** `AiProvider.runStream`, `POST /chat/stream`, and the journal
  rendering the reply as it is written. Twenty silent seconds reads as broken; the same
  twenty seconds with text arriving reads as thinking.

  It went where the plan said it should — at the seam, as a variant of `run` rather than
  a replacement — and the shape that fell out is worth writing down, because four
  decisions inside it were not obvious from up here.

  **The events describe what the reader should see, not what the vendor sent.** The two
  lanes stream at genuinely different granularities: the Messages API gives token
  deltas, and the Agent SDK gives a finished assistant message at a time. Neither shape
  may reach a client, or the client learns which provider answered — so the seam speaks
  `text`, `tool` and `reset`, and both providers translate into it. `runStream` is
  optional and falls back to `run`, which is what lets the OpenAI lane keep working
  untouched: it answers in one piece at the end, exactly as everything did before.

  **`tool` clears what has been shown, and that is the whole trick.** A model that says
  "Let me log that" and then calls a tool has written a preamble, not an answer — what
  gets persisted is its *final* message. Streaming the preamble and keeping it on screen
  buys a moment of extra text and pays for it with a visible jump when the real reply
  lands. Clearing on the tool call means the streamed text and the stored text are the
  same sentence, which is the property the wire test pins.

  **The response head is written late.** Once `200 text/event-stream` is on the wire the
  status line is spent, and every later failure has to be an apology inside a success.
  That is the wrong answer for the failure that matters most here: the turn lease
  rejects a double-tapped send *before* the model is called, and that is a 429 with a
  `retry-after`, not a 200. So the head is deferred until there is genuinely something
  to send, and the route branches on whether it has started. Failures after that point
  travel as an `error` frame, which the client re-throws as the 502 it would have been.

  **A reader who leaves does not cancel the turn.** The tools have already written to
  the log by then and the message is committed at the very end, so abandoning the run
  would leave the meal logged and the reply lost — which is precisely the state
  `reconcile` in the web client exists to recover from. Writes go quiet, the heartbeat
  stops, and the turn finishes.

  Two smaller things that only showed up in the doing. The Next.js proxy was reading
  every response with `await response.text()`, which on an event stream waits for the
  whole turn and then delivers it at once — the frames all arrive, the reply is correct,
  and the feature is silently absent. It hands `response.body` straight through now. And
  the journal's message rows had to be memoised: a streamed reply lands as tens of state
  updates a second, and each one was re-rendering forty bubbles and their cards to add a
  word to the last of them.

  There is also a heartbeat, every fifteen seconds. The gap it covers is real and is the
  longest one in a turn — a photo log on Opus can spend most of a minute inside a tool
  call — and idle proxy timeouts start at thirty.

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
- **Track `cache_read_input_tokens` as an operational metric, not only a cost one, and
  give it a threshold rather than a glance.** If it drops, something began varying inside
  the prefix. Tool definitions render *before* the system prompt in the cache key, so
  non-deterministic ordering out of `buildNutritionServer` is the first place to look.

  This matters more than it did when it was written. Cache reads are excluded from the
  per-minute input ceiling entirely, so a prefix that stops being read does not merely get
  a tenth more expensive — those tokens move from the uncounted bucket into the counted
  one, and about three quarters of the turn's input arrives at the rate limiter that was
  never sized for it. It is a cliff, and it is invisible in latency until the 429s start.

One caveat: the minimum cacheable prefix is not uniform across models — 512 tokens on
Opus 5, 1024 on Sonnet 5. The current prefix clears both easily, but the assumption is
worth re-checking if a cheaper tier is ever added.

## Stage 5 — Remove the multiplier

Every number above treats ~24k input tokens per turn as fixed. It is not, and this is the
highest-leverage change available.

`text_log` is around 70% of all turns and it is structured extraction, not reasoning — the
`TurnKind` comment in `providers/types.ts` says as much. A single `messages.create` with
structured outputs, in place of a two-or-three call tool loop, cuts input tokens per turn
by roughly two thirds.

This paragraph used to end by claiming that was a threefold increase in how many users a
per-minute ceiling supports, and that it decided whether the 10,000-user row was
comfortable. Both are now known to be wrong, and it is worth saying why rather than
quietly deleting them: they assumed the re-read prefix was governed, and it is not — cache
reads do not count against ITPM at all. The 10,000-user row was already comfortable.

What the change is actually worth, in the order the numbers say:

- **Requests.** Three model calls become one. At six figures of users RPM is the binding
  ceiling rather than tokens — see the answered question above — so this is the only item
  in the plan that moves the limit that actually binds there.
- **The bill.** A cache read is a tenth of the input rate, not nothing, and it is a tenth
  of ~18k tokens on ~70% of all turns. Cheap per turn; not cheap at volume.
- **Latency.** Two round trips removed from the turn somebody is watching, which is worth
  more now that they are watching it arrive rather than waiting for it.

None of which is a reason to rush it ahead of the replica.

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
| ~2,000 | Stage 0. Two replicas. Nothing else. | Code, stores and compose done; the two-replica deploy has not been run on the host |
| ~10,000 | Stages 1–3. Not Stage 5 — cache reads turned out not to count against the ceiling at all. | Stage 1 done; Stage 2 all but the token bucket; Stage 3's guard done, the worker and the Batch API open |
| ~100,000 | All of it, pgbouncer, and a negotiated rate-limit tier. | open |

Stage 0 unblocked. Stage 3 removes the only real spike. Stage 2 is the seatbelt that
stops a bad afternoon becoming an outage, and is now mostly fastened. Stage 5 was written
down as the thing that buys headroom; it is not, because the headroom was already there —
it buys requests, money and latency instead.

### What is left, in the order it wants doing

1. **Start the second replica** — *the code and the compose file are done; what is left
   is the deploy.* Moved up from the note below, because answering the rate-limit question
   left nothing above it. It is the only item here that changes what the deployment can
   survive, and every store a request touches is already shared.
2. **Stage 5.** An optimisation, at the priority the answered question assigns it: it
   buys requests, money and latency, and no headroom that is not already there. Worth
   doing before six figures of users, not before the replica.
3. **Direct uploads.** The client PUTs to a presigned URL and sends the API a photo id
   instead of several megabytes of base64. Worth doing, but an optimisation rather than
   a blocker now the bucket exists: it takes the +33% encoding and a 25 MB body off the
   API's path, and it means a slow phone uplink is no longer holding a request open.
   The wrinkle is that the model needs the bytes, so the turn either fetches them back
   or passes the presigned URL as an image source.

What is left of step 1, now that the file says two: `docker compose -f
docker-compose.prod.yml up -d --build` on the host, then check that a photo taken on one
replica renders on the other — which it will, because neither of them holds it. Sessions,
photos and counters all live outside the container. Worth confirming in this order:

- `S3_*` is set in the host's `.env` before the second container ever starts. It has been
  since the Stage 1 deploy, but a replica booting without it writes photos to its own
  volume, and those are a 404 from the other replica for as long as they exist.
- `docker compose ps` shows `calorytracker-api-1` and `-2`, both healthy. If only one came
  up, the `container_name` is back.
- The logs of exactly one of them show migrations applied and the other show
  `database already up to date`. That is the lock working; both claiming to have applied
  the same migration would mean it is not.
- A photo uploaded through the app renders after a reload, several times over — the alias
  round-robins, so a few reloads is what puts the request on the other replica.

The row in the table above stays at *replicas need starting* until that has been done on
the host, not when this file changed.

Two smaller things worth doing whenever their file is next open, neither urgent:

- **Split the compose files by lane.** The `claude-home` volume, `.agent-workspace` and
  the memory cap are the subscription lane's; a deployment running `anthropic-api`
  should not carry a volume for a binary it never spawns. Slightly more pressing since
  the replica count went to two: both replicas mount the same `claude-home`, so the
  subscription lane has to be pinned back to one replica by hand — there is a comment
  saying so on `deploy.replicas`, which is a worse mechanism than two files.
- **Fix the auth gate in `routes/index.ts` and `scheduler.ts`.** Both still ask
  `hasSubscriptionAuth() || ANTHROPIC_API_KEY` before admitting a turn, which is a
  Claude-shaped question asked on behalf of whichever provider is configured — it
  already 503s a correctly configured `openai` deployment. The provider's own
  `checkAuth()` is the right thing to ask, and every provider already implements it.

  Smaller than it was: the journal's copy moved into `prepareTurn` when the streaming
  route was added, so one edit now covers both chat routes. `routes/index.ts` still has a
  second copy on the review route, and `scheduler.ts` has two.

## Not in this plan (deliberately)

Putting chat behind a job queue — see Stage 2. Sharding Postgres, which is nowhere near
being the constraint; a nutrition log is small and the reads are all keyed by user.
Caching model responses across users, because two people describing the same lunch still
have different day contexts and different targets, so there is nothing to share. And a
second region, which buys latency this product does not need and costs a data-residency
conversation it has not had.
