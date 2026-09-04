# Shot scripts

Four videos. Each is a **claim, a test, and a reveal** — which is the thing the
text cards do not have and cannot have. A card asserts; a video puts the
assertion at risk in front of the viewer and then resolves it. That structure,
not the production value, is what every format in CONTENT_ENGINE.md §5 has in
common, and it is what Cal AI ran 281 times before it spent anything on ads.

All four need a phone, the app, and food that is already in the house. None
needs the 4080, a voiceover artist, or a script read to camera — the longest is
40 seconds and three of them are silent with captions.

**The one rule.** Do not film a test you have already decided the outcome of.
Two of these are only good if you are willing to publish the run where the app
is wrong — that is the entire reason they beat a card that says the same thing.

---

## 1. "My app is in English. I log in Bulgarian." — 25s

The strongest one, and the only one nobody else can copy. Source:
`apps/api/src/ai/language.ts`.

| t | On screen | Caption |
|---|---|---|
| 0–3 | Composer open, English UI, thumb hovering | **My calorie app is in English.** |
| 3–8 | Type a real Bulgarian dinner, unhurried, let them read the Cyrillic | **I log my food in Bulgarian.** |
| 8–12 | Send. Hold on the reply appearing in Bulgarian | *(none — let it land)* |
| 12–18 | Slow scroll: the items, the macros, all correct | **It answered in Bulgarian.** |
| 18–25 | Cut to Settings showing the interface language is English | **Nothing is set to Bulgarian.** |

**Why it works.** The viewer expects the app to answer in its own language.
It doesn't, and it's right. That's a genuine surprise, it's on screen in four
seconds, and no other tracker demonstrates it because most decide from a
settings row.

**Comment bait:** "does it do <their language>". Answer honestly — 24 measured
clean, 10 escalated, anything unmeasured gets the better model.

---

## 2. The honest accuracy test — 40s

Everybody in this category films "AI guessed 450, real answer 480, incredible."
The 2026 research (250–345 kcal light per meal, photo-based) means the audience
has started to disbelieve those. So film the one where it misses.

| t | On screen | Caption |
|---|---|---|
| 0–4 | A real, awkward plate. Not styled. | **Let's see how wrong this gets.** |
| 4–8 | Photograph it in-app | |
| 8–14 | The estimate appears. Hold on the number. | **It says 610.** |
| 14–26 | Weigh the components on a kitchen scale, one by one, fast cuts | **Let's check.** |
| 26–32 | The real total, next to the app's | **It was ~120 out.** |
| 32–40 | Type one sentence — "there was more rice than that" — number moves | **Fixing it took four words.** |

**Why it works.** It concedes the thing the audience already suspects, then
shows the repair, which is the actual product. It is also the only version of
this format that cannot be accused of being staged, because staging it would
mean staging a failure.

**If the app lands within ~30 kcal:** publish that instead and change the last
caption to "it did not need fixing this time." Do not re-shoot until it misses.
A test you re-run until it passes is an ad.

---

## 3. Log a day in 40 seconds, one thumb — 30s

The `--raw` corpus says the real register: median 8 words, 47% carry a number,
23% contain a comma. So log the way people actually type, not in clean phrases.

| t | On screen | Caption |
|---|---|---|
| 0–3 | Empty day, the ring at zero | **A whole day, one thumb.** |
| 3–20 | Four entries typed at real speed. Compound and messy — "toast, two eggs, black coffee and half a banana". Include one correction and one "yesterday". | *(timer running in the corner)* |
| 20–26 | The ring filling, macros resolving | |
| 26–30 | Final total, timer stops | **No search box. No forms.** |

**Why it works.** It is the only one of the four that shows *volume* — the
thing a viewer has to believe before they will switch trackers is that this is
faster across a whole day, not on one lucky sentence.

**Do not** clean up the typing. A typo that still parses is worth more than a
perfect sentence.

---

## 4. "I forgot to log Sunday" — 20s

Backdating, which nothing in the copy or the store listing mentions.
Source: `tools.ts:148`, `prompt.ts:157`.

| t | On screen | Caption |
|---|---|---|
| 0–4 | Calendar view, Sunday empty, today is Wednesday | **I forgot to log Sunday.** |
| 4–10 | Type "Sunday dinner was chicken and rice, about 300g" | |
| 10–16 | Cut to the calendar — it lands on Sunday, not today | **It went to Sunday.** |
| 16–20 | Sunday's ring now filled | **Not today. Sunday.** |

**Why it works.** Small, specific, immediately understood, and it answers the
objection that kills trackers — you will fall behind and then give up. Twenty
seconds, one take, no scale, no styling.

---

## What these deliberately are not

No generated food, per §0. No competitor named, per §5. No weight-loss result,
because the weight data on the account is seeded. No user count and no download
number: the app is pre-release with one real logger.

## Order to shoot

4, 1, 3, 2. Number 4 is twenty seconds and one take — shoot it first to find
out how much of this is actually work. Number 2 needs a scale and a willingness
to publish a miss, so it goes last, when the first three have told you whether
any of this is worth the evening.
