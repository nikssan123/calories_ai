-- Standing preferences the agent is told but the log cannot hold.
--
-- The session is closed at every day rollover (see `runTurn`), so the
-- conversation is no longer the place anything durable can live. Almost nothing
-- is lost by that: the day context rebuilds today's numbers and entry ids every
-- turn, and `search_food_history` returns past items with their quantities, so
-- "the thin 13g sticks, not the chunky ones" survives as data rather than as
-- something the model has to remember.
--
-- What does not survive is an instruction that never became a row: "don't log
-- my commute walk", "skip the remaining-budget line", "I use a small plate".
-- Those go here, written explicitly by the `remember` tool when the user states
-- one — never summarised from the transcript. A summary would drift, and a
-- summary that said "yesterday you logged breakfast" is exactly the confusion
-- the rollover was closed to prevent.
--
-- Bounded on purpose: this is injected into every turn's prompt, so it is
-- capped in the service at a size that stays a rounding error against the day
-- context it sits beside.

CREATE TABLE agent_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_notes_user ON agent_notes (user_id, created_at DESC);
