-- An age somebody told the journal, when it was under 16.
--
-- The birth date cannot hold this. It is what the onboarding wheel was turned
-- to, and a child who wants in turns it to 2005 — that is exactly how a
-- 140 cm guest who later wrote "I'm 9, just so you know" came to have a
-- profile saying 20. The sentence is the better evidence, and it gets a column
-- of its own rather than being written over the birth date, so what they
-- claimed and what they said stay separately visible in the admin panel.
--
-- Once set, the journal stops calling the model for that account and answers
-- every turn with the same short, kind refusal. See `services/age.ts`.

ALTER TABLE users
  ADD COLUMN stated_age smallint,
  ADD COLUMN stated_age_at timestamptz;

COMMENT ON COLUMN users.stated_age IS
  'an age under 16 the user told the journal; the journal stops answering (069)';
