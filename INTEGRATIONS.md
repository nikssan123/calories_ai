# Connecting fitness trackers

Nothing here is built. This is the plan for pulling workouts, weight and activity in
from the devices people already wear, so the journal stops being the only way data
gets into the app.

It was written after checking what the providers' terms actually say in August 2026,
because that turned out to decide the design more than any technical question did.
Two of the obvious candidates are unusable, and the one that replaces them did not
exist when the app was built.

## The short version

**Target the Google Health API.** It went live at `health.googleapis.com/v4/` as the
successor to the Fitbit Web API, it is a cloud REST API with webhooks, and it carries
Fitbit, Pixel Watch and anything an Android phone writes to Health Connect behind a
single OAuth flow. One integration, several device families, no native app required.

**Do not start with Strava**, which was the obvious first pick and is the wrong one —
see below. **Apple Health remains blocked** on the React Native migration, and there
is a shortcut worth taking in the meantime.

The engineering work is small. The two things that are not small are a Google
restricted-scope review with no published turnaround, and one modelling decision that
is easy to get wrong in a way nobody notices for a month.

## Which providers are actually available

The question that separates them is not what their API can do. It is what their terms
permit you to do with the data once you have it, and specifically whether they
prohibit *training* a model or prohibit *operating* one.

| Provider | Verdict | Why |
|---|---|---|
| **Google Health API** | **Use this** | Cloud REST, Google OAuth 2.0, webhooks with 7-day retry. Prohibits training a model beyond "that specific user's personalized model for the appropriate use case or user-facing feature" — which is a training clause with an explicit carve-out, not a ban on inference. |
| Strava | Ruled out | "You may not use the Strava API Materials or Strava Data … in connection with the development, training, evaluation, **or operation** of any AI Application." |
| Oura | Possible later | Prohibits using data to "train, fine-tune, develop, improve, or enhance any AI model". Training only. Ten users by default, then app review. |
| Whoop | Possible later | Terms are silent on AI. Free, but requires a Whoop membership, and §3.1.m forbids competing with Whoop "in any manner" — a nutrition app with coaching is not obviously outside that. |
| Garmin | Blocked | Manual partner review taking weeks, and new developer sign-ups are reported closed with no re-open date. |
| Apple Health | Blocked on `apps/mobile` | HealthKit is on-device only. There is no server API at any price. |
| Google Fit | Dead | Deprecated; the REST API turndown landed in 2026. Health Connect replaced it and is on-device Android only. |
| Fitbit Web API | Dying | Sunsets September 2026 — **next month**. Tokens do not carry over; every user re-consents through Google. Anything built against it now is built against a corpse. |
| MyFitnessPal | Ruled out | Partner-only since ~2018. |
| Terra / Vital / Rook | Not for Strava | Aggregators are convenient, but Strava's policy explicitly forbids any "aggregator that re-exposes the Strava API Materials", so they cannot legally sell you the one thing you would buy them for. Per-user pricing also eats the margin `plans.ts` is built around. |

### On Strava specifically

An earlier read of this recommended Strava first, on the grounds that it has the
best-documented API and no approval gate. That recommendation was wrong, and it is
worth recording why so nobody re-derives it:

- The November 2024 agreement banned AI use of API data. The 2026 API policy sharpened
  "operation of any AI Application" into the text, which reaches inference, not just
  training. Feeding a Strava run to the journal agent is the prohibited act.
- Standard tier now requires the *developer* to hold an active Strava subscription
  (~$11.99/mo).
- "You may not charge end users, in any manner, for access to or use of the Strava API
  Materials or any services or functionality included in or related to" them — which
  is hard to reconcile with putting integrations behind a paid plan.

Any one of those is survivable. The first one alone is fatal, because the entire point
of this feature is that the agent reads the data.

## The constraint that shapes everything

`services/adaptive.ts` estimates what someone actually burns from energy balance:

```
TDEE = mean daily intake − (weight change per day × 7700)
```

That number **already contains every workout they did**, because the scale observed the
result. Meanwhile `summary.ts` computes `net_kcal = consumed − burned` from
`exercise_entries`, and `ai/prompt.ts` tells the agent that everyday movement is priced
into the activity level, so logging it counts it twice.

Today that warning is aimed at a human typing "walked to the shop". A device feed makes
the same mistake automatically, every day, for everyone — and the failure is silent.
Pipe a tracker's active-energy figure into `exercise_entries` and the adaptive loop will
observe intake creeping up relative to the trend and pull the target *down* to
compensate for burn it was never blind to. The user sees a target that shrinks the more
they train.

So the rule is: **device data may inform the target, but it may never be subtracted from
intake unless a human would have logged it as a session.**

### Where each metric lands

| Signal | Destination | Counts against intake? |
|---|---|---|
| Discrete workouts (a run, a gym session) | `exercise_entries` | Yes — same as a typed session today |
| Weight from a connected scale | `weight_entries` | n/a — already `UNIQUE (user_id, local_date)` |
| Steps, resting HR, HRV, sleep | `daily_metrics` (new) | **No** — context for the agent only |
| All-day active energy | `daily_metrics` | **No** — this is the double-count trap |
| Total daily energy expenditure | `daily_metrics` | **No** — but see below, this one is valuable |

### The TDEE anchor

`predictTdee` in `services/targets.ts` is Mifflin-St Jeor times an activity multiplier:
a guess about a population of people your size. `adaptive.ts` uses it as the reference
that `SANITY_BAND` (0.35) checks the observed estimate against, and disbelieves the
observation when the two diverge.

A tracker's measured total expenditure is a far better anchor than a population formula.
Substituting it where one exists narrows the band around a real measurement instead of a
demographic average, which means the adaptive loop can trust a shorter window and
converge faster — without ever touching `net_kcal`.

This is the strongest argument for the whole feature, and it is worth noticing that it
needs no agent involvement at all.

## Schema

One migration, `014_connections.sql`. Note the existing numbering has collisions at 011
and 012; 013 is the highest, so 014 is free.

```sql
CREATE TABLE provider_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google_health','apple_health')),
  external_user_id TEXT,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT,
  expires_at       TIMESTAMPTZ,
  scopes           TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','needs_reauth','revoked')),
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at     TIMESTAMPTZ,
  sync_cursor      TEXT,
  UNIQUE (user_id, provider)
);

-- Ambient signals. One row per user per day per provider: two devices reporting
-- the same day is a real situation and neither one is wrong.
CREATE TABLE daily_metrics (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date   DATE NOT NULL,
  provider     TEXT NOT NULL,
  steps        INTEGER,
  active_kcal  NUMERIC(7,1),
  total_kcal   NUMERIC(7,1),
  resting_hr   SMALLINT,
  hrv_ms       NUMERIC(6,2),
  sleep_min    NUMERIC(6,1),
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_date, provider)
);

-- Idempotency. A webhook redelivers, a backfill re-runs, and without this one
-- resync duplicates a month of workouts.
ALTER TABLE exercise_entries ADD COLUMN provider    TEXT;
ALTER TABLE exercise_entries ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX exercise_entries_external
  ON exercise_entries (user_id, provider, external_id)
  WHERE external_id IS NOT NULL;

-- `source` is a CHECK constraint, so a new value means dropping and re-adding it.
ALTER TABLE exercise_entries DROP CONSTRAINT exercise_entries_source_check;
ALTER TABLE exercise_entries ADD  CONSTRAINT exercise_entries_source_check
  CHECK (source IN ('text','photo','quick','manual','device'));
```

Tokens are the first genuinely sensitive thing this database will hold — a leaked row is
live access to someone's health record, which a leaked session row is not. They need
encryption at rest with a key from the environment. `services/secrets.ts` is the wrong
home: it *generates* secrets so a self-hosted install needs no configuration, and a key
the database also stores protects nothing if the database is what leaks.

## Stage 0 — Apply for verification, then build the seam

**Start the Google review on day one.** Every Google Health scope is Restricted
classification and needs a privacy and security review with no published turnaround.
It is the long pole and it runs in parallel with everything else.

While that sits in a queue:

- `services/connections.ts` — CRUD over the table above, token encryption, refresh.
- A settings screen. `apps/web/app` has no `settings/` route today; connections, the
  weekly-review email toggle currently living in the profile, and account deletion all
  belong on one.
- `GET /connections`, `DELETE /connections/:provider`. Disconnect must be genuinely
  available and must revoke upstream, not just drop the row.
- Plan gating through `plans.ts`, which already exists precisely so entitlement does not
  have to be retrofitted. Unlike Strava, nothing in Google's terms forbids charging.

Ship this with zero providers wired. The seam is the point.

## Stage 1 — Google Health, read-only: workouts and weight

- `GET /connect/google-health` → OAuth consent → callback stores the connection.
- `POST /webhooks/google-health` for change notifications.
- Sync reads `exercise` sessions and `weight` samples, and writes through the existing
  `createExerciseEntry` / `logWeight` in `services/log.ts`.

Three things to get right:

**Treat the webhook as a doorbell, not a delivery.** It says *something changed for this
user*; the sync then fetches with our own stored token. A forged webhook costs one wasted
fetch instead of poisoning the journal. The API's other public writable endpoint,
`POST /email/inbound`, already refuses everything when its signing secret is absent, and
this one should behave the same way.

**Days are local, and "local" here is the user's, not the device's.** Every write goes
through `localDateFor(performedAt, ctx)` with the account's `timezone` and
`day_start_hour`. A workout at 1am belongs to yesterday for someone with the default
4am rollover, and no provider knows that.

**Confidence is `high`.** A measured session is not an estimate from a sentence.

Backfill 14 days on connect. Safe to do, because `adaptive.ts` reads intake and weight
and never reads `exercise_entries` at all — so backfilled workouts cannot retroactively
move a target. They change what `net_kcal` shows on days already past, which is honest.

## Stage 2 — Ambient metrics and the TDEE anchor

Populate `daily_metrics`, and use the device's total expenditure as the reference in
`adaptive.ts` in place of `predictTdee` when a connection exists.

Use the API's `:reconcile` read method rather than `:list` here. A user carrying a phone
and wearing a watch has two step streams, and reconciling upstream is cheaper and more
correct than de-duplicating two device feeds ourselves.

This stage is where the feature earns its keep, and it involves no model calls.

## Stage 3 — Let the agent read them

Extend the day context in `ai/prompt.ts` with sleep, resting HR and steps, and add the
rule that keeps the whole thing straight — something close to:

> Steps, sleep and resting heart rate are context, not calories. Never suggest they
> offset intake; the target already accounts for them.

Then a `log_exercise` guard: if a device already wrote a session covering that window,
correct it rather than adding a second one. Someone who tells the journal "ran 5k this
morning" after their watch already filed it is the common case, not the exception.

Worth stating plainly in the privacy policy before this ships: connected health data is
sent to Anthropic for analysis, is not used to train anything, and the connection can be
severed from the settings screen. Google's carve-out is for "that specific user's
personalized … user-facing feature", which is exactly this and nothing broader.

## Stage 4 — Apple Health

Needs `apps/mobile` (README §"Migrating to React Native"). When it exists, HealthKit
reads on-device and posts to the same ingest endpoints Stage 1 built.

Two things that will be true by then:

- Apple's guideline 5.1.2(i) requires explicit consent before personal data goes to a
  third-party AI. A generic privacy policy will not clear review; the consent has to name
  what leaves the device.
- HealthKit data may not be used for advertising, marketing or use-based data mining.
  Improving the user's own health management is the permitted purpose, so this app's use
  fits — but only that use.

**The shortcut worth taking first:** a token-authed ingest endpoint that an iOS Shortcuts
automation, or Health Auto Export, POSTs to on a schedule. Onboarding is ugly — the user
pastes a token into Shortcuts — but it is roughly a day of work against a native app that
does not exist, and it unblocks the platform most of these users are on. It also forces
the ingest endpoint to be provider-shaped rather than Google-shaped, which is the right
pressure to apply early.

## What each stage buys

| Stage | Buys |
|---|---|
| 0 | Somewhere to put a connection, and the review clock started |
| 1 | Workouts and weigh-ins arrive without anyone typing them |
| 2 | A measured TDEE anchor — better targets, no model calls |
| 3 | The agent can reason about training load and sleep |
| 4 | iPhone users, who are most of them |

## Not in this plan (deliberately)

**Writing back.** Google Health supports writes, and pushing meals out to it is a
plausible feature. It is also a second consent scope, a conflict-resolution problem, and
no user has asked.

**Aggregators.** Reconsider if a third provider is ever wanted; two is cheaper by hand,
and the one they would be most useful for forbids them.

**Strava.** Not until the API policy changes. Watch it — this is IPO-driven positioning
and could soften — but build nothing against it today.

**Real-time anything.** A 7-day webhook retry window and an hourly sweep are the right
resolution for a nutrition app. `scheduler.ts` already ticks hourly and can carry the
token refresh and the reconciliation sweep without a queue.
