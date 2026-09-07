# Filing the Play Health apps declaration

Draft answers for the Health Connect declaration on `com.daysofar.app`, written
against what the code actually does rather than against what would be convenient
— the same rule the privacy policy is written under, and for the same reason: a
declaration that cannot be checked against the source is a liability rather than
a permission.

**Nothing here is filed.** The form is a legal statement made in your name about
how your app handles somebody's health data, and a wrong answer on it is a
takedown rather than a bug. Read every line below and change anything you would
not stand behind.

Play Console → the app → **Policy → App content → Health apps** (Google has moved
this menu more than once; if it is not there, search "health" in the Console's
own search). Note the account: `com.daysofar.app` lives under
`n.lyutov99@gmail.com`, profile `u/1`, not the default one.

## This is now blocking a release

`c0900af` ("feat(steps): read Health Connect on Android") added
`android.permission.health.READ_STEPS` to `app.json`. Release 36 predates it, so
**versionCode 38 is the first artifact that declares a Health Connect
permission** — and Play will not accept it, or anything after it, on any track
until this form is answered:

    Google Api Error: Invalid request -
    You must let us know whether your app includes any health features.

That error comes from the track update itself, not from review, so it is not
specific to production: closed testing is blocked by it too. The signed bundle
is sitting at `apps/mobile/android/artifacts/daysofar-v1.0.0-vc38-production-b588c74.aab`
waiting on this.

## The order this has to happen in

An earlier version of this file said the declaration could not be filed at all,
because the demonstration video needs a working Health Connect integration and
there was none — `lib/steps.ts` was iOS-only and Android counted nothing. That
was true when it was written and `c0900af` overtook it on 2026-09-07. The
integration exists now: `lib/steps.ts:98` imports `react-native-health-connect`,
the dependency is in `apps/mobile/package.json`, and `hasWriter` distinguishes
"permission granted, nothing writing steps on this phone" from a real zero.

So the remaining steps are:

1. Install build 38 on a real device with a health app writing steps. A Galaxy is
   the best case: Samsung Health is preinstalled and already counting, and
   probably needs its Health Connect sync switched on once.
2. Record the video: grant the permission, then show the step count appearing on
   Today and on the widget.
3. File this.

## What the form asks, and what to answer

Google reworks the wording periodically; these are the questions in substance.
Where the live form differs, the facts below are still the facts.

### Which permissions, and why

Only one: **`android.permission.health.READ_STEPS`**. In the source that is
`STEPS_PERMISSION` at `apps/mobile/lib/steps.ts:61` — `{ accessType: 'read',
recordType: 'Steps' }`, read only, one record type, and nothing is ever written
back.

> Day So Far reads the user's daily step count to set their calorie target from
> what they actually do rather than from the activity level they selected at
> sign-up, and to give the in-app assistant context when the user asks why their
> weight has stalled. No other Health Connect data type is read, and the app
> writes nothing back.

Do not ask for anything you do not read. A declared permission the app never
exercises is the easiest kind of rejection to earn.

### What the data is used for

A daily total, per day. `apps/api/src/services/metrics.ts:16` lists three uses,
and all three are worth declaring — an undeclared use found in review is worse
than a boring one disclosed up front:

> First, the calorie target: the app's formula multiplies basal metabolic rate by
> an activity level, and step counts replace a value the user guessed once at
> sign-up with one measured from behaviour — a 1.2-to-1.9 multiplier in
> `predictTdee`, well over a thousand kcal of spread on one untested answer.
>
> Second, sanity-checking the app's own weight-based estimate: `adaptive.ts`
> rejects an observed energy expenditure more than 35% away from the predicted
> one, and the predicted one rests on that same dropdown, so a sedentary person
> who picked "moderate" has honest measurements thrown out week after week.
>
> Third, context for the coaching conversation — the assistant is told the step
> count so it can name a change in activity rather than only telling the user to
> eat less.
>
> Steps are never converted into calories, never added to the user's daily
> allowance, and never subtracted from what they have eaten.

That last sentence is worth including even though nothing asks for it. It is
unusual for a calorie app and it is checkable in the source: the instruction is
spelled out to the model at `apps/api/src/ai/prompt.ts:99`, the day line is
labelled "context, never calories" at `prompt.ts:827`, and `metrics.ts` notes
that nothing below it turns a step into a calorie and that none of the three uses
touches `net_kcal`.

### Is the data shared with third parties?

**Yes, and this is the answer that needs the most care.**

> Step counts are sent to Anthropic (Anthropic PBC, United States) as part of the
> context accompanying a user's message to the in-app assistant, in the form of a
> count and a date. Anthropic acts as a data processor under contract, through
> their commercial API, under terms where inputs and outputs are not used to
> train their models. No step data is sent to any other third party, is never
> sold, and is never used for advertising or for any form of profiling for
> marketing.

The mechanism is `apps/api/src/ai/prompt.ts:826` — one line, `- Steps: <n>`,
appended to the day summary the model is given.

Two things to check yourself before you submit this, because they are policy
questions rather than facts about the code:

- **The Health Connect data-use policy restricts what may be done with the
  data**, and its wording on machine learning is not identical to the Google
  Health API's. INTEGRATIONS.md read the *Health API* terms as prohibiting
  training with a carve-out, not prohibiting inference — confirm the Health
  Connect policy separately rather than assuming it transfers.
- If the answer turns out to be that Health Connect data may not go to a
  third-party model at all, the feature still works: uses one and two above
  involve no model whatsoever, and the step line in `ai/prompt.ts` is a few lines
  to gate per-platform. The target arithmetic was deliberately built to need no
  agent, which is what makes that retreat cheap.

### Privacy policy URL

`https://daysofar.com/privacy`

It covers step data explicitly, in its own subsection ("If you let the app count
your steps"), and names Anthropic as a recipient of it. Google checks that the
policy actually mentions health data — a generic one is a rejection.

### Advertising and ads IDs

No. The app carries no advertising, and health data is never used for it.

### Data retention and deletion

> Step counts are stored per user, per day, and are deleted with the account.
> Account deletion is available in the app and removes the rows by cascade;
> deletion on request is offered in the privacy policy.

The cascade is real and not merely intended: `daily_metrics.user_id` is
`REFERENCES users(id) ON DELETE CASCADE` at
`apps/api/migrations/044_daily_metrics.sql:23`.

### The demonstration video

Show, in this order: the Steps card on Today with the app not yet permitted; the
Health Connect permission sheet appearing and being granted; the step count then
appearing on Today; and the home-screen widget showing the same number. Keep it
under a minute and do not cut between the grant and the result — the point of the
video is to prove the permission leads to the feature.

## What I will not do

File it. The submission is a legal declaration in your name about somebody
else's health data, and the demo video has to be a recording of your app on your
device. I can draft, I can build the integration, and I can drive the emulator or
a connected phone to help capture the recording. Pressing submit is yours.
