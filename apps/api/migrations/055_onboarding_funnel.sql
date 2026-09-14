-- How far new installs get through the first-run walk, as counts per day.
--
-- Since 1.2.0 the questions and the plan happen on the phone before there is an
-- account, and the phone says nothing to the server until the account step. On
-- 2026-09-14 an ad campaign brought fourteen installs and no accounts, and the
-- only trace any of them left was a `GET /auth/me` each: whether they left on
-- the welcome screen, on the fourth question or on the sign-up form was
-- unknowable.
--
-- Counts, not events. A row is (day, step, platform, version) and a number, so
-- there is nothing here that belongs to anybody — no install id, no device, no
-- IP, no account. The phone sends each step at most once, which is what lets a
-- plain count stand in for "installs that got this far".
CREATE TABLE onboarding_funnel (
  day          DATE NOT NULL,
  step         TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version  TEXT NOT NULL,
  reached      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, step, platform, app_version)
);

COMMENT ON TABLE onboarding_funnel IS
  'installs reaching each first-run step, per day; anonymous counts, see FUNNEL_STEPS in @ct/shared';
