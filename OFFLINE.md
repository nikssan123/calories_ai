# Logging without a network

`COMPETITION.md` calls offline logging a blocker and says the reason is
architectural: our log path requires a model round trip, theirs write to a local
database. That is true and it is not the whole problem. The phone has no local
database *of any kind*. `apps/mobile/lib/` persists exactly two things — the
session token in SecureStore and the theme in AsyncStorage. Every screen is
fetch-on-mount, and Today's fetch ends in `.catch(() => {})`. On a plane the app
does not degrade; it shows an empty day and a ring at zero, which is worse than
useless because it is a lie about what you ate.

So there are two gaps, not one, and the feature gap is the smaller of them:

1. **You cannot type a meal in.** There is no create-a-food-entry route at all.
   `createFoodEntry` exists in `services/log.ts` and every caller is server-side
   — the model's tools, barcode, repeat, library cook, recipes, the seed script.
   The client can only PATCH, GET and DELETE an entry that already exists.
2. **There is nowhere to put it and no way to send it later.** No cache, no
   queue, no rollup. Adding the endpoint alone buys an offline form that throws.

What follows closes both. The order is the build order, and each section is
finishable on its own — after §1 the web gets manual entry, after §3 the phone
survives a tunnel read-only, and only §4 makes it writable.

**All of it is built.** Two things turned out differently from the plan and are
noted where they happened: the idempotency key needed a table rather than a
column (§1), and the merge arithmetic ended up in `@ct/shared` rather than on
the phone, so it could be tested at all (§4).

**And none of it could be reached**, which §8 is about and which none of the
sections below saw coming: a launch with no network showed the sign-in screen,
so the cache, the outbox and the catalogue were all behind a door that needs a
server to open. Written last because it was found last — by opening the app in
a tunnel rather than by losing signal inside it.

**Not in scope, deliberately.** Photos, chat turns, barcode lookup, recipe
generation and the weekly review stay online. Every one of them needs a server
that is thinking or a catalogue that is remote, and pretending otherwise would
mean queueing a request whose answer the user is standing there waiting for.
Offline means *logging*, and logging is the thing people do in the basement gym.

---

## 1. The endpoint that does not exist — built

`POST /entries/food`. Body is meal, `eaten_at`, description, an optional note
and the item list — the same `itemShape` the model's tools and the kitchen
already share, so a manually typed item and an estimated one are the same row
with a different `source`.

`source: 'manual'` is already in `ENTRY_SOURCES` and has been since `001_init`.
Nothing has ever written it. `'quick'` is likewise declared and only produced by
repeat. The enum was designed for this and then the door was never cut.

### The part that matters: `client_id`

A queue whose whole job is to resend after a failure *will* resend a request the
server already handled — the reply was lost on the way back, which on a phone is
the common case rather than the exotic one. Without a key the retry double-logs
breakfast, and double-logging is exactly the failure the turn reconciler was
built to prevent. Getting this wrong makes offline logging worse than no offline
logging, because a missing meal is visible and a duplicated one is not.

**Built, and not as planned.** This was going to be a nullable `client_id`
column on `food_entries` with a partial unique index. It was written that way,
and the test that killed it is `refuses to resurrect a meal the user deleted
while the retry was in flight`: a column dies with its row, so deleting the meal
frees the key and the queued retry writes it straight back.

That is not a hypothetical. The reply being lost is *precisely* the case where
the entry did land — so the user sees it on the next refresh, decides it was
wrong, deletes it, and watches it return. One user, one device, no race.

So `033_food_entry_client_id.sql` creates `food_entry_client_keys` instead:
`(user_id, client_id)` as the primary key and an `entry_id` that goes NULL when
the entry is deleted. The key outlives what it bought, which is the difference
between "log this once" and "log this at most once, ever". A spent key whose
entry is gone answers 409 — a refusal the client should stop retrying, not a
5xx it backs off from forever.

The key is claimed *before* the entry is written, which is also what makes two
simultaneous sends safe: `ON CONFLICT DO NOTHING` against an uncommitted row
waits on the other transaction's speculative insertion, so the loser reads a
committed `entry_id` rather than racing it.

The id is client-generated so it exists before the request does. That is the
whole trick: the phone knows the entry's identity while it is still in the
outbox, which is what lets an unsent entry be shown, counted and deleted.

Repeat gets the same treatment — `POST /entries/food/:id/repeat` takes an
optional `client_id` and honours it identically, because repeating yesterday's
lunch is the offline path people will actually use and it deserves the same
protection.

## 2. A day the phone can add up itself — built

`buildDaySummary` sums entries into `consumed`, calls `dayQuality` over the
items, and attaches targets. All of it is arithmetic over rows the phone will
already be holding, but it lives in `apps/api` where the phone cannot reach it.

Move the pure half into `@ct/shared/day.ts`:

- `sumNutrition(entries)` — the reduce currently inline in `buildDaySummary`.
- `dayQuality(items, targetKcal)` — moved verbatim from `services/summary.ts`.
- `qualityTargetsFor(kcal)` — moved from `services/targets.ts`.
- `rollUpDay({ localDate, foodEntries, exerciseEntries, targets, weight })` —
  assembles a whole `DaySummary` from parts.

`buildDaySummary` then fetches and calls `rollUpDay`. No behaviour change, and
`summary.test.ts` is the proof — it passed untouched.

`localDateFor` and `inferMeal` move to `@ct/shared/day.ts` too, out of
`apps/api/src/time.ts`. Both are `Intl`-only and Hermes has full ICU, so they
run on the phone unchanged. The phone needs them to answer "which day does a
09:00 breakfast belong to when your day starts at 04:00" without asking.

One shared implementation rather than two, because the alternative is a ring
that disagrees with itself the moment the network comes back — and a user who
watched their calories change on sync will not trust either number again.

## 3. The cache — built

`lib/store.ts`, on AsyncStorage. Namespaced per user id so signing out and in as
someone else cannot show the previous account's food.

Three things are cached, and nothing else:

- the last `DaySummary` fetched for each of the last ~7 local dates,
- the meal templates from `GET /history/meals`,
- the profile, for `timezone` and `day_start_hour`.

**AsyncStorage rather than SQLite**, and it is not a close call. The working set
is one day of entries and eight templates — kilobytes. `expo-sqlite` is a native
module, which means a rebuild, a new binary through review, and a schema to
migrate on a device we cannot inspect. Read-modify-write of a JSON blob is
enough for this shape of data and can be replaced later without the UI noticing.

**The catalogue is what already exists.** `GET /history/meals` returns the eight
things you actually eat, with items and macros, and `RepeatMeals` already
renders them at the foot of Today. Cached, that card works in a tunnel, and most
offline logging becomes "yesterday's lunch, again" rather than typing four
macros per item. Manual entry is the fallback; repeat is the path.

## 4. The outbox — built

`lib/outbox.ts`. A persisted array of intents — not entries — each carrying its
own `client_id`, the kind, the payload and an attempt count.

Four kinds: `create`, `repeat`, `delete`, `patch`. That is the whole mutation
surface Today can reach offline.

**Flushing.** On app foreground (`AppState`), after any successful request, and
on a capped backoff while anything is pending. Serially, oldest first, because
a delete that overtakes the create it refers to is a queue that corrupts its own
history.

**No NetInfo.** `@react-native-community/netinfo` and `expo-network` are both
native modules, and both would be added to learn something a failed `fetch`
already tells us. `ApiError` carries a status; a transport failure throws
without one. That distinction is the entire connectivity check we need:

- **No status** — the request never reached the API. Requeue, back off, keep it.
- **5xx or 429** — it reached a server that could not answer. Requeue.
- **4xx** — the server understood and refused. It will refuse the retry too.
  Drop the intent and tell the user, because a queue that retries a 400 forever
  is a queue that never drains.

**Optimistic reads.** The screen merges the cached summary with the pending
intents and re-runs `rollUpDay`, so a queued meal moves the ring the instant it
is typed. A pending entry is drawn from its `client_id`, so deleting one before
it has ever been sent is a queue removal rather than a request.

**Built, and the arithmetic did not stay here.** Folding pending changes into a
day was going to live in `apps/mobile/lib/day.ts`. It is in
`@ct/shared/pending.ts` instead, as `foldPending` and `pendingEntry`, for a
reason that only became obvious when it came time to check it: the phone has no
test runner, and these are the numbers on the ring. In shared it is covered by
`apps/api/test/pending.test.ts` — 21 cases, including the one that matters
most, that an optimistic day and the day the server returns after it syncs are
the same day.

What stayed on the phone is the part that genuinely belongs to a device:
translating intents into pending meals, deciding which day "today" is by this
clock, and choosing the cache when the network cannot answer.

Everything is **re-added up rather than adjusted in place**, which is what fixed
a limitation Today used to carry in a comment: it subtracted a deleted meal's
calories from the totals but left `quality` alone, because coverage is a share
of the day's calories rather than a sum an entry can be taken out of. Re-running
`rollUpDay` over the remaining entries costs nothing and gets coverage right.

**Rejections are reported.** A 4xx drops the intent — it will never succeed —
but silently is how somebody's dinner disappears between looking at it and
looking again, so `onRejected` tells the screen and the screen says so.

## 5. Typing a meal in — built

`FoodEditor` is already the form: description, meal chips, item rows with name,
quantity, kcal and three macros, a live total on the button. It is 417 lines
that only exist to correct an entry that already exists — it fetches by id in a
`useEffect` and PATCHes on save.

Give it a create mode. `entryId: string | null`; null means start from one blank
item and POST instead. Both doors then lead to the same form, which is the point
— correcting a meal and entering one are the same act with a different starting
state.

Reached from Today, *below* `RepeatMeals` rather than above it. That order is
the whole argument of this work: repeating something you already eat is one tap,
and typing four macros per item is the fallback for a genuinely new meal.
Putting the form first would make the expensive path look like the intended one.

## 6. Telling the truth about being offline — built

An offline app that says nothing is indistinguishable from a broken one. Today
grows a quiet line when the outbox is non-empty — "2 meals waiting to sync" —
and pending entries are drawn at reduced opacity. Not a banner and not a modal:
the day is still usable and the numbers are still right, so this is a footnote,
not an error.

## 7. The web — built

Web gets `POST /entries/food` and a manual entry form in `Journal`, because the
endpoint is there and typing numbers is useful with a network too. It does not
get an outbox or a service worker. A desktop browser that loses connectivity is
a different problem with a different answer, and shipping half of it here would
mean two cache implementations to keep honest.

---

## 8. The cold start that had none of it — fixed

Everything above is reachable only once the app is past its own front door, and
until this it was not.

`AuthProvider.refresh` has always treated an unreachable server as signed out —
deliberately, because that is the screen with a way forward — and kept the token
so that "a signal that comes back finds the session still there". The token was
the only thing it kept. Nothing read it.

So a launch with no network resolved to `SIGNED_OUT`, `app/_layout.tsx` drew the
sign-in screen, and every one of §3–§6 sat behind a login that cannot be
completed without a network. The cache had the day in it. The outbox had the
meals in it. Neither was reachable, and neither was the tab that draws them. An
app whose listing promises *logging with no signal at all* spent its first cold
start in a basement asking for an account.

Resuming had been fixed and launching had not, which is why it survived: the
foreground listener re-asks while signed out, so anyone who lost signal *inside*
the app kept their session and got it back. It is only the launch — phone
restarted, app swiped away, the tunnel entered before the tap rather than after
it — that had nothing to fall back on.

### The fourth cached thing

`lib/store.ts` keeps a day, the templates and the profile, and all three are
keyed by user id. What was missing is the thing that answers *which user*, which
by definition cannot be keyed by the answer: the last `AuthStatus` the server
gave us, under one key that is not namespaced.

Three rules keep it from being a way to fake a session:

- **Restored only beside a token.** The keystore still holds the real one, and a
  cached status with nothing behind it is a picture of a session rather than a
  session. Sign-out destroys both, and destroys this one first.
- **Never a signed-out status.** Being signed out is a fact the phone can reach
  on its own, and restoring one would be indistinguishable from an empty cache.
  `refresh` erases the copy the moment the server says `authenticated: false`.
- **Marked stale, and re-asked on the next foreground.** The restored status is
  a copy; the server has the original. The listener that used to run only while
  signed out now runs here too, so the first moment of signal replaces the guess
  with an answer — including the case where the session really was revoked.

Nothing is granted by any of it. Every request still carries the token and the
API still decides; what the restored status buys is the *screen*, and the
screen is where the cache and the outbox live.

### And the sentence in the wrong language entirely

The other half of the report, and the half that was on screen the whole time:
*a bunch of java errors are shown*.

Every screen in the app rendered `(e as Error).message` — fifty call sites —
on the assumption that the thing it caught had been written by a person. Two of
the three kinds are. The third is the platform, and on Android with no route to
the API the platform says:

    fetch failed: java.net.ConnectException: Failed to connect to /10.0.2.2:4000

In red, under the password field. And on Today, Progress, Cook, Exercise,
History, the plan screen and the barcode scanner, each in its own words, all of
them a Java exception class. An app that sells logging with no signal cannot
answer a tunnel by naming a Java class, because that is indistinguishable from
being broken — which is exactly how it was reported.

The fix is one distinction made once. `@ct/api-client` now throws a
`NetworkError` when `fetch` itself rejects, so the transport failure has a name
rather than being whatever the runtime felt like saying, and
`apps/mobile/lib/errors.ts` turns the three kinds into the three answers:

- **`NetworkError`** — "You're offline. This will work again when you have
  signal." Translated, in all five languages, like everything else on screen.
- **`ApiError`** — the server's own sentence, untouched. It was written for a
  reader and nothing here improves on it.
- **anything else** — one generic sentence. A bug, a native module, a parse:
  nothing a reader can act on, and the raw text is a leak. `AppError` is the
  opt-out for the app's own deliberate refusals, which read like an `ApiError`
  and are passed through like one.

Every call site was changed, not just the sign-in screen. The offline case is
the one that is *supposed* to happen here, so it is the one the app should be
best at explaining, and there is no screen where it does not arise.

### And the import that took the screen down anyway

Found in the same session and worth recording beside it, because the symptom is
identical from the outside — the app opens and there is no app.

`lib/review-prompt.ts` imported `expo-store-review` at the top of the file.
That package resolves its native module at module scope, so on any runtime that
does not carry the native side the import throws while the module is being
*evaluated*. Today imports it; expo-router then reports `(tabs)/today.tsx` as
"missing the required default export" and draws nothing at all. On screen it is
`Cannot find native module 'ExpoStoreReview'` where the food diary should be.

`maybeAskForReview` already caught "the module missing on this platform". The
catch was one level too late to ever run.

It is required on first use now, exactly as `lib/billing.ts` has done since a
store binding took the app down the first time — and asked for before it is
required, with `requireOptionalNativeModule('ExpoStoreReview')`, which answers
`null` instead of throwing. Catching the throw was enough to make the app work;
it was not enough to keep it off the screen, because a caught
`requireNativeModule` failure still reaches LogBox in development and paints
the same red rectangle over the top of a running app. A question with an answer
beats a question with an exception.

A runtime without the module gets no rating prompt, which is the correct amount
of degradation for a rating prompt.
