-- Verification becomes a gate, and gains a code you can type.
--
-- Until now confirming an address was optional and done by clicking a link.
-- Both change here: a new account cannot use the product until the address is
-- proved, and the email carries a six-digit code as well as a link, because a
-- gate you hit on your phone while signed in on a laptop is a gate you want to
-- pass by typing six characters rather than by forwarding yourself a URL.
--
-- The code and the link are two ways into the *same* row, so spending either
-- spends both. That is the property that stops "click the link, then type the
-- code you already used" from being a state anyone can reach.

-- The code, hashed like everything else here. Nullable because password-reset
-- rows have no code: a reset is only ever reached from the link, where there is
-- by definition no session to scope a short code against.
ALTER TABLE auth_tokens ADD COLUMN code_hash TEXT;

/*
 * Guesses spent against this row.
 *
 * A six-digit code is a million possibilities, which is ample against a person
 * and nothing at all against a script. The IP rate limit on the route is the
 * wrong instrument for it — an attacker with addresses to spare walks straight
 * past that — so the ceiling belongs on the row being attacked. Five wrong
 * answers burns the code and the owner asks for another.
 */
ALTER TABLE auth_tokens ADD COLUMN attempts INT NOT NULL DEFAULT 0;

-- The lookup the code path makes: this user's live code for this purpose. A
-- short code is not unique across accounts the way a 256-bit token is, so it is
-- only ever resolved together with the user id from the session.
CREATE INDEX auth_tokens_live_code ON auth_tokens (user_id, purpose)
  WHERE code_hash IS NOT NULL AND used_at IS NULL;

/*
 * Everyone who already has an account keeps it.
 *
 * The gate is for addresses nobody has proved, and every account that predates
 * this migration was created under a build that never asked. Locking them out
 * retroactively would be a self-inflicted outage, and it would prove nothing:
 * these are people who have been receiving mail at these addresses for months.
 */
UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
 WHERE email IS NOT NULL;
