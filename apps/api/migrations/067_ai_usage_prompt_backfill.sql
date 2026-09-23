-- The back catalogue, recovered from the conversation it is still sitting in.
--
-- 066 added `ai_usage.prompt` and said there was nothing to backfill from. That
-- was wrong: a journal turn's message is in `chat_messages`, and the row is
-- written microseconds after the cost row — `recordUsage` runs, then
-- `insertMessage` (see ai/run.ts, which persists the message only once the turn
-- has survived). So every successful journal turn in the table can be matched to
-- the words that caused it by time alone, and without this the panel's new column
-- reads "—" for the entire history anybody currently has.
--
-- Matched inside five seconds and nearest-wins. The real gap is milliseconds; the
-- window is wide enough to survive a slow write and far narrower than the space
-- between two turns of a conversation, which is however long it takes a person to
-- type the next one. `DISTINCT ON` then takes the closest message per turn, so a
-- tie is decided by the clock rather than by the planner.
UPDATE ai_usage a
   SET prompt = CASE
                  WHEN length(m.content) > 500 THEN left(m.content, 500) || '…'
                  ELSE m.content
                END
  FROM (
    SELECT DISTINCT ON (u.id)
           u.id AS usage_id,
           btrim(c.content) AS content
      FROM ai_usage u
      JOIN chat_messages c
        ON c.user_id = u.user_id
       AND c.role = 'user'
       AND c.created_at BETWEEN u.occurred_at - interval '5 seconds'
                            AND u.occurred_at + interval '5 seconds'
     WHERE u.prompt IS NULL
       AND u.ok
       AND u.kind IN ('text_log', 'photo_log')
       AND btrim(c.content) <> ''
     ORDER BY u.id, abs(extract(epoch FROM c.created_at - u.occurred_at))
  ) m
 WHERE a.id = m.usage_id;

-- What stays null, and why it is not a bug to be fixed later:
--
--   * A failed turn. The message is persisted after the turn survives, so a turn
--     that errored left no words behind — the one place the ledger is now more
--     complete than the conversation is exactly the place it has nothing to copy.
--   * The photo lane (ai/photo.ts). Its user row carries no words on purpose:
--     the photograph is the message.
--   * A review, a nudge, a fridge scan, a recipe. Nobody typed a sentence, and
--     the prompt they ran on is ours.
--   * Anything belonging to a deleted account. `chat_messages` cascades on
--     delete, so there is nothing to recover and nothing that should be.
