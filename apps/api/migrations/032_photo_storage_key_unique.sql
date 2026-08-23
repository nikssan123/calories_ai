-- One row per stored object.
--
-- Direct uploads let the client name the key it just wrote to, so the same key
-- can arrive twice — a retried request, a client that sends the turn again
-- after a timeout. Two rows pointing at one object is not obviously broken
-- until somebody deletes one of them, at which point the other renders as a
-- hole for the rest of its life.
--
-- Partial, because the local-disk backend leaves `storage_key` null and every
-- one of those rows would otherwise collide with every other.
CREATE UNIQUE INDEX IF NOT EXISTS photos_storage_key_unique
  ON photos (storage_key) WHERE storage_key IS NOT NULL;
