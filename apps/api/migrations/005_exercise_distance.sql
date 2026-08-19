-- Distance on an exercise entry.
--
-- Burn for anything measured in distance is estimated from km × bodyweight, so
-- the km is the number the user is most likely to want corrected ("it was
-- closer to 5"). Holding it in its own column keeps that a one-value fix rather
-- than a re-description of the route, and leaves the agent's assumption
-- auditable after the fact rather than buried in the description text.

ALTER TABLE exercise_entries ADD COLUMN distance_km NUMERIC(6,2);
