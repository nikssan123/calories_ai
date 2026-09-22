-- The content engine's spend, which the cost ledger has been refusing all along.
--
-- `MODELS` in `ai/client.ts` knows ten turn kinds. This CHECK has accepted
-- eight since 019, and the two it never learned are `content` and
-- `content_plan` — written by `ai/content.ts` every time the engine drafts a
-- post or plans a week of them.
--
-- Nothing failed loudly, and that is the whole problem. `recordUsage` swallows
-- its own write errors by design, so that a broken cost write can never take
-- down the turn it is measuring; the symptom of a kind the table refuses is
-- therefore not an error anywhere. It is an expensive feature that runs, bills
-- a real model, and records nothing. Confirmed on 2026-09-23 against all three
-- databases — dev, the vitest one, and production — where `ai_usage` holds rows
-- for every other kind and **zero** of either of these.
--
-- `test/usage.test.ts` has been failing on exactly this, which is what it was
-- written to do: it is table-driven over `MODELS` rather than over a list
-- typed out beside it, precisely so that adding a kind and forgetting the
-- migration shows up as a red test rather than as a quiet hole in the ledger.
-- It caught this. Nobody read it.
--
-- Why it matters beyond tidiness: `SUBSCRIPTIONS.md` sizes every plan ceiling
-- off `ai_usage` in dollars. A whole lane of spend missing from that table
-- means the tiers have been sized against an undercount, and the two missing
-- kinds are not cheap ones.
--
-- Widening a CHECK is metadata-only on an existing table — no rewrite, no
-- lock worth naming — and it is safe to deploy in either order: an older
-- container simply never writes these kinds, which is the situation today.
ALTER TABLE ai_usage DROP CONSTRAINT ai_usage_kind_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_kind_check
  CHECK (kind IN (
    'text_log',
    'photo_log',
    'setup',
    'review',
    'pantry_scan',
    'recipe',
    'nudge',
    'meal_plan',
    'content',
    'content_plan'
  ));

COMMENT ON COLUMN ai_usage.kind IS
  'which lane spent the money; the list is MODELS in ai/client.ts, and test/usage.test.ts holds the two together';
