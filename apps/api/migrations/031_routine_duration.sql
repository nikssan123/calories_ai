-- A saved workout that is only a kind and a length.
--
-- The card has always accepted two complete answers: a duration on its own
-- ("cardio, 45 minutes") or a grid of sets. Saving one, though, required the
-- grid — the routine was defined as its exercise list, so a session with no
-- exercises in it had nothing to save and the offer never appeared.
--
-- That left the fast path with no way out of itself. Somebody who logs "cardio,
-- 45 min" three times a week, which is the honest shape of most people's
-- training, could never turn it into the one tap the feature exists to give
-- them; the offer was reserved for exactly the people already doing the most
-- typing. So the duration becomes part of the routine.
--
-- It is the one number that belongs on a routine rather than in history, for
-- the same reason `target_sets` does: "my 45 minute swim" is the plan, where
-- the load on a bar is a thing that happened last Tuesday. Nullable, because a
-- routine that is a list of exercises still has no business claiming one — its
-- length is however long those sets take.
ALTER TABLE routines ADD COLUMN duration_min SMALLINT
  CHECK (duration_min IS NULL OR (duration_min > 0 AND duration_min <= 1440));
