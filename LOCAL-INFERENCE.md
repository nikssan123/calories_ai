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
generation-bound one, so prefill throughput is what to shop for and memory bandwidth is
the second question rather than the first. It is not, on its own, enough to rule out
the unified-memory options — see Tier 1, where it ruled out a great deal less than the
first draft of this document claimed.

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

Priced 2026-09-22, the day the new Mac minis and Mac Studios shipped. **Every number in
the first draft of this section was wrong**, and it is worth saying why rather than
quietly restating it: that draft priced a 5090 build at ~€3,500 against a Mac Studio at
~€9,000 and concluded the obvious thing. Both halves have since inverted.

Two models have to be resident at once — a text model and a vision model — or every
photo turn pays a model swap, which on a 30GB weight load is several seconds on a turn
the user is already watching a spinner through. That, not parameter count, is what sets
the memory figure.

### What the market actually costs today

| | Memory | Bandwidth | US price |
|---|---|---|---|
| **Mac Studio, M5 Max, 40c GPU, 64GB** | 64GB | 614 GB/s | **$3,199** |
| Mac Studio, M5 Max, 32c GPU, 36GB | 36GB | 614 GB/s | $2,499 |
| Mac mini, M5 Pro, 18c/20c, 64GB | 64GB | 307 GB/s | $2,900 |
| Mac mini, M5 Pro, 15c/16c, 64GB | 64GB | 307 GB/s | $2,699 |
| Mac mini, M6, 32GB | 32GB | 170 GB/s | ~$1,300 |
| RTX 5090, card only | 32GB | 1.8 TB/s | $4,300–6,400 |
| RTX 4090, used, card only | 24GB | ~1 TB/s | ~$2,500–3,000 |
| RTX 3090, used, card only | 24GB | 936 GB/s | ~$1,400 |
| RTX PRO 6000 Blackwell, card only | 96GB | 1.8 TB/s | $16,000–20,000 |

A structural GDDR7 shortage — the same AI buildout this product is trying to buy its
way out of — has taken the 5090 from a $1,999 launch price to three times that, and the
RTX PRO 6000 from $8,565 to sixteen thousand and up. **Memory is now most of a GPU's
bill of materials, and the consumer cards have stopped being the cheap way to buy
VRAM.** Apple's memory pricing is inflated too ($1,000 for the 24GB→64GB step) but by
much less, which is the whole reason this table reads the way it does.

Add roughly 20% for Bulgarian VAT and check the local Apple store rather than
converting these figures.

### Tier 0 — the RTX 4080 you already own

16GB, already on the LAN, already serving ComfyUI per `CONTENT_ENGINE.md`. **Capex
zero, and it is the correct first purchase precisely because it is not one.**

What fits: a 12–14B class text model at 4-bit (~8–9GB) with 6GB left for KV, or a 7–8B
vision model, comfortably — but not both at once, and not the 30B-A3B MoE class
(~18.6GB at Q4, which is over the card). Concurrency at 8k context per sequence is a
dozen or so sequences, roughly a thousand times today's load.

This is not the production box. It is the box that answers, for free and this week,
the only question that matters: does an open model at this class write clean Bulgarian,
emit thirty-seven tools' worth of correct `tool_calls`, and read a plate?

Its one real limitation is that it cannot test the 30B-A3B class at all, and that class
is the one the Apple tiers below are sized for. So a clean pass at 14B is decisive and a
failure at 14B is not — which is an argument for renting an hour of a cloud A100 to
re-run the suites at 30B before spending three thousand dollars on the assumption.

### Tier 1 — Mac Studio, M5 Max, 64GB, $3,199

**The recommendation, and the first draft had it as the thing not to buy.**

614 GB/s and forty GPU cores. Two things make it the right shape rather than merely the
cheap one:

- **The M5 generation put a matrix unit — a Neural Accelerator — in every GPU core**,
  and prefill is what matrix units do. Time-to-first-token on the base M5 measured
  ~4x the M4's, and the M5 Max is about 2x the M5 Pro again. The 40:1 prefill ratio
  this document opens with is no longer the objection to Apple silicon it was one
  generation ago.
- **An MoE turns the bandwidth question off.** Bandwidth caps decode, decode reads only
  active parameters, and a 30B-A3B model reads ~3B of them per token. Published M5 Max
  figures are 100–120 tok/s on a *dense* 8B; a 3B-active MoE should sit comfortably
  above that. At ~600 output tokens a turn that is a few seconds, not a regression.

64GB holds the 30B MoE and a 32B-class vision model together with KV headroom. Raise
the GPU's share of it — macOS reserves about a quarter by default — with
`sudo sysctl iogpu.wired_limit_mb=57344`.

The $2,499 36GB base is a real option if the vision model stays at 8B (18GB + 6GB + KV
fits, barely). The $400 to 64GB buys the freedom to test a large VL model, and the
sequence this document recommends is one where that test has not happened yet.

### Tier 1b — Mac mini, M5 Pro, 64GB, $2,699–2,900

Same architecture, half the bandwidth (307 GB/s) and half the GPU cores. $300–500
cheaper than the Studio for roughly half the inference throughput, which is the wrong
side of that trade when the difference is one-tenth of the capex.

Worth it only if the box has to be small, silent and on a desk. It is not a bad machine
here; it is just beaten by its neighbour for $300.

### Tier 2 — CUDA, if concurrency ever demands it

Three to six thousand dollars for a 5090's 32GB, four thousand-ish for a used 4090's
24GB, sixteen thousand and up for 96GB on one board. All of them are worse value than
the Studio *at this product's concurrency*, and all of them are better at a hundred
simultaneous turns, where CUDA's batching and vLLM's maturity stop being a preference.

That is a real crossover and it is a long way from here. Revisit it when the account
count has three digits and the Mac is the thing that is slow.

### What not to buy

**The very large unified-memory boxes.** An M5 Ultra at 256GB or 512GB is sized to hold
a 200B-plus model. This product has no use for one, and moving 96GB→256GB costs $4,000
on its own.

**Storage upgrades.** 512GB holds macOS and every model this needs several times over.
Apple wants $800 for 2TB; a Thunderbolt SSD is a tenth of that and nothing here needs
the internal bus.

## The software, and why the objection I raised is gone

The second draft of this document said the cost case rested on vLLM's shared prefix
cache, that vLLM does not run on Metal, and that hand-rolling it was the real price of
an Apple box. **That is no longer true**, and it is the correction that moves the
recommendation more than any price does.

`vllm-mlx` is an OpenAI-compatible server for Apple silicon with continuous batching and
content-based prefix caching — reported at 21–87% higher throughput than llama.cpp,
4.3x aggregate throughput at 16 concurrent requests, time-to-first-token cut up to 5.8x
on shared prefixes, and 80%+ memory saved when ten or more users share one system
prompt. There is also an official MLX-backed vLLM Metal plugin.

That last figure is this product's exact shape: one 6k prefix of tool definitions and
`STABLE_SYSTEM_PROMPT`, identical for every account, which `SCALING.md` §Stage 4 already
establishes is the thing every turn is paying to re-send. The mechanism the whole cost
argument depends on exists on this platform now.

Two caveats that have not gone away:

- **Vision on MLX is younger than vision on vLLM.** `photo_log` and `pantry_scan` are
  the paths to be suspicious of, and the 30-plate suite is how the suspicion gets
  settled.
- **Tool-call parsing into OpenAI `tool_calls` must be verified, not assumed.** The
  hand-rolled loop in `providers/openai.ts` reads `tool_calls` off the response and
  degrades silently into a chat reply when they are absent. Thirty-seven tools with
  strict Zod schemas is where a quantised model shows its seams.

## The break-even

$3,199 over three years is $89/month. A Mac Studio at this product's duty cycle is idle
almost always — call it $2/month of electricity at Sofia rates, against the $8 a 5090
build would draw doing nothing. **~$91/month, all in.**

Against the text path, which is what it replaces:

- At today's cold-cache $0.041/turn, $91 buys ~2,200 turns — **about 19 active
  accounts** at the ~115 turns/month the one real account runs.
- At the warm-cache figure scale brings (~$0.012), $91 buys ~7,600 turns — **about 66
  active accounts.**

So somewhere between 20 and 65 actively logging accounts, and the honest answer is the
upper end, because the volume that justifies the box is the same volume that warms the
cache and makes the API cheaper.

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
4. **Then Tier 0**, as an experiment, on the 4080 — and an hour of a rented A100 to
   re-run the same suites at 30B, because that is the class the purchase would be for
   and the 4080 cannot hold it.
5. **Then Tier 1**, if and only if the suites passed and the headcount crossed the
   break-even. Both conditions, not either.

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
