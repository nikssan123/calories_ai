# Everything the app says first

Before this, the app spoke unprompted twice: the Monday review and the weekly
nudge. Both are written by a model, both are metered, and both are entitlements
— `reviewsPerDay` and `nudgesPerWeek` in `plans.ts`, both zero on free. Nobody
had written down what that adds up to, so here it is: **a free account heard
nothing, ever**, and a paying one heard at most two things a week, each about a
pattern subtle enough to need prose.

Meanwhile the things that need no prose went unsaid. A hundred logged days in a
row is not a nuance. Neither is a goal weight reached, a subscription lapsing on
Thursday, or "remind me at eight". Each is one sentence that a format string
writes as well as a model would — which means each can go to everybody, on every
tier, at no marginal cost and behind no ceiling.

**All of it is built.** Two things landed differently from the sketch and are
noted where they happened: the frequency budget had to move out of `nudges.ts`
into a file of its own (§2), and preferences for alerts are checked at the
*decision* rather than at the sender, which inverts the rule the other push
paths follow and needed the reason writing down (§3).

---

## 1. Two new senders, and what separates them

| | Weekly review | Nudge | **Alert** | **Local reminder** |
|---|---|---|---|---|
| Written by | model | model | `printf` | the phone |
| Costs | a turn | a turn | nothing | nothing |
| Free tier gets it | no | no | **yes** | **yes** |
| Needs a network | yes | yes | yes | **no** |
| Channels | mail + push | push, else mail | push only | local only |
| Frequency | weekly | ≤1/week | ≤1/week (shared) | whenever they said |

An **alert** is a server-side notification with arithmetic behind it instead of
inference. Four kinds, in `ALERT_KINDS`:

- `streak` — consecutive logged days reached 7, 14, 30, 60, 100, 200 or 365.
- `goal_reached` — the scale reached `target_weight_kg`, from the side the goal
  points. A goal of maintaining has no crossing to detect and is left alone.
- `daily_recap` — tonight's calories and protein against tonight's targets.
- `plan_expiring` — a paid plan lapses within three days and nothing renewed it.

A **local reminder** is an OS alarm scheduled on the device by
`apps/mobile/lib/reminders.ts` and never mentioned to the server. Two of them: a
daily "anything to log?" at an hour of the reader's choosing, and a weekly
weigh-in. They work in a tunnel, on the free tier, and for somebody whose
session expired overnight. The trade is that the server knows nothing about
them — a reminder set on one phone is not restored on the next — which is fine
for an alarm and would not be for a message.

## 2. The budget, moved — built

The switches promise "at most one a week". That promise was enforced inside
`nudges.ts`, where it was correct for exactly as long as the nudge was the only
thing that could interrupt anybody.

A budget enforced per feature is not a budget. Two senders each honestly keeping
to one a week is two a week, and the switch still says one.

So `services/interruptions.ts` now holds it, counting the union of nudges and
budgeted alerts, and both callers ask it:

```
withinInterruptionBudget(userId, today, allowance)
  ├── nudges.ts   → allowance = nudgesPerWeek   (0 on free, 1 on Plus/Coach)
  └── alerts.ts   → allowance = 1               (every tier — it is not sold)
```

Two kinds are deliberately exempt, and the exemptions are the interesting part:

- `daily_recap`, because what the reader switched it on **for** is a message
  every evening. Charging it to a weekly allowance would honour the request by
  refusing it six days in seven.
- `plan_expiring`, because it is an account event. The same reasoning
  `email/notify.ts` applies to a password change: it is about the account rather
  than about the food, so there is no preference to consult and no budget to
  spend.

The weekly review does not count against it either, but it does still impose
`QUIET_DAYS_AFTER_REVIEW` — two messages about the same week a day apart reads
as an app that has lost track of itself.

## 3. Preferences are decided at the decision — built

Every other push path checks the switch in `push/notify.ts`, at the sender.
`sendAlertPush` checks nothing, and `dueAlert` checks instead. That inversion is
deliberate and it is about the row.

An `alerts` row is the *record of having spoken*, and writing one for a
celebration spends the shared weekly budget at the moment it is written. Check
the switch at the sender and you write down a message that is never sent — and
quietly spend somebody's one interruption a week on silence. So nothing that
will not be sent is ever written down, and an alert that exists is an alert that
was wanted.

`alerts.test.ts` asserts exactly that: a milestone with the switch off leaves no
row behind, so the nudge pass still has the week to work with.

## 4. Two new preferences, and their defaults

| Column | Default | Why |
|---|---|---|
| `notify_milestones` | **on** | Push-only, so the only address it can reach is one this phone already volunteered by granting permission. Rare by construction — seven in a lifetime of logging. |
| `notify_daily_recap` | **off** | The only daily thing the app sends, and therefore the only one that could become wallpaper. Its frequency has to be chosen on purpose. |

`018_nudges.sql` argued hard for opt-in and it was right about *mail*: an
address we hold, written to because the app decided to speak. Neither half is
true of a milestone.

Neither preference appears on the web settings page. That section is titled
"Email" and these have no email behind them.

## 5. Android channels: one became four — built

A channel is the only notification control Android gives a reader that is finer
than the whole app. With a single one, somebody tired of the evening recap had
exactly one way to stop it: silence everything, including the warning that their
subscription lapses on Thursday.

| Channel | Carries |
|---|---|
| `default` | Reviews and nudges |
| `milestones` | Streaks and goals |
| `recap` | Evening recap |
| `account` | Subscription warnings |
| `reminders` | The alarms set on this phone (`reminders.ts`) |

All at `DEFAULT` importance except `reminders`, which is `HIGH` — the reader
picked the hour themselves, and an alarm that arrives silently in the shade has
failed at the one job it was given.

Names and importance are set once per install and then belong to the reader:
Android ignores later changes to a channel that already exists.

## 6. The pass — built

`runDueAlerts` in `scheduler.ts`, a sibling of the other two, on the same hourly
tick and behind its own advisory lock. Three differences from its siblings, all
of them consequences of not calling a model:

1. **It does not ask `authErrorFor()`.** The other two bail when the deployment
   has no model credentials. This one has work to do without any.
2. **It does not read a plan.** Nothing below it costs a token.
3. **It writes before it sends.** The review pass sends after writing because
   generating the review is the expensive, unrepeatable part and the mail is an
   afterthought. Here the *send* is the unrepeatable part — there is no artifact
   to lose, and the only thing that can go wrong twice is a phone buzzing twice.
   So the unique index goes first and the loser of the race stays quiet.

One alert per user per pass, in the order of what the reader can still act on:
`plan_expiring` → `goal_reached` → `streak` → `daily_recap`. Nothing is lost by
losing — every window is "from this hour onward" and the next tick is an hour
away.

Hours are staggered on purpose: 10:00 for the account warning (it asks somebody
to go and renew something, which is not a 21:00 request), 20:00 for the
celebrations, 21:00 for the recap, which is the earliest hour "how the day went"
is an honest claim.

## 7. Idempotency

`alerts_once (user_id, kind, subject)`, where `subject` is what the alert is
*about* rather than when it was sent:

| Kind | `subject` | So that |
|---|---|---|
| `streak` | `<run start>:<milestone>` | A streak broken in April and rebuilt in June is a second achievement and may be said again — while this one cannot be said twice. |
| `goal_reached` | `<goal>:<target kg>` | Drifting up and coming back is not a new achievement. Setting a new target is. |
| `daily_recap` | the local date | Here the day really is the subject. |
| `plan_expiring` | the expiry instant | A renewal that moves the date earns a fresh warning; an unchanged one is mentioned once. |

`nudges` keys on the date, which is the right identity for "we spoke today" and
the wrong one for "we have already congratulated this streak".

## Not in scope, deliberately

- **Email for any of this.** Every alert is one sentence with nothing behind it
  to go and read — the same argument that keeps a nudge off email once it has
  reached a pocket. Somebody with no device registered hears nothing, which is
  the honest outcome for a channel they have not opted into.
- **A web equivalent of the local reminders.** Browser notifications need a
  service worker and a permission prompt with a much worse reputation, to
  deliver an alarm on a device that is usually not the one in your pocket.
- **More kinds.** Every entry in `ALERT_KINDS` is a licence to make somebody's
  phone buzz. The argument that holds `NUDGE_KINDS` to four applies with *more*
  force to a channel that costs nothing to add to.
