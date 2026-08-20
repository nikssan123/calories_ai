-- Receiving mail, not just sending it.
--
-- Several of the messages this server sends end with "reply to this email",
-- which until now was a lie: nothing had an MX record and every reply bounced
-- into the void. Resend receives on the domain and posts each message here as a
-- webhook, and this is where they land.
--
-- Kept locally rather than left in the provider's dashboard for the same reason
-- `email_deliveries` is: the sending side of this product is already answerable
-- from inside the admin panel, and a support inbox that lives somewhere else is
-- one nobody reads. It is a record, not a mail client — there is no reply-from-
-- here, because replying is what a real mail client is good at.

CREATE TABLE support_emails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Resend's own id for the received message. Unique because a webhook is
  -- delivered at least once, not exactly once: Svix retries on any non-2xx, and
  -- a slow response is indistinguishable from a failed one. This column is what
  -- makes a redelivery a no-op instead of a duplicate in the inbox.
  provider_id   TEXT NOT NULL UNIQUE,

  from_email    TEXT NOT NULL,
  from_name     TEXT,
  -- Which of our addresses it was sent to. Worth keeping even with one address
  -- in use: Resend receives on anything@the domain, so this is the only record
  -- of whether someone wrote to support@, to notifications@, or to a typo.
  to_email      TEXT NOT NULL,
  subject       TEXT,

  -- Both parts, whichever the sender's client produced. Nullable together
  -- because the body arrives in a second request: the webhook carries metadata
  -- only, and a message whose body could not be fetched is still worth having.
  text_body     TEXT,
  html_body     TEXT,
  body_error    TEXT,

  /*
   * The account this came from, matched on the address at the time it arrived.
   *
   * A snapshot rather than a join, and deliberately so — it answers "who was
   * this when they wrote in", which is the question support is actually asking,
   * and it survives the address being changed afterwards. Null is the ordinary
   * case: most people writing in are not signed in to anything.
   */
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata only. Attachment content stays with Resend, behind a short-lived
  -- download URL — this server has no business storing what strangers send it.
  attachments   INT NOT NULL DEFAULT 0,

  received_at   TIMESTAMPTZ NOT NULL,
  -- Set when someone has dealt with it. Not a delete: the point of an inbox is
  -- that it remembers what was already answered.
  handled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The inbox view: unhandled first, newest first within that.
CREATE INDEX support_emails_inbox ON support_emails (handled_at NULLS FIRST, received_at DESC);
CREATE INDEX support_emails_user ON support_emails (user_id) WHERE user_id IS NOT NULL;
