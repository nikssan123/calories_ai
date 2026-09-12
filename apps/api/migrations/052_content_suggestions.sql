-- What the planner has already thought of.
--
-- Dedup used to read `content_topics`, which is the set of subjects currently
-- accepted — not the set already considered. Three ways that goes wrong, and
-- all three happened within a day of shipping it:
--
--   * Delete a topic and the planner forgets it existed. Clearing the table to
--     "start fresh" produced a request for eight new subjects with no memory of
--     the eight just discarded, which is a machine for proposing them again.
--   * Untick a suggestion and it returns next time, because nothing recorded
--     that it was offered and refused.
--   * Names alone hide overlap. "Why a calculated maintenance number rarely
--     matches the scale", "What a weight-loss plateau usually is" and "Weekend
--     intake versus weekday intake" read as three subjects and are three
--     windows onto one.
--
-- So the memory is separate from the accepted set and outlives it. A row here
-- means "this was put in front of a person", whatever they then did with it.
CREATE TABLE content_suggestions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  brief      TEXT NOT NULL,
  /**
   * proposed — offered, not yet acted on.
   * accepted — became a topic. Stays here even if that topic is later deleted.
   * rejected — explicitly turned down. The strongest signal not to repeat it.
   */
  status     TEXT NOT NULL DEFAULT 'proposed'
               CHECK (status IN ('proposed', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX content_suggestions_recent_idx ON content_suggestions (created_at DESC);
