# Guest accounts: use the app first, save the account later

Status: **shipped** in 1.3.0. Written as a proposal on 2026-09-15; steps 1-3 of the
order of work below are live, and the numbers in it have moved since — the guest
grant is **3 messages + 1 photo** (`GUEST` in `@ct/shared`, cut from 5 then 4
because nobody was reaching the end of it) and the trial is **3 days, 9 messages**
(`TRIAL`, cut from a week). Since 2026-09-22 those are **meals logged, not
sentences sent**: a turn that writes nothing into the journal — a greeting, a
question, a photograph with no food in it — is recorded in the cost ledger and
counted by no meter. The free ones are **earned, not granted** (`FREE_TURNS`):
two to begin with, and one more for each turn that actually logged something, so
a guest who never logs gets two answers and then pays a unit per message like
before. The guest who prompted it spent a third of their three on "Здрасти" and
met the wall a meal early; `063_ai_usage_metered.sql` has that walk in full. The merge the table below calls v2 is live too
(`services/guest-merge.ts`); **Sign in with Apple — step 4, and the 4.8 fix —
is the one thing here still not built.**
Read the ladder and the risks as current; read the counts here as the argument
that produced them, not as what is deployed.

## Why

Two days of paid Bulgarian installs (about 22) made **zero accounts**. The server
logs show the shape of it: each phone opened the app, sometimes stayed minutes,
and never once tried to sign up — no email submitted, no Google tap. Since 1.2.0
the walk ends on "Save my plan", which is a sign-up form, and that form is the
wall. 1.2.1 makes the form clearer and counts the funnel, but it is still a wall
in front of the first meal.

Outside evidence says the order is the problem, not the form:

- Duolingo moved sign-up to after the first lesson and next-day retention rose
  about 20%. Their principle: momentum first, then the ask.
- Lazy registration generally: asking before value loses a large share of
  people, and the people who register after seeing value are the ones who stay.
- **Apple 5.1.1(v)**: "If your app doesn't include significant account-based
  features, let people use it without a login." Logging a meal is not an
  account-based feature. The current iOS flow is exposed to this.
- **Apple 4.8**: an app that offers Google sign-in for the primary account must
  also offer an equivalent privacy-focused login (Sign in with Apple). We offer
  Google on iOS with no Apple option today. Separate risk, same fix window.

## The idea in one paragraph

On first launch the phone quietly gets a **guest account**: a real user row with
no email and a token in the keystore. The walk ends in the app, not on a form:
"Start my day" takes you to Today with your plan. You log meals exactly like
everyone else. The account is **saved** — email, Google or Apple attached to the
same row, nothing moved or lost — when it is worth something to you: after your
first meal, when your guest logs run out, before you pay, or when you want a
feature that genuinely needs an address.

## When to ask — the ladder

Soft asks can be dismissed. Hard asks block one action, never the whole app.
Manual and barcode logging are never behind an ask.

| # | Moment | Kind | What it says | Why here |
|---|---|---|---|---|
| 1 | The walk ends | **none** | "Start my day" | The plan is the promise; the first log is the proof. Don't put a form between them. |
| 2 | First AI log succeeds | soft, inline card under the reply in the journal | "That's your first meal. Save your journal so it's not lost if you change phones." · Google / Apple / email · Later | Peak "this works" moment, and they've just invested something. Inline, not a modal, and not over any text. |
| 3 | Day 2 open, or 3 meals logged | soft, a chunk at the top of Today (dismiss = hide 3 days) | "1 day logged · save it" | Loss aversion grows with every day of data. |
| 4 | Guest AI allowance used up | **hard for AI only** (402 `GUEST_LIMIT` sheet) | "You've used your 5 guest logs. Save your account — it's free — and get 10 a month." Typing still works via manual/barcode. | Turns the account into a reward, not a tax. This is the main conversion lever. |
| 5 | Tapping any purchase | **hard** | "Save your account first, so your subscription follows you to a new phone." Then straight into the purchase. | Buying is account-based by nature; it also avoids RevenueCat transfer/restore mess (see Risks). They're maximally motivated here. |
| 6 | Account-only features | **hard, per feature** | Weekly review email, data export, coach sharing, second device, password reset | These need an address or an identity that outlives the phone. |
| 7 | Sign out / erase | warning | "You're a guest. Signing out erases this journal on this phone." | Honesty; the one moment data is truly at risk. |

Rule of thumb: **ask when the account protects something they already have or
unlocks something they already want.** Never ask "because we need your email".

### Guest allowance

- Guest: **5 AI text logs + 1 photo scan, total** (not per month).
- Saved free account: today's free tier, **10 AI logs a month** + the 1 photo ever.
- Worst-case cost of one guest: 5 × $0.041 + $0.151 ≈ **$0.36**, against a
  current cost per install of roughly €0.35. Acceptable, and capped (below).

### Which save options, in order

- iOS: **Sign in with Apple** first (fixes 4.8, one tap, best conversion on iOS), then Google, then email.
- Android: **Google** first, then email.
- Email + password: the app keeps working while the address is unconfirmed; a
  banner asks for the code. Confirmation only gates password reset and emails.
  (Today an unconfirmed account is locked out of everything — that's a second wall.)

## What changes, by layer

### Server (M)

- Migration `056_guest_accounts.sql`: `users.guest_since timestamptz`, index for cleanup; mark the legacy credential-less row as not a guest.
- `POST /auth/guest` (app clients only, per-IP limit ~5/hour): creates the row, returns a session.
- Session gate (`app.ts` verification gate, ~254-259): let guests and unconfirmed claimed accounts through; keep the 403 for anything that needs a confirmed address.
- Metering (`plans.ts`, `usage.ts`): a `guest` allowance, and a **global daily guest AI spend cap** (e.g. $5/day summed from `ai_usage`). Both answer 402 with `code: GUEST_LIMIT`.
- `createAccount` (`user.ts` ~161-179) must never adopt a guest row — today the first email sign-up on a database with no email accounts takes the oldest email-less row.
- Guest sessions extend on use (today sessions expire after 60 days regardless).
- Guests can delete their account (today deletion refuses email-less rows, `routes/index.ts` ~1413).
- Scheduler: delete guest rows idle 90+ days with no purchase.
- Admin/funnel: count guests separately from accounts.

### Saving the account (M/L)

- **Email**: `POST /auth/claim` sets the address on the *same row* and sends the code. Row id is unchanged, so RevenueCat, entries, photos and caches all carry over for free.
- **Google / Apple**: an authenticated start URL carries the guest id in the signed state; the callback links the identity to that row instead of creating a new one (`identities.ts` ~98-114).
- **The address already has an account**: offer "Sign in to that account instead". v1: warn that this phone's guest journal (N meals) will be discarded, then switch. v2: merge food/weight/exercise entries into the existing account.

### App (M)

- `lib/auth.tsx`: no token → create a guest session silently (before anything else can fire).
- `app/_layout.tsx` gate: guests go to the tabs after the walk; `welcome`/`login` only for "I already have an account".
- Onboarding plan screen: "Save my plan" → "Start my day"; the draft uploads to the guest row (the upload path already exists in `lib/onboarding.tsx`).
- New `SaveAccountSheet` used by prompts 2-7; `GUEST_LIMIT` handler opens it.
- You tab: guest header with "Save your account"; sign-out becomes "Erase guest journal" with the warning.
- Funnel steps: add `guest_started`, `first_log`, `save_prompt_shown:<trigger>`, `account_saved:<trigger>` so each rung of the ladder is measured.

### Tests

New `test/guest.test.ts` (create, limits, global cap, claim by email/Google, claim collision, delete, idle cleanup). Update verification-gate, user, auth-routes, auth-google, billing (transfer), routes (delete), scheduler, funnel.

## Risks and how each is handled

| Risk | Mitigation |
|---|---|
| Cost abuse (reinstall = new guest = new allowance) | Small guest allowance + global daily guest cap + per-IP creation limit. Later: Play Integrity / App Attest on `/auth/guest`. |
| Guest loses the phone or uninstalls | That is exactly what prompts 2-3 say. iOS keychain usually survives reinstall; Android does not. |
| Someone claims an address they don't own | Unconfirmed claims can be taken over by the real owner through the code (same rule Google sign-in already applies to unverified accounts); unconfirmed claims expire after 7 days. |
| RevenueCat transfers once guest ids are real UUIDs | Purchases require a saved account (prompt 5), so a guest never owns a subscription. |
| Offline first launch (no token yet) | Retry guest creation on connectivity; the walk itself is offline already; logging waits for the token. |
| Merge when signing into an existing account | v1 discard-with-warning, v2 merge. |

## How we'll know it worked

With 1.2.1's funnel live first, then per release:

- installs → reached Today (target: most of those who finish the walk)
- reached Today → first log
- first log → account saved, **split by which prompt did it**
- day-1 and day-7 return, guests vs saved accounts
- guest AI spend per day vs the cap

## Order of work

0. **Ship 1.2.1** (sign-up fixes + funnel) and read a few days of the Funnel tab.
1. Server guest rows, limits, cap, delete, cleanup. (M)
2. Claim by email and Google on the same row; collision handling v1. (M/L)
3. App: silent guest session, gate, "Start my day", save sheet and prompts 2-7. (M)
4. iOS: Sign in with Apple as a save option. (S/M, native rebuild)
5. Later: merge v2, device attestation.

Roughly 3-4 focused days for 1-3, plus a store release on each platform.

## Decisions for the owner

1. Guest allowance: 5 AI logs + 1 photo total? (cheaper: 3 + 0)
2. Purchases require a saved account? (recommended yes)
3. Let unconfirmed email accounts use the app? (recommended yes, banner instead of lock)
4. Add Sign in with Apple in the same release? (recommended yes — also fixes 4.8)
5. Idle guest cleanup after 90 days?
