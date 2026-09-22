-- Which language the walk was drawn in, and whether the phone was one of ours.
--
-- 055 counts the walk and 060 splits the save prompt by the rung that asked.
-- Both answer "which screen loses people" and neither can answer "whose people"
-- — which is the question the money is being spent on. The campaigns are one per
-- country (ADS.md), so on any day the funnel is a blend of whichever of them was
-- enabled, and a cliff at Q1 that is really a Bulgarian cliff reads exactly like
-- a French one. On 2026-09-22 that cost a whole session: BG installs at a third
-- of France's CPI, no way to see which of the two was losing people at Q1, and a
-- guess as the only thing left.
--
-- `locale` is the phone's language — the same value and the same list as
-- `users.locale` (`LOCALES` in `@ct/shared`), so the funnel and the accounts it
-- produces can finally be read side by side. It is not a country: a French phone
-- kept in English reports `en`, and the DE and FR campaigns both target English
-- on purpose. That is a known and acceptable blur; the alternative is a GeoIP
-- lookup on a route that is deliberately anonymous, which would be a worse
-- trade than the blur.
--
-- Still a count and not a record. Thirteen shared words, one of them on every
-- install that speaks that language. Nothing here narrows a row towards a phone.
ALTER TABLE onboarding_funnel ADD COLUMN locale TEXT;

COMMENT ON COLUMN onboarding_funnel.locale IS
  'the phone''s language, from LOCALES in @ct/shared; null on pings from before 062';

-- Whether this ping came from a build that was never in a store.
--
-- The other half of the same 2026-09-22 problem. Development, simulator and
-- preview builds walk the same onboarding and send the same pings, so a morning
-- spent driving the app on a simulator lands in the funnel as a dozen installs
-- that opened the app and left — indistinguishable from a dozen people the ads
-- paid for. The flag is set from the build profile (`EXPO_PUBLIC_INTERNAL` in
-- eas.json) and from `__DEV__`, so a store build cannot set it and a local one
-- cannot forget to.
--
-- It does not catch everything and is not meant to: a *production* build on the
-- founder's own phone is, to this table, a real install, because nothing short
-- of an identifier could tell it apart — and an identifier is the one thing this
-- table may not have. What it catches is the common case, which is the one that
-- was actually polluting the numbers.
ALTER TABLE onboarding_funnel ADD COLUMN internal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN onboarding_funnel.internal IS
  'ping from a non-store build (dev/simulator/preview); excluded from the admin read';

-- Both columns join the key, for the reason 060 gives at length: a unique index
-- with NULLS NOT DISTINCT rather than a primary key, because `locale` is null on
-- every row written before this migration and two nulls are distinct to a
-- primary key, which would make each ping insert instead of increment.
--
-- As in 060, the API that ships with this migration is the only one that can
-- write the table afterwards — the old five-column `ON CONFLICT` cannot infer
-- this index and errors. Migrations run before the new container binds, so the
-- pings that fall in the gap fail to connect, which the phone already treats as
-- "not sent" and retries.
DROP INDEX onboarding_funnel_key;
CREATE UNIQUE INDEX onboarding_funnel_key
  ON onboarding_funnel (day, step, platform, app_version, reason, locale, internal) NULLS NOT DISTINCT;
