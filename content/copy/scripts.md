# Shot scripts

Five videos, ordered by how close they sit to the thing the app actually does.
Each is a **claim, a test and a reveal** — which is what the text cards do not
have and cannot have. A card asserts; a video puts the assertion at risk in
front of the viewer and resolves it. That structure, not the production value,
is what every format in CONTENT_ENGINE.md §5 has in common, and it is what
Cal AI ran 281 times before it spent anything on ads.

All five need a phone, the app, and food already in the house. Four are silent
with captions. The longest is 40 seconds.

**Scripts 1 and 2 are the product.** Everything below them is a variation on a
theme those two establish. If only one thing gets shot, it is script 1, and
§6's rule applies to it specifically: record it once, cut twenty hooks over it,
let the algorithm choose. The remaining scripts are for after the first twenty
have told you which hook works.

**The one rule.** Do not film a test whose outcome you have already decided.
Script 3 is only worth making if you are willing to publish the run where the
app is wrong — that is the entire reason it beats a card claiming the same
thing.

---

## 1. One sentence, a whole meal — 15s

The core loop, and the only video that has to exist. Nothing is explained;
the viewer watches a sentence become structured food and draws the conclusion
themselves.

| t | On screen | Caption |
|---|---|---|
| 0–2 | Empty composer, the placeholder visible | **No forms. Nothing to search.** |
| 2–8 | Type one compound, unstyled sentence at real speed — "toast, two eggs, black coffee and half a banana" | *(none — the typing is the content)* |
| 8–12 | Send. Hold as the items resolve, each with its own macros | |
| 12–15 | The ring moves | **One sentence. Four items.** |

**Why it works.** Every competitor's demo has a search box, a results list and
a portion picker in it. This has a keyboard and a result. The contrast does the
work with no voiceover and no claim.

**Twenty variants.** Same capture, twenty hooks over the first three frames.
Pull them from `content/hooks/hooks.txt` and drive them with
`scripts/content/batch.mjs`. Do not re-shoot for each one.

**Do not** clean up the typing. Use the register the corpus actually shows —
median 8 words, 47% carrying a number, 23% with a comma. A typo that still
parses is worth more than a perfect sentence.

---

## 2. "Actually, there was more rice" — 20s

The differentiator. Every tracker can log a meal; the question this answers is
what happens when the number is wrong, which is the question the 2026
photo-accuracy findings put in everybody's head.

| t | On screen | Caption |
|---|---|---|
| 0–4 | An already-logged meal, its number visible | **It guessed.** |
| 4–6 | Hold on the number | **I think it's low.** |
| 6–12 | Type five words into the same box — "there was more rice than that" | **So I said so.** |
| 12–17 | The item updates in place. Meal total recalculates. | *(let the number change carry it)* |
| 17–20 | Nothing else changed — no re-logging, no second entry | **Four words. No re-logging.** |

**Why it works.** It is the shortest possible demonstration of the only claim
in the copy that competitors cannot match by adding a feature — it is
architectural. `food_items` is a separate table precisely so a correction
updates one row instead of replacing the meal.

---

## 3. The honest accuracy test — 40s

Everybody in this category films "AI guessed 450, real answer 480, incredible."
Since the 2026 findings (photo trackers running 250–345 kcal light per meal)
the audience has learned to disbelieve those. So film the one where it misses.

| t | On screen | Caption |
|---|---|---|
| 0–4 | A real, awkward plate. Not styled. | **Let's see how wrong this gets.** |
| 4–8 | Photograph it in-app | |
| 8–14 | The estimate appears. Hold on the number. | **It says 610.** |
| 14–26 | Weigh the components on a kitchen scale, fast cuts | **Let's check.** |
| 26–32 | Real total beside the app's | **It was ~120 out.** |
| 32–40 | One sentence fixes it, number moves | **Fixing it took four words.** |

**Why it works.** It concedes what the audience already suspects, then shows
the repair — which is script 2's claim, proven under adversarial conditions
instead of asserted.

**If the app lands within ~30 kcal:** publish that and change the last caption
to "it did not need fixing this time." Do not re-shoot until it misses. A test
re-run until it passes is an ad, and this audience can smell one.

---

## 4. A whole day, one thumb — 30s

Script 1 proves one sentence works. This proves it holds up across a day, which
is what a viewer has to believe before switching trackers.

| t | On screen | Caption |
|---|---|---|
| 0–3 | Empty day, ring at zero | **A whole day, one thumb.** |
| 3–20 | Four entries at real speed, compound and messy. Include one correction. | *(timer running in the corner)* |
| 20–26 | Ring filling, macros resolving | |
| 26–30 | Final total, timer stops | **No search box. No forms.** |

**Why it works.** Volume is the objection script 1 cannot answer on its own —
one lucky sentence proves nothing about a Tuesday.

---

## 5. "I forgot to log Sunday" — 20s

Backdating, which nothing in the copy or the store listing mentions.
Source: `tools.ts:148`, `prompt.ts:157` — logging a past day is "ordinary, not
an exception."

| t | On screen | Caption |
|---|---|---|
| 0–4 | Calendar, Sunday empty, today is Wednesday | **I forgot to log Sunday.** |
| 4–10 | Type "Sunday dinner was chicken and rice, about 300g" | |
| 10–16 | Cut to the calendar — it lands on Sunday | **It went to Sunday.** |
| 16–20 | Sunday's ring now filled | **Not today. Sunday.** |

**Why it works.** It answers the objection that actually kills trackers — you
fall behind, the gap becomes unfixable, you quit. Twenty seconds, one take,
no scale, no styling.

---

## What these deliberately are not

No generated food, per §0. No competitor named, per §5. No weight-loss result —
the weight data on the account is seeded. No user count and no download number:
the app is pre-release with one real logger.

Nothing here leads on languages. The reply-language behaviour is real and
genuinely uncopyable, but it is a differentiator for somebody who has already
decided to track their food, and none of these viewers has. It is parked in
`posts.md` for when the core is landing.

## Order to shoot

**1, 2, 5, 4, 3.**

Script 1 first and twenty times. Script 2 is the same setup with one extra
sentence, so it costs almost nothing once the phone is already out. Script 5
is twenty seconds and one take. Script 4 needs a clear day and a timer;
script 3 needs a kitchen scale and a willingness to publish a miss, so it goes
last — by which point the first four will have told you whether any of this is
worth the evenings.
