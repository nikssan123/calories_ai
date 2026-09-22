# Local inference

What it would take to run the model on hardware I own instead of renting it by the
token, written against this repository's own measured numbers rather than against a
benchmark leaderboard.

The short answer is at the bottom of every section, so here it is once at the top:
**the box is not the hard part and capacity is not the constraint.** One consumer GPU
carries more turns than this product will see for a long time. What decides the answer
is whether an open model can write Bulgarian and call thirty-seven tools without
dropping one — and, separately, whether the thing worth deleting is the model bill at
all, because 78% of a journal turn is not intelligence. It is a cache write.

## What would actually have to run

Not "an LLM". The turn this product runs is specific, and every one of these is a
requirement a candidate model either meets or does not:

| | |
|---|---|
| Tools in the journal prefix | 37, with strict Zod schemas |
| Cached prefix — tool definitions plus `STABLE_SYSTEM_PROMPT` | ~6k tokens |
| Volatile — day context plus replayed history | ~2k tokens |
| Model calls per turn | 2–3 |
| Gross input per turn | ~24k tokens |
| Output per turn | ~600 tokens |
| Languages a reply may be due in | 34, of which 10 already break Haiku 4.5 |
| Vision | Two kinds: a plate, and a fridge shelf |

The ratio at the bottom of that table is the one that picks the hardware: **~24,000
tokens read for ~600 written, or 40:1.** This is a prefill-bound workload, not a
generation-bound one, and that single fact rules out most of the cheap "big memory"
options further down.

The other shape worth naming is that the two vision kinds and the long-form kinds are
not the same problem as the journal. `ai/client.ts` already routes eight turn kinds
across three models for measured reasons, and a local box does not get to collapse that
back into one.

## Where the money actually goes

Measured on production, 2026-08-23, and already in `plans.ts`:

```
text log, blended            $0.041     ~70% of all turns
photo scan, Sonnet 5         $0.151
recipe, Sonnet 5             $0.170
meal plan, Opus 5            $0.630
pantry scan, Sonnet 5        $0.041
nudge, Sonnet 5              $0.025
weekly review, Opus 5        $0.024
```

And the breakdown of the heaviest account's $0.0942 text log:

```
cache write  12,234 tok x $6/M    $0.0734   78%
cache read   46,975 tok x $0.30/M $0.0141   15%
output          447 tok x $15/M   $0.0067    7%
```

Two things follow, and they point in opposite directions.

**Against buying hardware:** 93% of that turn is input handling, and input handling is
the part that gets cheaper by itself. 100% of production turns currently write cache
because at five accounts nobody keeps the prefix warm. `SCALING.md` §Stage 4 is right
that this inverts with scale — the same turn at a warm cache is roughly a third of the
price, with no purchase and no code. Anyone pricing a GPU against $0.041 is pricing it
against a number that is falling on its own.

**For buying hardware:** a local server does not have a cache *write* at all. vLLM's
automatic prefix caching keeps the 6k prefix resident in GPU KV and re-reads it for
free, permanently, at five accounts exactly as at five thousand. The single largest
line on the bill is not reduced, it is deleted by construction, and it is deleted
*now* rather than at the volume where warm-cache economics arrive. That is a better
argument for the box than any per-token comparison, and it is the one this document
was written to find.

**The third thing, which is neither:** 77% of production text logs escalate to Sonnet
because both real accounts write Bulgarian and `ai/language.ts` routes them there. The
blended $0.041 is mostly an escalation surcharge. A local model that cannot write
Bulgarian well does not address the majority of the actual bill — it addresses the 23%
that was already running on the cheapest model in the line-up. **Bulgarian is the
requirement, not a nice-to-have**, and it should be the first thing tested, before a
card is chosen.

## What can move local, and what should not

| Kind | Share | Move it? | Why |
|---|---|---|---|
| `text_log` | ~70% of turns | **Yes, if it passes** | Structured extraction. The whole case. |
| `pantry_scan` | low | Probably | Naming jars on a shelf, and the user confirms the list before anything is built on it. |
| `photo_log` | moderate | **Test it, do not assume** | Hardest task in the product — but see below. |
| `recipe`, `meal_plan` | low | No | Low volume, read end to end, and an allergy violation is the worst output this product can produce. |
| `review`, `content` | low | No | Long-form prose, infrequent, and the failure mode is a page that reads generated. |
| `nudge` | low | No | $0.025, unprompted, and not worth the integration risk. |

The counter-intuitive row is `photo_log`, and it is worth a paragraph because the
measurement is already in `ai/client.ts`. Sonnet 5 reads a weighed plate at 66% kcal
MAPE, correlating with the truth at r≈0.4, compressing every plate toward a typical
meal. Opus was not better. The frontier is *bad at this*, which means the bar an open
vision model has to clear is much lower than instinct says — the gap between $0.151 and
free may be a couple of points of MAPE on a task where the prompt matters more than the
model. It is also the one path where Haiku failed loudly rather than quietly (126%
protein error, and `items` returned as a JSON *string* on 100% of calls), which is
exactly the failure shape to expect from a quantised open model, so it must be measured
on the same 30 Nutrition5k plates and not argued about.

## The hardware

Sized against the requirement at the top, not against "how big a model fits". Two
models have to be resident at once — a text model and a vision model — or every photo
turn pays a model swap, which on a 30GB weight load is several seconds on a turn the
user is already watching a spinner through.

### Tier 0 — the RTX 4080 you already own

16GB, already on the LAN, already serving ComfyUI per `CONTENT_ENGINE.md`. **Capex
zero, and it is the correct first purchase precisely because it is not one.**

What fits: a 12–14B class text model at 4-bit (~8–9GB) with 6GB left for KV, or a 7–8B
vision model, comfortably — but not both at once, and not the 30B-A3B MoE class
everyone recommends (~18.6GB at Q4, which is over the card). Concurrency at 8k context
per sequence is a dozen or so sequences, which is roughly a thousand times today's
load.

This is not the production box. It is the box that answers, for free and this week,
the only question that matters: does an open model at this class write clean Bulgarian,
emit thirty-seven tools' worth of correct `tool_calls`, and read a plate? If the answer
is no at 14B, the answer at 30B is probably also no for the same reasons, and you have
spent nothing finding out.

### Tier 1 — one RTX 5090, 32GB

~€2,000–2,800 for the card, ~€3,200–3,800 for a build around it. The recommendation
if Tier 0 comes back clean.

32GB of GDDR7 at ~1.8TB/s runs the 30B-A3B MoE class at Q4 (~18GB) with an 8B vision
model beside it and real KV headroom, or a 27B dense at Q4 with more room for
concurrency. Prefill on this card is the part that matters — several thousand tokens a
second with batching on a model that size, against a peak requirement of ~4,400
prefill tokens/sec at a thousand users (11 turns/min × 3 calls × ~8k, from `SCALING.md`).

**One card is worth more than its specification, because it is one card.** No tensor
parallel, no NVLink question, one PSU, one thing to fail.

### Tier 2 — 96GB on one board

An RTX PRO 6000 Blackwell class card, ~€8,500–10,500, ~€11,000–13,000 built. Or two
5090s for ~€6,500, with the tensor-parallel tax that implies.

This is the tier that could hold a 27–32B text model at fp8 *and* a 32B-class vision
model resident together with room for the long-form kinds, which is the only
configuration where more than the journal moves off the API. It is also several times
the annual API bill at any headcount this product has seen, so it is a tier to arrive
at from Tier 1 running out of room, never to start at.

### What not to buy, and why

**Unified-memory boxes — Mac Studio, DGX Spark, Strix Halo.** They are the obvious
suggestion (128GB–512GB for the price of a GPU) and they are the wrong shape for *this*
workload. They trade compute for capacity, which is the right trade for generating long
answers and the wrong one for reading 24k tokens to write 600. A €9,000 Mac Studio
would lose to a €3,500 5090 on a 40:1 prefill ratio. If the ratio ever inverts — if
`meal_plan` and `content` became the volume — revisit this, and only then.

**Datacentre silicon.** An A100 or H100 is priced for people whose alternative is a
larger API bill than this product will have for years.

## The break-even

Amortise Tier 1 over three years: €3,500/36 ≈ €97/month, plus power. A 5090 box idles
around 70W and this product would leave it idle nearly all of the time — call it 50
kWh/month, ~€8 at Sofia residential rates. **~€105/month all in.**

Against the text path, which is what it replaces:

- At today's cold-cache $0.041/turn, €105 buys ~2,600 turns — **about 25 active
  accounts** at the ~115 turns/month the one real account runs.
- At the warm-cache figure scale brings (~$0.012), €105 buys ~8,900 turns — **about 80
  active accounts.**

So Tier 1 pays for itself somewhere between 25 and 80 actively logging accounts, and
the honest version is the upper end, because the volume that justifies the box is the
same volume that makes the API cheaper. Tier 2 needs roughly four times that.

The other frame, which is the better one for a product with five accounts: at Plus's
$9.99 and a COGS of ~$4.10 per hundred messages, the journal runs at roughly a 55%
gross margin today. Moving `text_log` local takes that toward 90%. That is a margin
argument, not a cost-saving one, and margin arguments are worth making *after* there is
revenue to apply them to.

**At five accounts, buying anything loses money.** The 4080 is free and should be used;
everything else waits for a number.

## The order to do this in

Cheapest first, and the first three are worth more than the hardware:

1. **`SCALING.md` §Stage 5 — collapse the tool loop.** One `messages.create` with
   structured outputs in place of a 2–3 call loop on 70% of turns. Cuts input per turn
   by roughly two thirds and cuts the 12,234-token cache write with it. Costs nothing,
   helps the local box too, and reduces the model the local box has to be good enough
   to replace.
2. **Move the async kinds to the Batch API.** `review`, `nudge`, `content` and
   `content_plan` all run from the scheduler with nobody waiting. Nothing in
   `apps/api/src` uses batches today. Half price on every one of them, for a queue.
3. **Shrink the prefix.** The journal sends all 37 tool definitions on every text log.
   A `text_log` does not need `planWeekTool`. Cache write is charged on the whole
   prefix, on every turn, at 78% of the bill.
4. **Then Tier 0**, as an experiment, on the 4080.
5. **Then Tier 1**, if and only if Tier 0 passed and the headcount crossed the
   break-even.

## What Tier 0 looks like, concretely

No application changes are needed to try this. `providers/openai.ts` was built on
`fetch` against the Chat Completions dialect precisely so that `OPENAI_BASE_URL` can
point somewhere else, and `readOpenAiConfig` already routes the vision slot separately
from the base model:

```
AI_PROVIDER=openai
OPENAI_BASE_URL=http://<pc-ip>:8000/v1
OPENAI_API_KEY=whatever-vllm-was-started-with
OPENAI_MODEL_TEXT=<the text model>
OPENAI_MODEL_VISION=<the vision model>
```

Serve it with vLLM rather than Ollama — Ollama is the right thing for one person at a
terminal and the wrong thing behind an API, because the two features this workload
lives on are the ones vLLM has and it does not: continuous batching, and automatic
prefix caching. Three flags are load-bearing:

- `--enable-prefix-caching`, which is the whole cost argument.
- `--enable-auto-tool-choice --tool-call-parser <model's parser>`, without which the
  hand-rolled loop in `providers/openai.ts` sees no `tool_calls` and every turn
  silently degrades into a chat reply.
- guided decoding (xgrammar), which is how the Haiku failure mode — `items` returned as
  a JSON string — is made structurally impossible rather than hoped against.

Two things to know before wiring it up:

**Lanes are per user, not per turn kind.** `laneFor(email)` in `ai/lane.ts` answers one
provider for the whole account, so "journal local, recipes on Claude" is not expressible
in configuration today. Two ways round it: put LiteLLM in front of the local server and
let it route by model name and fall back to Anthropic when the box is down — no code
change at all, and the fallback is worth having on its own — or extend `laneFor` to
take a `TurnKind`. The gateway is the better first move.

**Set the price variables, do not leave them at zero.** `openAiRate` reports the cost as
unknown when `OPENAI_PRICE_INPUT`/`OPENAI_PRICE_OUTPUT` are unset, and a local box is
not free — it is capex plus electricity divided by tokens. Setting them to the
amortised figure keeps `economics()` and the admin cost panel honest, which is the
whole reason that panel exists.

## The measurements that decide it

This is the part with no shortcut, and the part this repository is unusually well set
up for — `ai/client.ts` and `ai/language.ts` both record exactly how their decisions
were measured. None of those harnesses are committed. **They have to exist before a
card is bought**, because "same output capacity" is a claim, and every one of the
claims in this repo that turned out to be wrong was wrong because somebody quoted a
table instead of running the query.

Three suites, in order of what they would kill:

1. **Bulgarian, 12 runs.** The protocol in `ai/language.ts` — one meal log and one
   four-sentence answer, with and without the language named. 12/12 clean, or the
   candidate is out, because this is 77% of the bill. Worth checking whether a
   Bulgarian-tuned open model (INSAIT's BgGPT line, built on Gemma) beats a general
   one here, and worth being suspicious of its tool calling if it does. Then the other
   nine languages `ai/language.ts` lists as broken on Haiku.
2. **Tool calling, the real prefix.** All 37 tools, a hundred journal turns, counting
   malformed calls, wrong-tool calls and JSON-as-string. Quantisation degrades this
   first and it degrades quietly.
3. **The 30 Nutrition5k plates, 3 runs each**, scored the way `ai/client.ts` scores
   them, against Sonnet's 66.1% kcal MAPE and 56% protein. And the 12 pantry scenarios
   for `recipe`, where zero dietary failures is the bar and the sample that set it was
   thin.

A candidate that passes 1 and 2 and fails 3 is still a good outcome: it moves 70% of
turns local and leaves the photos on the API, which was always the likelier shape of
this.

## Open questions

- **Does the warm-cache figure arrive before the break-even does?** Both are functions
  of the same headcount. If the API price per turn falls faster than the account count
  rises, the box never becomes the cheaper option and this document's answer is "no,
  permanently".
- **What do the plan meters mean on a lane with no marginal cost?** `unmeteredFor` lifts
  them only for the subscription. Every ceiling in `plans.ts` is a cost control priced
  off `ai_usage`, and a local lane makes those ceilings protect a margin that is no
  longer there. That is a pricing decision, not a technical one, and it should not be
  made accidentally by an env var.
- **Who is on call for the box?** If the product's inference is in a flat in Sofia, the
  product's uptime is that flat's power and uplink. The LiteLLM fallback is the answer
  and it needs to exist before the box serves a single real turn, not after the first
  outage.
