-- The Agent SDK keeps conversation history in its own session store. Persisting
-- the id lets a turn resume the previous conversation instead of starting cold.
-- If the session is ever missing, the app falls back to a fresh one — the
-- durable nutrition data lives in this database, not in the session.
ALTER TABLE users ADD COLUMN agent_session_id TEXT;
