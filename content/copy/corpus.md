# What the corpus actually says

Measured 2026-09-05 against production, read-only. Regenerate with
`scripts/content/mine-corpus.sh`. Aggregates only — no sentence from anybody's
food diary is in this file, and none should ever be added to it.

Everything below is a **register reference for writing copy**. None of it is a
market claim, and §5 says why.

---

## 1. The correction that changes everything

`mine-corpus.sh` was written on the premise that `food_entries.description`
holds "the exact sentence a person typed". It does not. For every source
except `manual` (6 entries, 2.7%), that column is written by the model:

```
apps/api/src/ai/tools.ts:455
  description: z.string().describe(
    'Short human label for the whole meal, e.g. "Chicken, rice and salad".')
```

The column is the model's tidy label, and the shape it produces is its own
prompt example echoed back. That is why the first report read the way it did:

| Measured on | median words | contains a number | hedges |
|---|---|---|---|
| `food_entries.description` — the model's label | 4 | 4.9% | **0%** |
| `chat_messages.content` — what people typed | 8 | **47.4%** | 11.3% |

**The typed corpus is `chat_messages WHERE role = 'user'`.** Read the first
table as a description of the parser, and the second as a description of people.

---

## 2. Scale — is this a corpus yet?

Honestly: barely.

- **213 typed messages, 8 accounts**, 2026-08-19 → 09-04.
  (225 raw, minus the 12 onboarding-template messages — see §6.)
- **224 food entries, 572 items, 5 accounts have ever logged.**
- **96.4% of all entries are 3 accounts** — 36.6 / 32.1 / 27.7%.
- Those 3 log **3.6–4.2 entries per day** across 17–21 days each.
- **156 of 213 messages are Cyrillic**, 57 Latin-only.

So: three committed daily users, mostly writing Bulgarian. Treat it as a
register sample, not a population.

---

## 3. How people write when they log

- **Median 8 words**, p90 19. Twice the length of the label the model keeps.
- **They capitalise**: only 5 of 213 start lowercase.
- **They do not punctuate**: only 8 of 213 end in `.`/`!`/`?`.
- **23% use a comma.**
- **They quantify — 47.4% contain a number.** 39% a bare number ("100"),
  9.4% the word `грама`, 2.8% `лъжица` (spoon), 1.9% `парче` (piece).
- **They hedge 11.3% of the time** — but in Bulgarian: `около` (about) 5.6%,
  `малко` (a little) 5.6%. English `about/roughly/some/maybe/-ish` are
  essentially absent, which is a fact about who is using the app, not about
  whether people hedge.
- **Almost nobody asks it a question — 2 of 213.** The composer is used to
  log, not to converse.

Top typed words, templates excluded: `and` (24), `грама` (24), `вечеря` (18),
`днес` (18), `салата` (17), `шоколад` (17), `черен` (14), `малко` (13),
`десерт` (13), `обяд` (13), `около` (12), `ядох` (11), `вчера` (11),
`закуска` (11), `100` (10), `добави` (10).

## 4. What the parser does with it

- **Input mix:** text 74.1%, quick 9.4%, photo 9.4%, barcode 4.5%, manual 2.7%.
- **Compound entries are the norm:** 101 of 224 entries parsed into 3 items,
  47 into 2, only 50 into 1. A quarter of entries produced 4+ items.
- **Median entry is 429 kcal** (p10 175, p90 805).
- **Meals are even:** snack 27.2%, dinner 27.2%, lunch 26.3%, breakfast 19.2%.
- **Confidence:** `text` is 78% medium, 18% low, 4% high. The parser is not
  confident about sentences, and it says so.
- **Corrections: 11.2% of entries**, median time to fix **1m17s**.
  By source: **photo 33.3%**, text 10.2%, barcode 10.0%, quick 0%, manual 0%.

---

## 5. What this does and does not license

**Usable in copy.** The register: short, capitalised, unpunctuated, plainly
named food, a number about half the time, joined with "and" or a comma.
Write the cards at 8 words, not at 4, and let them carry a quantity.

**Usable on screen.** Compound parsing (3 items out of one sentence is the
common case) and the correction flow. Both are demonstrable in a recording,
which is the standard CONTENT_ENGINE.md §0 sets.

**Not usable as a statistic.** Nothing here goes in a post as a number:

- n = 8 accounts, three of which are the founder and test accounts.
- The photo-vs-text correction gap is **7 corrections out of 21 photo
  entries**. It points the right way, and it is far too small to publish.
  It is a reason to keep measuring, not a claim.
- No retention, weight-loss or accuracy claim survives this n at all.

The accuracy cards in `cards.txt` are phrased against ourselves precisely so
they need no number. Keep them that way until the corpus is an order of
magnitude bigger.

---

## 6. Two things found on the way

- **The onboarding message ships in two apostrophe variants** — 7 accounts
  sent `Hi — I'm new here. Let's get set up.` and 5 sent the same line with
  curly `’`. Harmless, but it is one string that should be one string, and it
  contaminates any word-frequency query that forgets to exclude it.
- **`food_entries.description` is not a corpus of user language** and no
  future analysis should treat it as one. `mine-corpus.sh` now reads
  `chat_messages` for register and keeps the `description` queries clearly
  labelled as measuring the parser.
