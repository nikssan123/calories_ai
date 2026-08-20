import { query, queryOne } from '../db.ts';

/**
 * The support inbox.
 *
 * A record of what people sent, not a mail client. There is no reply-from-here
 * and no threading, because replying is the one thing every mail client on
 * earth already does well — what this exists for is that a message arriving at
 * 3am is visible in the admin panel next to the account it came from, instead
 * of sitting in a provider's dashboard nobody has open.
 */

export interface SupportEmail {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  body_error: string | null;
  user_id: string | null;
  /** The account's display name, when the sender matched one. */
  user_name: string | null;
  attachments: number;
  received_at: string;
  handled_at: string | null;
}

export interface IncomingSupportEmail {
  providerId: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string | null;
  attachments: number;
  receivedAt: Date;
}

/**
 * Files a newly received message, and answers null if it is a redelivery.
 *
 * Svix retries any non-2xx and cannot tell a slow response from a failed one,
 * so the same message will arrive twice sooner or later. `ON CONFLICT DO
 * NOTHING` on the provider's id makes that a no-op rather than a duplicate —
 * and the null return is what tells the caller not to spend a second round trip
 * fetching a body it already has.
 */
export async function recordSupportEmail(input: IncomingSupportEmail): Promise<string | null> {
  /*
   * The sender matched against an account, resolved here rather than by joining
   * later. Support wants to know who this was when they wrote in, and someone
   * who changes their address afterwards would otherwise silently stop matching
   * their own history.
   */
  const account = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [input.fromEmail],
  );

  const row = await queryOne<{ id: string }>(
    `INSERT INTO support_emails
       (provider_id, from_email, from_name, to_email, subject, attachments, user_id, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (provider_id) DO NOTHING
     RETURNING id`,
    [
      input.providerId,
      input.fromEmail,
      input.fromName,
      input.toEmail,
      input.subject,
      input.attachments,
      account?.id ?? null,
      input.receivedAt.toISOString(),
    ],
  );
  return row?.id ?? null;
}

/** Attaches the body once the second request has returned it. */
export async function attachBody(
  id: string,
  body: { text: string | null; html: string | null },
): Promise<void> {
  await query('UPDATE support_emails SET text_body = $1, html_body = $2 WHERE id = $3', [
    body.text,
    body.html,
    id,
  ]);
}

/** Records why a body is missing, so the gap in the panel explains itself. */
export async function recordBodyFailure(id: string, error: string): Promise<void> {
  await query('UPDATE support_emails SET body_error = $1 WHERE id = $2', [
    error.slice(0, 500),
    id,
  ]);
}

/** The inbox: anything unanswered first, newest first within that. */
export async function listSupportEmails(limit = 50): Promise<SupportEmail[]> {
  const rows = await query<any>(
    `SELECT s.*, u.display_name AS user_name
       FROM support_emails s
       LEFT JOIN users u ON u.id = s.user_id
   ORDER BY s.handled_at IS NULL DESC, s.received_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(toSupportEmail);
}

export async function setHandled(id: string, handled: boolean): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    'UPDATE support_emails SET handled_at = $1 WHERE id = $2 RETURNING id',
    [handled ? new Date().toISOString() : null, id],
  );
  return row !== null;
}

/** How many are still waiting. Drives the badge on the admin tab. */
export async function unhandledCount(): Promise<number> {
  const row = await queryOne<{ n: string }>(
    'SELECT count(*) AS n FROM support_emails WHERE handled_at IS NULL',
  );
  return Number(row?.n ?? 0);
}

function toSupportEmail(row: any): SupportEmail {
  return {
    id: row.id,
    from_email: row.from_email,
    from_name: row.from_name,
    to_email: row.to_email,
    subject: row.subject,
    text_body: row.text_body,
    html_body: row.html_body,
    body_error: row.body_error,
    user_id: row.user_id,
    user_name: row.user_name ?? null,
    attachments: row.attachments,
    received_at: new Date(row.received_at).toISOString(),
    handled_at: row.handled_at ? new Date(row.handled_at).toISOString() : null,
  };
}
