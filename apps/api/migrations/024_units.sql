-- Which measurement system this person reads. Storage stays metric whatever it
-- says — see UNITS.md — so this column changes rendering and nothing else.
--
-- Nullable on purpose: null means onboarding has not asked yet, which is what
-- lets the journal ask once rather than every time it mentions a number.
-- Existing rows are backfilled to metric because metric is what they have been
-- shown since they signed up, and a preference nobody set is not a question
-- worth reopening.
ALTER TABLE users ADD COLUMN units TEXT CHECK (units IN ('metric','imperial'));

UPDATE users SET units = 'metric';
