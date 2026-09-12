-- Why a language failed, not merely that it did.
--
-- `failed` is an array of locale codes, which answers the wrong question. The
-- first real failure in production was Romanian on one topic, and the reason
-- was unrecoverable within minutes: the message went to the container log, a
-- deploy replaced the container, and all that survived was the letters "ro" in
-- an array. The same brief and the same locale then succeeded on the next
-- attempt, so it was transient — and "transient" is a guess, because nothing
-- kept the sentence that would have said.
--
-- A map from locale to message. JSONB rather than a table because it is read
-- exactly when the job is read, is never queried across jobs, and is at most
-- thirteen short strings.
ALTER TABLE content_jobs
  ADD COLUMN errors JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN content_jobs.errors IS
  'locale -> the error that language failed with, for the panel to show';
