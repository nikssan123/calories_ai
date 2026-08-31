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

**Built:** Stage 0 in full, all of Stage 1 — shared rate-limit counters and photos in a
bucket, both optional and both off by default — all of Stage 2, and the pieces of Stage 3
that are code rather than infrastructure: the pool ceiling, the scheduler's re-entrancy
guard, and — 2026-08-31 — the serial walk itself. Streaming landed on 2026-08-22 and is
the only item so far that a user can see. The token bucket, Stage 2's last piece, landed
the same day: migration `025`, the bucket in `ai/token-bucket.ts` and its admission call
in the `anthropic-api` provider.

**The Monday cliff is code now, 2026-08-31.** Three separate things, none of them the one
this document had been expecting to need — see Stage 3, which is rewritten around what
was actually there. The short version: the pass runs its accounts over a worker pool
rather than one at a time, it reads only the accounts in a timezone that is actually due,
and a review email that failed to send is now retried instead of being lost forever. The
third was a real bug rather than a scaling item, and it is the one that would have hurt
most: at a thousand accounts a handful of provider failures every Monday is arithmetic,
and each one was a paying customer whose review was written and never mentioned to them.

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

**Deploy topology built and deployed, 2026-08-22.** `api` no longer carries a
`container_name` and takes its replica count from `API_REPLICAS`. Two things came out of
doing it, and the second is the more useful:

*Migrations were not multi-replica safe.* They run on boot in every container and the
runner took no lock, so two replicas starting together both read an empty ledger and both
applied the same migration. The loser took its boot chain down with it and restarted —
recovering on the retry, which is what made it worth finding now rather than later,
because a replica that flaps once per deploy is a symptom a deploy learns to ignore.
`src/migrate.ts` now takes a blocking advisory lock and reads the ledger inside it, and
`test/migrate.test.ts` boots two pools at once and fails without it. `deploy.sh` now asks
each replica for `/health` on its own loopback rather than making one round-robin request
through the alias, which is the check that catches this shape from outside.

*This deployment cannot take a second replica yet, and the reason is not in this
document's list.* It runs the **subscription lane** — `AI_PROVIDER` is unset on the host,
which means `anthropic` — so a second replica is two `claude` processes sharing one
`claude-home` volume and one `.credentials.json`, with two of them refreshing one OAuth
token. Every store this plan spent Stage 1 on is genuinely shared and none of them is the
problem. The replica count is therefore `${API_REPLICAS:-1}`: safe by default, opt-in by
setting `API_REPLICAS=2` on a host running `anthropic-api`.

It was briefly deployed at two replicas before this was noticed, and put back to one. What
that says about the plan is worth keeping: "start the second replica" was filed under
deploy topology, and both of its real blockers were somewhere else — one in the boot path,
one in the choice of provider.

**Left:** moving this deployment to `anthropic-api`, which is now what stands between it
and a second replica — and which, with the token bucket built, has nothing left in front
of it but setting three variables. And Stage 5, which the rate-limit question, now
answered, demotes from prerequisite to optimisation. Each is marked in place, and the
ordered list is at the end.

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
meant `--scale` would not even start; it is gone, and the service takes its count from
`API_REPLICAS`. Nothing in this repository now pins the *product's* lane to one container
— but the deployment at daysofar.com is not on the product's lane yet, and the
subscription lane is pinned to one container by the `claude` subprocess and the single
credential store it shares, which no amount of Stage 1 work changes.

**The weekly review — no longer a ceiling, as of 2026-08-31.** `runDueReviews` in
`scheduler.ts` used to walk every active user serially, generating each review on Opus. At
a few hundred users in one timezone that already ran longer than the hour between ticks.

Both halves are now fixed and both are worth recording, because the shapes recur.

*Re-entrancy.* `tick()` had no guard, so two overlapping runs could both call the model for
the same user before either committed, which is two reviews and two emails. The pass looks
idempotent: it asks whether this week has been written before writing it. But that question
is answered forty seconds before the write that settles it, which is plenty of room for the
other run to ask it too and get the same answer. Fixed by the job lock — Stage 3, item 1.

*The serial walk.* Fixed by Stage 3 items 2 and 3: a bounded worker pool, and reading only
the accounts in a timezone that is actually due. The second is the one that generalises —
the pass was loading every account in the database twenty-four times a day to ask each one
a question whose answer only depends on its timezone.

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

- **A token bucket in front of the model call — built.** `ai/token-bucket.ts`, sized in
  tokens per minute from `ANTHROPIC_ITPM` with 20% kept back, one bucket per model, and
  its admission call in `providers/messages.ts`. It went where this section said it
  should: inside the metered provider, so the subscription lane — which shares a budget
  with my own terminal rather than having a tokens-per-minute ceiling — and the OpenAI
  lane are untouched by a limit sized against Anthropic's tiers. Unset means no bucket,
  which is the right default for a personal install and the wrong one the moment the key
  is metered; `.env.example` says so next to `ANTHROPIC_API_KEY`.

  Four decisions inside it were not obvious from up here.

  **It admits a whole turn, not a model call.** The heading says "in front of the model
  call" and that turns out to be the wrong place by one level. A turn is two or three
  round trips with tool writes in between, so a check before each call can refuse the
  third — after the meal is in the log and before the sentence saying so is written.
  Reserving the turn's whole estimate up front means the only refusal possible is the
  one that costs nothing, and it is also the only one that can be a clean 429 rather
  than a half-finished turn.

  **A constant per `TurnKind` is not the fallback here, it is the correct instrument.**
  This section offered `messages.count_tokens` as the exact figure. It is exact about
  the wrong quantity: it reports *gross* input and cannot know which of it will come
  back as a cache read, so admitting against it would govern this lane to about a
  quarter of its real capacity — and the pessimism would look exactly like a ceiling
  being hit. What counts is the volatile remainder, which is what the table estimates.
  It is also a round trip of its own on the front of a watched path.

  **Every turn settles up against what it actually spent.** `input_tokens +
  cache_creation_input_tokens`, summed over the turn's calls, replaces the estimate when
  the turn ends — including when it ends in an error, which is the case that matters
  most: a turn that spent nothing hands its whole reservation straight back. This is
  what makes the constants above a starting point rather than a maintenance burden, and
  it is worth re-deriving them from `ai_usage` after real traffic, which already records
  both columns per kind.

  **The two scheduler kinds wait; everything else is refused.** Fast rejection is right
  where somebody is watching a screen, and it is what `review` and `nudge` are not:
  nobody is waiting on a weekly review, and the alternative to a one-minute wait is a
  review that is simply never written. A pass that walks every user is also the one
  thing in this product that can empty a bucket by itself, which is Stage 3's subject.
  Past a full refill it gives up rather than holding a pass open behind its job lock.

  The bucket lives in Postgres, on the same reasoning `turn_lock_until` does — an
  in-process bucket defends nothing once there are two replicas. Not Redis, which is
  optional here precisely because the request limiter can afford to be approximate; this
  ceiling has to hold on exactly the deployment that is metered, cache or no cache. The
  balance is stored as of a timestamp and every reader brings it forward, so there is no
  ticker to run and a leaked reservation is repaid by the next minute's refill.
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
bucket is perhaps 3,000 reviews all falling due at 08:00 local, against what was a serial
loop at roughly forty seconds each — eleven hours for a thousand of them, thirty-three for
three thousand.

1. **A Postgres advisory lock around the tick — built**, in `services/job-lock.ts`, so
   overlapping runs and multiple replicas cannot double-fire. Here the advisory lock
   *is* the right instrument, where it was the wrong one for a user's turn: a
   background pass can happily hold a connection for its duration, there is exactly
   one of them by construction, and the lock dies with the connection, so a killed
   process releases it rather than blocking the next hour. The two passes take
   separate locks — they share a tick and nothing else, and a review pass grinding
   through a timezone must not be why nobody gets a nudge.
2. **A bounded worker pool over the accounts — built, 2026-08-31**, in `concurrency.ts`,
   applied to all three passes. Eleven hours becomes about ninety minutes. The width is
   derived from `DATABASE_POOL_MAX` rather than picked (`poolMax - 2`, so eight by
   default), because the pool is what actually bounds it: every worker's queries come out
   of the same `max`, and the job lock is already holding one connection of it for the
   pass's whole duration.

   Nothing about correctness rests on the width, which is the property worth stating.
   Every pass still decides what is due by looking for the row it would have written, so
   two workers cannot publish the same review — and the model side needs no new limiter,
   because `reserve()` in `ai/token-bucket.ts` already makes `review` and `nudge` *wait*
   for capacity rather than collect 429s. A width larger than the per-minute budget buys
   queueing inside `reserve` and nothing else.
3. **Only the accounts that are due — built, 2026-08-31.** A pass is a question about a
   *clock*, and the clock is the same for everyone in a timezone. Both timed passes now
   ask `activeTimezones()` which zones are due and read only the accounts in those, so on
   the six days a week when nobody's review is due the pass reads no user rows at all
   rather than all of them.

   The clock stays in TypeScript deliberately. Postgres could answer
   `EXTRACT(ISODOW FROM now() AT TIME ZONE timezone)` and save the round trip, and it
   would be wrong twice: the publishing rule would exist in two languages that have to
   agree, and `AT TIME ZONE` over a column *throws* on a name Postgres does not carry —
   turning one account with an exotic zone into a pass that fails for everybody.
   `timezone` is stored as the client sent it and validated against nothing, so that is a
   live possibility rather than a hypothetical; `dueZones` drops an unreadable zone and
   logs it instead.
4. **A review email that failed is retried — built, 2026-08-31**, and this was a bug, not
   a scaling item. `claimDelivery` writes its row *before* the request, which is right —
   a crash in between would otherwise let a retry send a second copy. What it missed is
   that the row stays behind after a *failure* too, and `ON CONFLICT DO NOTHING` cannot
   tell "already sent" from "tried once, the provider was having an afternoon". Every
   later attempt at that key was answered "already sent" and the message was never sent
   at all.

   Three layers now, migration `041`: the transport retries a 429/5xx/timeout inline
   (three attempts, honouring `Retry-After`); `claimDelivery` re-grants a claim over a
   failed row, bounded by `attempts < 5`; and the review pass, on finding a review that
   is already written, asks `deliveryOutstanding` whether the mail actually went and
   re-sends if it did not. The hourly tick is therefore the retry — it already runs, it
   is already spread across the whole of Monday, and hourly is exactly the backoff a
   rate-limited provider wants.

   **The push is deliberately not retried.** It has no idempotency key and no row to key
   one on, so a second attempt is not a retry — it is a second notification, and hourly
   for a Monday is a far worse bug than the one being fixed.
5. **A rate limiter in front of scheduled mail — built, 2026-08-31.** Resend allows two
   requests a second on a new account, and the review pass is the one thing here that
   would post three thousand at once. `EMAIL_MAX_RPS` paces the *bulk* lane only;
   interactive mail is not governed by it, because a password reset must never queue
   behind a morning's worth of weekly reviews.
6. **Move the pass out of the API process — not built** — into a worker, same image,
   different command. Still the right shape eventually: a weekly review should not
   compete for the token budget with someone logging lunch. Less urgent than it was, since
   the token bucket already governs that competition per model and the pass waits its turn
   inside it rather than crowding the live path out.
7. **The Batch API — not built.** Reviews are the textbook case: non-interactive, bulk, and
   deadline-insensitive. Half price, results within 24 hours, and — the part that matters
   here — batch traffic does not consume the standard per-minute limits, so the entire
   Monday spike leaves the budget that serves live turns. Submit at the top of the hour,
   poll until the batch ends, publish and mail as results land. Key results by
   `custom_id`; they return in arbitrary order.

`isReviewTime` is already a window rather than an instant, deliberately, so a review
landing at 09:30 instead of 08:00 needs no other change anywhere — and items 4 and 5 both
lean on that: the retry and the pacing both spend Monday, and the window is what makes
that free.

**Resend's batch endpoint was considered and not used.** It would collapse a thousand
POSTs into ten, which sounds like the obvious answer and is not the one this needed: the
send rate was never the binding constraint — at 2/s a thousand emails is eight minutes
against ninety of model time — and it takes one idempotency key per *request* rather than
per message, which would cost exactly the per-message guarantee item 4 is built on. Worth
revisiting only if `EMAIL_MAX_RPS` is ever raised as far as it goes and sending is still
the thing that is slow.

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
| ~2,000 | Stage 0. Two replicas. Nothing else. | Code, stores, compose and deploy done and proven at two replicas. Held at one **by choice** since 2026-08-23 — the lane blocker is gone, the need has not arrived. See below. |
| ~10,000 | Stages 1–3. Not Stage 5 — cache reads turned out not to count against the ceiling at all. | Stages 1 and 2 done; Stage 3's guard done, the worker and the Batch API open |
| ~100,000 | All of it, pgbouncer, and a negotiated rate-limit tier. | open |

Stage 0 unblocked. Stage 3 removes the only real spike. Stage 2 is the seatbelt that
stops a bad afternoon becoming an outage, and is now fastened. Stage 5 was written
down as the thing that buys headroom; it is not, because the headroom was already there —
it buys requests, money and latency instead.

### When to start the second replica

**Not on a user count, and not yet.** Measured on the host, 2026-08-23:

```
users                     4
turns, last 7 days       59        (~8 a day, all accounts together)
busiest single minute     2 turns  (all time)
api container         0.15% CPU · 182 MiB of a 2 GiB cap
box                   4 cores · 5.1 GB RAM free
```

The ~2,000 row above is the honest number for *this* stage, but it is worth being clear
about what it is measuring, because it is not throughput. Working the ceiling from the
other end: a turn spends about 1,370 tokens against the rate-limited total — uncached
input plus cache writes, cache reads being excluded from it outright — so 10M ITPM is
something like 7,300 turns a minute. Even assuming meals cluster hard into a few hours,
the model-side ceiling is several hundred thousand users. One replica is nowhere near
being the constraint on load.

**So the second replica is an availability decision, not a capacity one.** One replica
means a deploy drops whatever turn is in flight and a crash is an outage. That starts
mattering when there is somebody to notice, which is a different question from when the
box is busy.

Watch these instead of a user count, all of which move before anything breaks:

- **p95 turn duration climbing** with no model or prompt change behind it. `ai_usage`
  has `duration_ms` on every row, which is what makes this readable rather than felt.
- **429s from the token bucket.** The bucket is the seatbelt; it tightening is the first
  hard evidence that arrival rate is real.
- **Container memory approaching the 2 GiB cap.** A photo turn holds several megabytes of
  base64 for the length of the call, so concurrency shows up here before it shows up in
  CPU. 182 MiB today.
- **Somebody complaining that a deploy ate their message.** The least technical signal
  and the one that actually decides it.

None of these is close. Revisit when one of them moves, not on a date.

### The two lanes, per user

Implemented 2026-08-23. The split this document opens with — the subscription lane for
the instance I run for myself, the metered lane for the product — is no longer a choice
made once per deployment. `SUBSCRIPTION_EMAILS` names the addresses whose turns run on
the Claude Code subscription; everybody else takes `AI_PROVIDER`, which on this host is
now `anthropic-api`.

Three things make it work, and the middle one is the one that would have made it a lie:

- **`createProvider` was already per turn**, because the tool context it closes over is
  per turn. Routing by user was a parameter, not a restructuring. Five call sites — the
  journal, the fridge scan, the review, the nudge and the recipe path — each pass the
  lane for the account the turn belongs to.
- **The Agent SDK prefers `ANTHROPIC_API_KEY` to the subscription login.** On a host
  carrying both credentials — which is now this one — the subscription lane would have
  been billed to the key *and* paid for a subprocess to do it, silently. The subprocess
  is now handed an environment with that variable removed (`Options.env` replaces rather
  than merges, so the rest of `process.env` is passed through — `HOME` is how the binary
  finds its credentials at all).
- **The allowlist can only move somebody onto the subscription, never off it**, and only
  when there is a login to move them to. Naming an address can never make a turn cost
  money, or take longer, than not naming it. That property is what makes the setting safe
  to leave in place while the deployment's own lane changes underneath it.

**The plan meters follow the same line, and for a month they did not.** A ceiling in
`plans.ts` is priced in dollars off `ai_usage`, and a turn on the subscription spends
none of them, so `unmeteredFor` lifts all five sold meters for an address on this lane.
It was written asking for the *absence* of `ANTHROPIC_API_KEY` — the correct question
before `subscriptionEnv` existed, and wrong the moment it did, because the whole point of
the split is a host that carries both credentials. So on the only deployment the feature
was built for, `SUBSCRIPTION_EMAILS` moved the lane and left the wall exactly where it
was: the operator's own accounts paid for their turns on the key and then met a paywall
telling them to subscribe. Fixed 2026-08-24 — the predicate now asks
`hasSubscriptionAuth()`, the same condition `subscriptionEnv` strips the key on, and
`lanes.test.ts` pins the two together because the safety argument spans both files.

**The replica constraint follows the lane, and now follows it per user.** Any traffic on
the subscription lane means a `claude` subprocess against one shared `.credentials.json`,
and two replicas refreshing one OAuth token is how a login gets lost. So while
`SUBSCRIPTION_EMAILS` is non-empty this deployment stays at one replica — which costs
nothing today, per the section above, and is the thing to revisit first when the second
replica is finally wanted. Splitting the two lanes into two services, one pinned to a
single replica and one free to scale, is the way out and is not worth building yet.

### What is left, in the order it wants doing

1. ~~**Move this deployment to `anthropic-api`**~~ — **done, 2026-08-23.**
   `ANTHROPIC_API_KEY`, `AI_PROVIDER=anthropic-api` and `ANTHROPIC_ITPM=10000000` are in
   the host's `.env`; `https://daysofar.com/api/health` reports
   `{"ok":true,"auth":"anthropic-api-key"}` — and reports
   `claude-code-subscription+anthropic-api-key` once a login is on the `claude-home`
   volume, which is how to check that it is there without a shell on the host. The ITPM is the account's published ceiling,
   read off the `anthropic-ratelimit-input-tokens-limit` response header rather than
   guessed — 10M/min on Haiku 4.5, Sonnet 5 and Opus 5 alike. This is the point where the
   bill started.

   **The second replica did not follow, and should not yet.** See §When to start the
   second replica below. The blocker this step described is gone; what replaced it is
   that there is nothing to scale.
2. **Stage 5.** An optimisation, at the priority the answered question assigns it: it
   buys requests, money and latency, and no headroom that is not already there. Worth
   doing before six figures of users, not before the replica.
3. **Direct uploads.** The client PUTs to a presigned URL and sends the API a photo id
   instead of several megabytes of base64. Worth doing, but an optimisation rather than
   a blocker now the bucket exists: it takes the +33% encoding and a 25 MB body off the
   API's path, and it means a slow phone uplink is no longer holding a request open.
   The wrinkle is that the model needs the bytes, so the turn either fetches them back
   or passes the presigned URL as an image source.

What is left of step 1, whenever `API_REPLICAS=2` is finally set:
`bin/deploy.sh`, then check that a photo taken on one replica renders on the other — which it will, because neither of them holds it. Sessions,
photos and counters all live outside the container. Worth confirming in this order:

- `S3_*` is set in the host's `.env` before the second container ever starts. It has been
  since the Stage 1 deploy, but a replica booting without it writes photos to its own
  volume, and those are a 404 from the other replica for as long as they exist.
- `docker compose ps` shows `calorytracker-api-1` and `-2`, both healthy. `deploy.sh`
  prints the replica count and healths each one separately, so this is already checked; if
  only one came up, `API_REPLICAS` did not reach the host's `.env`.
- The logs of exactly one of them show migrations applied and the other show
  `database already up to date`. That is the lock working; both claiming to have applied
  the same migration would mean it is not.
- A photo uploaded through the app renders after a reload, several times over — the alias
  round-robins, so a few reloads is what puts the request on the other replica.

The row in the table above stays at *replicas need starting* until that has been done on
the host, not when this file changed.

Two smaller things worth doing whenever their file is next open, neither urgent:

- **~~Split the compose files by lane.~~ Withdrawn, 2026-08-23.** The premise was that a
  deployment runs one lane, so a metered one should not carry a volume for a binary it
  never spawns. This deployment now runs both — four accounts on the subscription, the
  rest on the key — so the `claude-home` volume is load-bearing here and splitting the
  file by lane would describe a topology that no longer exists.

  What the item was really about survives and is now recorded where it belongs: the
  replica count is constrained by whether *any* traffic takes the subscription lane, and
  that is written down under §The two lanes, per user rather than left to a default
  somebody could raise without reading why it is low.
- **~~Fix the auth gate in `routes/index.ts` and `scheduler.ts`.~~ Done, 2026-08-23** —
  `scheduler.ts` committed, `routes/index.ts` applied but held back (see below).
  `authErrorFor(lane)` asks the provider that will actually run, with each lane's check
  pulled out standalone so it can be answered before a tool context exists. The gate on
  the chat routes moved below `getUser`, because the lane is now a per-user decision and
  the question is whether *their* lane can run.

  The scheduler keeps the deployment-lane form on purpose: a pass has no user in hand
  when it decides whether to bother, and `review.ts` and `nudge.ts` already ask their own
  provider before running a turn.

  `routes/index.ts` is applied in the working tree but not committed: it also holds a
  parallel session's in-flight routines change whose supporting edits are uncommitted, so
  committing it would produce a tree that does not build. It goes in after theirs lands —
  the same thing that happened to this file once before.

## Not in this plan (deliberately)

Putting chat behind a job queue — see Stage 2. Sharding Postgres, which is nowhere near
being the constraint; a nutrition log is small and the reads are all keyed by user.
Caching model responses across users, because two people describing the same lunch still
have different day contexts and different targets, so there is nothing to share. And a
second region, which buys latency this product does not need and costs a data-residency
conversation it has not had.
