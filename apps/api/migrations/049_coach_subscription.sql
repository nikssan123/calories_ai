-- The coach dashboard is a subscription: a free month, then a card (COACH.md
-- §9). `solo` — one seat, free forever — is gone. The plan a coach lands on
-- without a subscription is `expired`: the links stay, every client is on the
-- free tier, and the dashboard waits behind the billing page.
ALTER TABLE coach_accounts DROP CONSTRAINT coach_accounts_plan_check;
UPDATE coach_accounts SET plan = 'expired', seat_limit = 0, updated_at = now() WHERE plan = 'solo';
ALTER TABLE coach_accounts ADD CONSTRAINT coach_accounts_plan_check
  CHECK (plan IN ('trial','expired','paid','lapsed'));
