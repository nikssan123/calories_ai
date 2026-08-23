-- The mail an erasure used to leave behind.
--
-- `email_deliveries.user_id` and `support_emails.user_id` are both ON DELETE
-- SET NULL, so closing an account severed the link to its mail and kept the
-- rows. The reasoning was sound — a record of what was sent should outlive the
-- account it was sent to — but it missed that both tables carry the address in
-- a column of their own. Severing `user_id` severed a join, not an identity.
-- What was left was a list of email addresses belonging to people who had asked
-- to be forgotten.
--
-- `deleteAccount` now erases both, by address as well as by id. This migration
-- is for the rows already stranded by deletions that happened before it did.

-- Every delivery with no user is one: `sendEmail` is called with a null user id
-- from exactly one place, the deletion receipt, and a receipt is by definition
-- addressed to an account that no longer exists. Nothing else in the table can
-- reach this state — every other send passes the id of a live account, and the
-- only thing that nulls it afterwards is the account being deleted.
DELETE FROM email_deliveries WHERE user_id IS NULL;

-- `support_emails` gets no equivalent, and deliberately not. A null `user_id`
-- there is the *ordinary* case — most people who write to support are not
-- signed in to anything — so the same statement would empty the inbox of
-- correspondence from strangers who never had an account to erase. The rows
-- stranded by past deletions are indistinguishable from those, because the
-- address is the only thing that would tell them apart and the account it
-- belonged to is already gone. Going forward they are erased with the account;
-- these few cannot be found, only guessed at, and guessing would cost more than
-- it recovers.
