# Coach

Written 2026-09-07. Companion to `SUBSCRIPTIONS.md`, whose ladder this sells a
seat of, and to `FRIENDS.md`, whose one rule this deliberately crosses (§3).
Mockup of the dashboard: the "Day So Far Coach" artifact from the session that
wrote this.

**The short version.** Same API, same phone app, one new web surface. A coach
signs in on daysofar.com, sends a code, and the client accepts it inside the app
they already have. From then on the coach sees that client's meals, photos,
totals, weight and targets, can comment into the journal and set targets, and
gets a Monday email that says who logged, who did not, and whose protein
slipped. The coach pays on the web, per seat. The client pays nothing; a seat
carries Plus allowances.

**Not a second app.** Coaches work on laptops, so the dashboard is a desktop
workflow. Web billing has no store cut. The phone app stays one binary to
review and ship, and gets three small additions (§7).

---

## 1. Who it is for, and the promise

Online nutrition and fitness coaches with 5 to 50 clients, whose clients today
screenshot MyFitnessPal into WhatsApp.

The promise, in the words of the pitch: *your clients stop screenshotting, and
every Monday you get an email telling you who logged, who did not, and whose
protein slipped.* Everything in this document exists to keep that sentence true.

## 2. What it is not

No programme builder, no check-in forms, no coach–client chat, no payments
between coach and client. Trainerize, Everfit and TrueCoach own those and do
food logging badly; that is the wedge, and adding their features dilutes it.
See `COMPETITION.md` for the wider argument against building the category.

## 3. Consent, and the `FRIENDS.md` rule

`FRIENDS.md` §1: *nothing that crosses between two accounts may be a quantity of
food, a body weight, or anything derived from either*, because an audience
distorts logging. That rule stands for friends. A coach is the one audience a
person hires precisely to see the number, so the coach link is a separate,
explicit grant rather than an exception to the friends graph:

- **Client-initiated acceptance.** The coach can only send a code. The accept
  screen lists what will and will not be shared before the button. 18+ only.
- **Scope.** On by default: meals and their photos, daily totals, weight,
  targets, days logged. Off by default, one toggle: steps, sleep and heart data
  from `daily_metrics`. Never: the `chat_messages` transcript, `agent_notes`,
  email address, billing.
- **Revocable from Settings, instantly.** Coach comments already in the journal
  stay; they are the client's data. The coach's private notes stay with the
  coach.
- **One active coach per client** in v1. A partial unique index enforces it.
- **The distortion that remains** is a client under-logging to look good for
  the coach. Mitigation, carried from `STREAKS.md`: the roster's first sort key
  is days logged, the flags are about showing up before they are about the
  number, and the digest never ranks clients by calories or deficit.

## 4. Data model

One migration, `apps/api/migrations/045_coach.sql`. Raw SQL like the rest.

```sql
CREATE TABLE coach_accounts (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name  TEXT,
  plan           TEXT NOT NULL DEFAULT 'trial'
                 CHECK (plan IN ('trial','starter','pro','studio','lapsed')),
  seat_limit     INT  NOT NULL DEFAULT 10,
  trial_ends_at  TIMESTAMPTZ,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coach_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  UUID NOT NULL REFERENCES coach_accounts(user_id) ON DELETE CASCADE,
  code           TEXT NOT NULL UNIQUE,          -- 8 chars, no ambiguous glyphs
  email          TEXT,                          -- optional, for the emailed link
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  accepted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at    TIMESTAMPTZ
);

CREATE TABLE coach_clients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  UUID NOT NULL REFERENCES coach_accounts(user_id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('active','revoked')),
  scope          JSONB NOT NULL DEFAULT '{"meals":true,"weight":true,"metrics":false}',
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ,
  revoked_by     TEXT CHECK (revoked_by IN ('client','coach')),
  UNIQUE (coach_user_id, client_user_id)
);
CREATE UNIQUE INDEX coach_clients_one_active
  ON coach_clients (client_user_id) WHERE status = 'active';

CREATE TABLE coach_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date     DATE NOT NULL,
  food_entry_id  UUID REFERENCES food_entries(id) ON DELETE SET NULL,
  body           TEXT NOT NULL,
  message_id     UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ
);

CREATE TABLE coach_notes (                       -- private to the coach
  coach_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body           TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_user_id, client_user_id)
);

CREATE TABLE coach_digests (
  coach_user_id  UUID NOT NULL REFERENCES coach_accounts(user_id) ON DELETE CASCADE,
  week_start     DATE NOT NULL,
  stats          JSONB NOT NULL,
  sent_at        TIMESTAMPTZ,
  PRIMARY KEY (coach_user_id, week_start)
);

-- Existing tables, widened.
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_role_check;
ALTER TABLE chat_messages ADD  CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user','assistant','coach'));
-- targets.source gains 'coach'; users.plan_source gains 'coach_seat'.
```

Why a comment is *also* a `chat_messages` row: the journal is the one screen the
client already opens, and `weekly_reviews` and `nudges` already land there the
same way (`scheduler.ts` publishes both as assistant messages). A third role
renders as a distinct bubble with the coach's initials; nothing else in the
journal changes.

## 5. API

`apps/api/src/routes/coach.ts`, prefix `/coach`, gated the way `admin.ts` gates
its prefix: one `onRequest` hook, `requireCoach`, that loads the
`coach_accounts` row and answers **404** to anyone without one, so the surface
does not exist for people it is not for.

Every per-client read goes through one function:

```ts
requireClientLink(coachId, clientId): Promise<Scope>   // 404 if not active
```

and the handlers below are thin wrappers over services that already exist,
called with the client's `user_id` instead of the session's. That is the same
shape as `/admin/users/:id/review` and `/admin/users/:id/adaptive`, the two
cross-account writes the codebase already has.

| Route | Does | Reuses |
|---|---|---|
| `POST /coach/account` | become a coach; trial, 10 seats | — |
| `GET /coach/roster` | one row per active client: 7-day logged mask, avg kcal and protein vs target, 28-day weight delta, flags, last log time | `dailyTotals` in `services/summary.ts`; the flag SQL in `services/nudges.ts` (`dormant`, `stalled`, `protein_short`) |
| `GET /coach/clients/:id/week?start=` | seven `DaySummary`s with entries, items, presigned photo URLs | `buildDaySummary`, photos route |
| `GET /coach/clients/:id/weight` | series | `weight_entries` |
| `GET` / `PUT /coach/clients/:id/targets` | read; write with `source='coach'` | the adaptive write path |
| `POST /coach/clients/:id/comments` | `coach_comments` + `chat_messages(role='coach')` + push | `push_tokens`, the nudge push helper |
| `GET` / `PUT /coach/clients/:id/notes` | private notes | — |
| `POST` / `GET` / `DELETE /coach/invites` | codes and emailed links | `email/` |
| `DELETE /coach/clients/:id` | revoke from the coach side | — |
| `GET /coach/digest/preview` | this Monday's digest, rendered | §8 |

Client side, under the ordinary session, in `routes/index.ts`:

| Route | Does |
|---|---|
| `GET /me/coach` | link status, coach display name, scope |
| `POST /me/coach/accept {code}` | validates the invite, creates the `coach_clients` row, takes a seat if one is free, sets `plan_source='coach_seat'` |
| `PATCH /me/coach/scope` | toggles |
| `DELETE /me/coach` | revoke; clears the seat and the plan source |

**How a coach gets in.** The API refuses a browser session to anyone who is
not an admin — `routes/auth.ts:354`, and `AuthGate.tsx:41` explains why the
journal left the web. Two changes open a second door without reopening the
first:

1. `POST /coach/signup` and a `intent=coach` flag on web login and on the
   Google handshake (carried in the `ct_oauth` state cookie beside the
   timezone). Either path creates the `users` row if needed **and** the
   `coach_accounts` row in one transaction, then sets the ordinary
   `ct_session` cookie. The login check becomes *app client, or admin, or has
   a coach row*. Email verification stays enforced the way it is for everyone.
2. `AuthGate` learns `isCoach` from `/auth/status` and sends coaches to
   `/coach`. The legacy journal routes stay admin-only; a coach who types
   `/today` gets the landing page.

An existing app user who coaches signs in on the web with the same account
and clicks *I'm a coach*; that is the flag, and the trial starts. Same origin,
`daysofar.com/coach`, so the Next proxy forwards the cookie unchanged. A coach
never needs the phone app.

## 6. The dashboard

`apps/web/app/coach/*`, copied from the admin shell (`app/admin/page.tsx`,
`components/admin/*`) and restyled with the tokens in `globals.css`. Nunito and
Baloo 2, the macro hues for P/C/F, the nudge kinds as flag colours.

**Roster** (`/coach`) — the Monday screen. One line of summary, then one row
per client, sorted by attention:

- Client, goal.
- Last week as seven dots, Monday to Sunday: filled for a logged day.
- Days logged, `n/7`.
- Protein average against target, calories average against target, each with
  a small bar.
- Weight change over four weeks.
- Flags as pills: *No log 2 days* (critical), *Protein short*, *Weight stalled
  3 wks* (warning), *Joined Thu* (info). Same signals the nudge pass computes.
- Last log, as a time.

**Client** (`/coach/clients/[id]`) — a two-column page.

- Left: the week as seven stacked bars (protein, carbs, fat in their hues)
  against a target line; below it, one day's timeline: meal photos, name,
  time, kcal and protein, and how it was logged (photo, barcode, typed).
- Right: weight sparkline over eight weeks; the targets editor, which saves as
  *set by your coach*; the comment composer, which lands in the journal with a
  push; private notes.

**Monday digest** (`/coach/digest`) — this week's email as it will be sent,
and the history.

**Invites** (`/coach/invites`) — codes, emailed links, pending, seats used.

**Settings** (`/coach/settings`) — business name, seat plan, Stripe portal.

## 7. Phone changes

Three, all small, all in `apps/mobile`:

1. **Accept screen.** Reached by deep link (`daysofar.com/c/CODE`) or by typing
   the code under Settings. Shows the coach's name and the scope list, then
   *Accept* / *Not now*, with the line "You can stop sharing any time from
   Settings."
2. **Shared-with banner** on Today, opening a sheet with the scope toggles and
   *Stop sharing*.
3. **Coach bubble** in the journal for `role='coach'`, and the push "Maria
   commented on Sunday". Targets set by the coach show a *Set by your coach*
   chip where targets are shown.

Later, not now: *Share with my coach* under Settings, which generates an invite
the client sends outward. That is the client-side acquisition loop; it needs
the coach product to exist first.

## 8. The Monday digest

A fourth pass in `scheduler.ts` beside review, nudge and alert: `DIGEST_JOB`
advisory lock, runs in the hour that is 07:00 Monday in the coach's timezone,
idempotent on `coach_digests (coach_user_id, week_start)`.

**Numbers only, no model call.** The digest is the roster query rendered to
email: an *attention* list with one reason line each, then one line per other
client, then seats used and a link to the dashboard. `stats` is stored so the
history page and the preview render the same thing. Sent through the existing
email module the way `notify.ts` sends the weekly review.

## 9. Seats, billing, entitlement

**The coach pays on the web, per seat.** One Stripe product, one graduated
monthly price with the seat count as the quantity, and an annual twin at ten
months' price. Stripe's proration handles adding a seat mid-month; Stripe Tax
handles EU VAT and the reverse charge for a coach with a VAT id; EUR in the EU,
USD elsewhere. No store product exists, the phone app never mentions coach
pricing, and the only coach UI on the phone (accept, manage sharing) is free —
so the store steering rules do not apply.

| Seats | Per seat, monthly | Notes |
|---|---|---|
| 1 – 2 | free | *Solo*: clients sit on the free consumer tier |
| 3 – 10 | $6 | minimum charge is 3 seats, $18 |
| 11 – 30 | $5 | |
| 31 + | $4 | the best customers pay closest to cost, as with the bundles |

Annual: ten months for twelve. The price ladder mirrors `plans.ts`'s bundle
logic on purpose, and the margin after the photo lane (§10) is 40 to 60
percent on the paid rungs.

**What is free.**

- *Trial*: 14 days, 5 seats, **with** Plus allowances on every seat, no card.
  The pilot has to feel the photo logging or there is nothing to sell, but
  Plus is capped at 8 photos a month, so the worst case is $5.11 a seat and
  $26 a trial coach. Admins can extend `trial_ends_at` for hand-sold pilots.
  After 14 days: card, or the seats drop to free at the end of the day.
- *Solo, forever*: 1 seat, and the client on it gets the **free** consumer
  tier (one lifetime photo, ten chats a month, unlimited manual and barcode),
  which costs nothing to serve. The dashboard works fully; what a paid seat
  buys is the client's Plus. The rule in `plans.ts`: give away what is
  deterministic, meter what is inferential.
- *Referral*: one free month per referred coach who pays, on both sides.

Ceiling on trial spend, all pilots together: five coaches × $26 = $130 a
month, and less than half that at the usage actually measured.

**The webhook.** `POST /billing/stripe`, public prefix like `/billing/revenuecat`,
handled in `services/billing.ts` beside it: `checkout.session.completed`,
`customer.subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted`
→ `billing_events` row, then `coach_accounts.plan`, `seat_limit`,
`stripe_customer_id`, `stripe_subscription_id`. Seats change from the
dashboard's *Add seats* button, which calls Stripe to update the quantity, and
from the Customer Portal.

**What a seat grants the client.** An active link with a paid or trial seat
resolves the client to Plus allowances in `accountGate` / `limitsFor`:
`plan_source = 'coach_seat'` maps to the `plus` tier; a Solo seat maps to
`free`. If the client already pays for Plus or the consumer Coach tier, their
own plan wins and no seat is consumed. A seat is consumed by an *active* link
only; pending invites do not count. When seats are full, accepting a code
fails with a message on the phone and an email to the coach.

**When payment fails.** Stripe retries for a week. Then `plan = 'lapsed'`: the
dashboard goes read-only (roster and weeks visible, no comments or targets),
seats keep Plus for 14 more days, then drop to `free` at the end of a day,
never mid-meal. Nothing is deleted. Paying again restores everything.

**Naming.** `PLANS` keeps `'coach'` as the consumer top tier because the store
product ids reference it. The persona is `coach_accounts`, the route prefix is
`/coach`, and the product is called *Day So Far Coach* in copy. The consumer
tier's display name can move to *Kitchen* later; the enum does not move.

## 10. What a seat costs to serve

From `services/plans.ts`: a chat turn is $0.041, a photo scan $0.151 as it is
wrapped today, and a client at the Plus ceiling is $5.11 a month. A heavy one,
100 chats and 50 photos, is about $11.90. Twenty of those against a $59 plan
loses money, so two things are part of this build rather than after it:

1. **A photo-only lane.** `POST /entries/photo` calls `photo_log` (Sonnet,
   $0.012 per the measurements in `ai/client.ts`) and writes `food_entries`
   and `food_items` directly, without the agent turn and its 19.7k-token
   prefix. Target: a scan at or under $0.03. The seat allowance then reads 90
   chat turns, 30 photos, everything deterministic unlimited, and a typical
   client costs $2 to $3.
2. **The coach side costs nothing.** Roster, week, digest and comments are SQL
   and email. No `ai_usage` row is ever written for a coach action.

At $5 a seat that is a 50 percent margin on a typical client, which is where
the incumbents' $2 to $4 per client makes the pitch "the client's app is
included" hold up.

## 11. Rollout

The order is chosen so that nothing expensive is built before a coach has
said yes with money. Each step has a number that stops it. The week counts
are upper bounds: every read the dashboard needs is an existing service, the
admin shell is its skeleton, and the mockup already carries the UI, so each
phase should come in under its number.

**Phase 0, week 1, no code: the mockup test.** DM fifty coaches the mockup
with one question: *would you put five clients on this at $6 a seat?* A yes
has to come with the name of a client they would start with. Fewer than five
yeses, stop here; total spend is a week of evenings.

**Phase 0.5, weeks 2 to 4, four days of code: the concierge digest.** No
dashboard, no Stripe, no seats. One column links a client to a coach, the
roster query from §5 runs on Monday, the result goes to the coach as the
digest email. The clients' Plus is granted by hand from the admin panel.
Three Mondays. If coaches do not reply to the email or ask to see the photos,
stop; total spend is under $150 and three weeks. At week 4, a Stripe Payment
Link for $18 a month goes to every pilot coach: fewer than two payers, stop.

**Phase 1, weeks 5 to 7: read-only, paid from day one.** Migration, invites, links,
coach browser session, roster, client week, digest email. Five pilot coaches
on the free trial, ten clients each, found the way the previous session laid
out: Instagram DMs with a 20-second recording, Sofia gyms in person. Success
is three coaches opening the dashboard three Mondays running.

**Phase 2, weeks 4 and 5: the coach acts.** Comments to the journal with push,
targets by coach, the phone banner and scope sheet, the photo-only lane, seat
entitlement.

**Phase 3, weeks 6 to 8: it sells itself.** Stripe seats, emailed invite links
and the deep link, comparison pages against Trainerize and Everfit, the
certification-directory outreach, coach-refers-coach credit.

**Later, only if pilots ask:** coach-bought photo credits for a client
(`credits` gains `purchased_by`), more than one coach per client, a coach mode
inside the phone app as an `expo-router` group, check-in forms.

## 12. What is built (2026-09-07)

The ladder in §11 was written for a solo evening schedule. It was built in
one sitting instead, in six commits, each tested:

| Stage | Commit | What |
|---|---|---|
| 1 | `feat(coach): the seat, the link…` | migration 045, `services/coach.ts`, `/coach/*` and `/me/coach` routes, the web door, 34 tests |
| 2 | `feat(web): the coach's dashboard` | roster, client week, invites, settings, `/c/<code>`, coach sign-in in five languages |
| 3 | `feat(mobile): the client's side…` | accept screen at `/c/[code]`, Today banner, Coach section under Settings, the coach bubble, push channel |
| 4 | `feat(coach): the Monday digest` | scheduler pass, email, `/coach/digest`, the `notify_digest` switch; email redesigned on a `person` block |
| 5 | `feat(coach): seats on a card` | Stripe Checkout, Portal, signed webhook, 14-day grace, migration 047 |
| 6 | `feat(coach): the photo-only lane` | `POST /entries/photo`, the `photo` toolset, the phone routes a captionless photo through it |

Verified by hand: the roster, client week, invites, settings and digest pages
in Chrome against the seeded coach (`maria@example.com`, dev only); the
deep link, accept screen, banner, scope toggles, coach bubble and stop-sharing
on the iOS simulator.

**Still to do before a coach sees it in production:**

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SEAT_PRICE_ID` on the
  API. The sandbox (`acct_1UD3vZ2Hp2Pcfz1R`, test mode) is set up as of
  2026-09-07: product `prod_VDV2QNPhIurOXt` "Day So Far Coach seat" with the
  graduated EUR price `price_1UD42f2Hp2Pcfz1RZbP8fRjB` (€6 / €5 / €4 per seat
  per month at 1–10 / 11–30 / 31+), webhook `we_1UD47D2Hp2Pcfz1R2VfAwdLt`
  at `https://api.daysofar.com/billing/stripe` on the four checkout and
  subscription events (API version 2026-08-26.dahlia), and the default portal
  configuration allowing quantity changes (3–200) and cancel at period end.
  Live mode has the same three as of the same day: product
  `prod_VDVJq5AVlxLrLI`, price `price_1UD4J02Hp2Pcfz1RN4BcyfAn`, webhook
  `we_1UD4Ky2Hp2Pcfz1RXbQk11hk`, portal configuration
  `bpc_1UD4OU2Hp2Pcfz1RslF0CFjE`. The prod compose file forwards the three
  variables (pass-through, so absent stays absent). Stripe Tax is not
  enabled in the checkout call yet.
- A new store build for the `/c/*` app link (Android intent filter, iOS
  associated domain via the existing AASA route).
- Coach terms and a DPA at checkout (§13). The dashboard and the digest are
  English only; the phone side is in all five languages.
- The lapsed-grace copy on the roster and settings pages; the seat-full email
  to the coach when a client's accept is refused.

## 13. Open questions

- **Legal.** A coach reading health data makes the coach a controller and
  daysofar a processor for that slice. Needs coach terms and a DPA at Stripe
  checkout, consent as the GDPR basis, and the scope list kept honest.
- **Coaches will ask for programmes and forms** in the first week. The answer
  is §2, said kindly, and a note of who asked.
- **Price anchoring.** Every coach knows Trainerize is $2 a client. The reply
  is that their clients pay $20 a month for MyFitnessPal Premium on top of
  that, and here they do not.
- **Sofia first or English first?** Both are cheap; Sofia pilots give feedback
  in days in a language the app already speaks, English pilots prove the
  market. Do Sofia in week 1 and English from week 2.
