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

## What the form actually is, checked in the Console

Opened on 2026-09-07 at Play Console → Monitor and improve → **Policy and
programmes → App content → Health apps** (the path this file used to give,
Policy → App content, is no longer where it lives; the URL is
`/app/<id>/app-content/overview`, and `/app-content` on its own bounces to the
app list).

**It is already filed, and has been since 25 Aug 2026.** Two steps, both done:

1. *Health features in your app* — **Activity and fitness** and **Nutrition and
   weight management** ticked, nothing under Medical, Human subjects research or
   Other. That is the right answer and needs no change.
2. *Regional requirements* — "Currently, you're not required to provide any
   regional requirements for your app's health declaration."

App content's "Need attention" tab is empty; Health apps sits under "Actioned".

**There is no demonstration video on this form.** An earlier version of this
file said the declaration could not be filed until a Health Connect integration
existed to record one, and then that the video was the last step before filing.
Both were wrong about *this* form: it asks for feature categories and nothing
else — no video, no per-permission questions, no free-text about data use. A
video may still be wanted by the separate Health Connect policy process or asked
for during review; it is not collected here. The draft answers below are
therefore useful as a record of what is true about the app, and for any later
form that does ask, rather than as fields to paste into this one.

## What blocked versionCode 38, and what did not

`c0900af` added `android.permission.health.READ_STEPS`, making 38 the first
bundle to declare a Health Connect permission, and the upload was refused:

    Google Api Error: Invalid request -
    You must let us know whether your app includes any health features.

That error is *not* the declaration being absent — it was complete two weeks
before 38 was built. Read it as the declaration needing to be re-affirmed now
that the app's manifest asks for a health permission, or as a validation
elsewhere in the edit that `fastlane supply` builds (EAS Submit runs it with
`skip_upload_metadata: false`, so every upload rewrites the whole listing).

Build 40 was submitted on 2026-09-07 with the declaration in the state above and
was refused with the identical message, so a complete declaration is not what
the API wants. Re-affirming it is not available either: the form has no Save on
step 1, the Save on step 2 stays disabled unless the answers actually change,
and a no-op tick-and-untick does not mark it dirty. The only way to bump its
timestamp is to file an answer that is not true and then correct it, which is
not worth doing to a legal declaration.

The likeliest remaining reading is an ordering trap: the Health Connect part of
this declaration may only appear once Play has *seen* a bundle that requests
those permissions, and no such bundle has ever been accepted — the API refuses
it for want of the declaration that the bundle would have summoned.

**The way out is the Console's own uploader**, which takes the bundle first and
raises any missing declaration afterwards, with a link to it: Test and release →
Testing → Closed testing → alpha → Create new release. It has to be done by
hand — the artifact is 96 MB and browser automation here caps uploads at 10 MB.

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
