-- Secrets the server generates for itself, rather than asking to be configured.
--
-- The first of these signs photo URLs. A signing key has to be stable across
-- restarts and shared by every instance, which rules out generating one in
-- memory, but making it a required environment variable would mean a
-- self-hosted install fails to start until someone invents a random string —
-- and the rest of this deployment deliberately asks for nothing but a database
-- and a provider. So the server mints one on first use and keeps it here.
--
-- Deleting a row rotates that secret: the next request generates a fresh one,
-- and anything signed with the old one stops verifying. For photo URLs that is
-- the whole rotation story, since they are short-lived by design.

CREATE TABLE app_secrets (
  name       TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
