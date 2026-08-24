-- Saying something without paying a model to word it.
--
-- Everything the app has said first until now has gone through one door. The
-- Monday review and the weekly nudge are both written by a model, both cost a
-- turn, and both are entitlements — `reviewsPerDay` and `nudgesPerWeek` in
-- `plans.ts`, and both are zero on free. The consequence of that has never been
-- written down anywhere: a free account hears *nothing*, ever, and a paying one
-- hears at most two things a week, both of them about a pattern subtle enough
-- to need prose.
--
-- The facts that need no prose have gone unsaid. A hundred logged days in a row
-- is not a nuance. Neither is a goal weight reached, nor a subscription that
-- lapses on Thursday. Each of them is one sentence a format string writes
-- exactly as well as a model would, which is why each can go to everybody, on
-- every tier, at no marginal cost and behind no ceiling.
--
-- This table is the record of having sent one, and it exists for the same
-- reason `nudges` does: the tick runs hourly, in every timezone, and without a
-- row to key on, the same congratulation arrives at 20:00 and again at 21:00.

CREATE TABLE alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What happened. Four things, and the list should grow slowly: every entry
  -- here is a licence to make somebody's phone buzz, and the argument that
  -- keeps `NUDGE_KINDS` to four applies with more force to a channel that
  -- costs nothing to add to.
  kind       TEXT NOT NULL CHECK (kind IN ('streak','goal_reached','daily_recap','plan_expiring')),

  -- What it was *about*, and the whole of the idempotency.
  --
  -- Deliberately not the date, which is what `nudges` keys on. The date is the
  -- right identity for "we spoke today"; it is the wrong one for "we have
  -- already congratulated this streak", which must hold for as long as the
  -- streak does and must not hold for the next one. So each kind names its own
  -- subject: the streak's start date and the milestone within it, the goal
  -- weight that was reached, the expiry instant being warned about — and, for
  -- the daily recap, the local date, because there a day really is the subject.
  subject    TEXT NOT NULL,

  -- When it was sent, in the reader's own calendar. Read by the frequency
  -- budget in `interruptions.ts`, which counts a week backwards from today.
  local_date DATE NOT NULL,

  -- What was actually said, kept rather than recomputed. The wording is a
  -- format string over numbers that keep moving, so a row that stored only its
  -- inputs would render tomorrow's sentence when asked what yesterday's said.
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The idempotency, in an index rather than in a check-then-write. Same job as
-- `nudges_once` and the same reason: the pass reads whether something is due
-- and then writes it, and two replicas can pass the same read.
CREATE UNIQUE INDEX alerts_once ON alerts (user_id, kind, subject);

-- Read on every tick by the shared frequency budget: "has this person heard
-- from us in the last week?"
CREATE INDEX alerts_recent ON alerts (user_id, local_date DESC);

-- ---- Whether they want them --------------------------------------------------

-- On by default, unlike `notify_nudges`, and the difference is worth stating
-- because 018 argued the opposite so firmly.
--
-- What 018 refused to default on was *unsolicited mail*: an address we hold,
-- written to because the app decided to say something. Neither half is true
-- here. A milestone goes to a phone and never to an inbox, and a phone can only
-- be reached through a token that exists because somebody granted the
-- permission and left it granted — the yes is already on file. What is left to
-- decide is narrower: whether the two rarest and most welcome things the app
-- can say, a streak worth noticing and a goal actually reached, arrive at an
-- address that has already agreed to be reachable.
ALTER TABLE users ADD COLUMN notify_milestones BOOLEAN NOT NULL DEFAULT TRUE;

-- Off by default, and it is the one switch here that should be hard to turn on
-- by accident. Everything else in this table is rare by construction — a
-- streak milestone is seven of them in a lifetime of logging. A recap is
-- *daily*, which makes it the only thing the app sends that could become
-- wallpaper, and the only one whose frequency the reader has to choose on
-- purpose.
ALTER TABLE users ADD COLUMN notify_daily_recap BOOLEAN NOT NULL DEFAULT FALSE;
