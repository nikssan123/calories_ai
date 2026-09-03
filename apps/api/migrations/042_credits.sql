-- `photo_credits` becomes `credits`, because photos are no longer the only
-- thing sold by the bundle.
--
-- Messages join them: Plus grants 90 a month and the one real account on the
-- deployment runs about 115, so the tier's own ceiling is the thing people hit
-- first. `SUBSCRIPTIONS.md` is clear that the honest fix is a cheaper turn
-- rather than a bigger number — but somebody who runs out on the 22nd needs an
-- answer this month, and a pack is it.
--
-- ---- Why the table moves rather than a second one appearing -------------------
--
-- The obvious shape is `chat_credits` beside `photo_credits`: same columns,
-- same index, same idempotency rule. It is the wrong one, and the reason is
-- that nothing in the code above this differs by meter except a `WHERE`.
-- `creditBalance`, `grantCredits` and `spendCredit` are one function each over
-- a `meter` column and three functions each over two tables — and the third
-- bundle, whenever it lands, is a column value here against a whole migration
-- and three more functions there.
--
-- Everything 036 argued for survives unchanged and is worth restating, because
-- it is what makes this a ledger rather than a counter:
--
--   * **Idempotency.** A webhook worth having retries, and a redelivered
--     purchase against a bare counter is free stock, silently, forever. The
--     grant carries the store's event id and the unique index refuses the
--     second one.
--   * **Provenance.** When somebody writes in asking where their scans went,
--     the answer is a list of rows.
--   * **Refunds.** A REFUND is a negative row on the same code path as a
--     purchase, rather than a special case that clamps at zero and forgets it
--     happened.
--
-- ---- The backfill ------------------------------------------------------------
--
-- Every existing row is a photo row: it is the only meter that was ever sold.
-- So `meter` arrives with a default, the default does the backfill, and the
-- default is then dropped — a new row must say which meter it is rather than
-- inheriting the one that happened to come first.
ALTER TABLE IF EXISTS photo_credits RENAME TO credits;

ALTER TABLE credits ADD COLUMN IF NOT EXISTS meter TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE credits ALTER COLUMN meter DROP DEFAULT;

-- Constrained to the meters a bundle actually sells rather than to `METERS`.
-- A credit row on `meal_plan` is not a thing that can be bought, so it is a bug
-- rather than a row, and the place to find that out is the insert.
ALTER TABLE credits DROP CONSTRAINT IF EXISTS credits_meter_check;
ALTER TABLE credits ADD CONSTRAINT credits_meter_check CHECK (meter IN ('photo', 'chat'));

-- Renaming the table leaves its indexes under their old names, so they follow
-- it by hand. The unique one is *renamed* rather than dropped and recreated,
-- which is what keeps every event id already in the table idempotent across
-- this migration — a recreate has a window in which a redelivered webhook
-- would land a second grant.
ALTER INDEX IF EXISTS photo_credits_event RENAME TO credits_event;

-- The balance index is replaced rather than renamed: it is now filtered by
-- meter as well as by account, and a covering index on the wrong key is worse
-- than no index at all because it looks like one.
DROP INDEX IF EXISTS photo_credits_user;

-- The balance query, on the hot path of any metered turn whose plan grant is
-- spent: one account, one meter, every row. Covering `delta` means the sum
-- never touches the heap.
CREATE INDEX IF NOT EXISTS credits_user ON credits (user_id, meter) INCLUDE (delta);
