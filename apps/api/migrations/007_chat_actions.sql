-- The visual half of an assistant turn, stored with the turn.
--
-- Actions used to exist only in the HTTP response, so the cards the UI drew
-- from them lived exactly as long as the tab did. Reopening the app replayed
-- the conversation from `chat_messages` and every meal card, burn card and
-- chart came back as the plain sentence beside it — the history of the journal
-- looked poorer than the journal itself, which is the wrong way round.
--
-- Separate from `tool_trace`: that is a debugging record of what the model
-- called and is free to change shape, while this is a rendered wire contract
-- (ChatCard) that the client parses. Keeping them apart means a change to one
-- can never break the other.

ALTER TABLE chat_messages ADD COLUMN actions JSONB;
