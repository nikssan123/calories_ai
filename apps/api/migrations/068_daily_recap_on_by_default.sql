-- The evening recap starts on, instead of starting off and never being found.
--
-- `notify_daily_recap` has defaulted to false since it was added, on the same
-- reasoning every notification default is argued from: nobody should be signed
-- up to be interrupted. Twelve days of paid installs say what that reasoning
-- costs here. Of the thirty accounts the ads brought in, **not one** has
-- `notify_daily_recap` or `notify_nudges` set, six have a push token at all,
-- four came back for a second day and none for a third. The switch is three
-- taps into the You tab, under a heading about notifications, and it has never
-- once been found by somebody who arrived from an advert.
--
-- The recap is the one notification in this app that can be defaulted on
-- honestly, and NOTIFICATIONS.md §1 is why:
--
--   * it is written by `printf` and not by a model, so it costs nothing to send
--     and there is no meter behind it and no tier it belongs to;
--   * it only goes to somebody who **logged something that day**, so a dormant
--     account never hears it — this is not a re-engagement blast, it is the
--     close of a day the reader spent in the app;
--   * it needs a push token, which needs an OS permission, which is still asked
--     for exactly as before. A preference is not a permission: this changes what
--     the app would send if allowed, never whether it is allowed.
--
-- The backfill is narrower than the default on purpose: only accounts that
-- already have a push token, which means somebody who has already granted the
-- permission and would otherwise have granted it for nothing. Accounts with no
-- token are left alone rather than flipped — there is no message to send them
-- and no reason to write a preference on their behalf.
--
-- Reversible in one tap under You, where it always was.

ALTER TABLE users ALTER COLUMN notify_daily_recap SET DEFAULT true;

UPDATE users
   SET notify_daily_recap = true,
       updated_at = now()
 WHERE notify_daily_recap = false
   AND EXISTS (SELECT 1 FROM push_tokens WHERE push_tokens.user_id = users.id);

COMMENT ON COLUMN users.notify_daily_recap IS
  'tonight''s calories and protein, on days something was logged; on by default since 068';
