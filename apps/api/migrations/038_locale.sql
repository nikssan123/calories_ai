-- Which language this person reads the app in. Storage is untouched by it --
-- see LANGUAGES.md -- so this column changes rendering and nothing else. Not a
-- food name, not a tool argument, not a stored number.
--
-- Nullable on purpose: null means nobody has asked yet, which is what lets the
-- client fall back to the device's language for a first session and the journal
-- learn it from how somebody writes. Existing rows are backfilled to English
-- because English is what they have been shown since they signed up, and a
-- preference nobody set is not a question worth reopening.
--
-- No CHECK constraint, unlike `units`. The set of shipped languages will change
-- more often than the schema should, and a constraint that has to be dropped
-- and recreated to add Polish is a migration for nothing. The Zod enum in
-- packages/shared/src/locale.ts is the real gate -- it is what the PATCH route
-- validates against -- and a value this build does not recognise resolves to
-- English through localeOf() rather than throwing.
ALTER TABLE users ADD COLUMN locale TEXT;

UPDATE users SET locale = 'en';
