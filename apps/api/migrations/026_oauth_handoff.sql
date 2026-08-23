-- Handing a Google sign-in to a native app.
--
-- The browser half of the handshake ends with a session cookie, which is
-- exactly what a phone cannot use: the app is not the browser that ran the
-- handshake, and by the time it is handed control the cookie is somewhere it
-- can never read. So the native flow ends with a code in the redirect instead,
-- and the app spends it for a bearer token from a request of its own.
--
-- Which makes the code a credential in transit — through a custom-scheme
-- redirect that, on Android, another installed app can claim. It is spent
-- against a verifier the app generated and never sent anywhere until the
-- exchange, so intercepting the code alone buys nothing. That is PKCE, one
-- layer up: the same argument the Google handshake itself already makes.
--
-- `auth_tokens` is where it belongs rather than a table of its own. Everything
-- about the row is what that table already does — hashed, single-use, expiring,
-- swept on the same schedule — and the only column it needs beyond a reset
-- link's is `code_hash`, which is already there holding the second secret on a
-- verification row.
ALTER TABLE auth_tokens DROP CONSTRAINT auth_tokens_purpose_check;
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_purpose_check
  CHECK (purpose IN ('password_reset', 'email_verification', 'oauth_handoff'));
