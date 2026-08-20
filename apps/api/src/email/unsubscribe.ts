import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.ts';
import { EMAIL_UNSUBSCRIBE_SECRET, getSecret } from '../services/secrets.ts';

/**
 * The unsubscribe link.
 *
 * Signed rather than stored, and with no expiry, because of where it lives: an
 * email sits in an inbox for years and the link at the bottom of it has to work
 * on the day someone finally gets tired of the message. A row in `auth_tokens`
 * would be purged long before then, and a link that has quietly expired is
 * worse than no link at all — it is the thing that makes people click "spam"
 * instead.
 *
 * It is safe to make permanent because of how little it can do: the signature
 * covers one user id and one purpose, and the only action behind it is turning
 * off a notification the holder is already receiving. It grants nothing.
 */

export interface UnsubscribeLink {
  /** For the footer of the email itself. */
  url: string;
  /** For the List-Unsubscribe headers, which act without a browser. */
  postUrl: string;
}

export async function unsubscribeLink(userId: string): Promise<UnsubscribeLink> {
  const signature = sign(userId, await getSecret(EMAIL_UNSUBSCRIBE_SECRET));
  const query = `u=${encodeURIComponent(userId)}&s=${signature}`;
  return {
    url: `${env.appUrl}/unsubscribe?${query}`,
    postUrl: `${env.appUrl}/api/email/unsubscribe?${query}`,
  };
}

export function verifyUnsubscribe(userId: unknown, signature: unknown, secret: string): boolean {
  if (typeof userId !== 'string' || typeof signature !== 'string') return false;

  const expected = Buffer.from(sign(userId, secret));
  const given = Buffer.from(signature);
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/**
 * The headers that let a client unsubscribe without opening the page.
 *
 * Gmail and Apple Mail render their own "Unsubscribe" control when both are
 * present, and — since 2024 — bulk senders are expected to honour it. Handing
 * people that button is also self-interested: it is the alternative to the one
 * marked "report spam", which is the click that costs a sending domain its
 * reputation.
 */
export function unsubscribeHeaders(link: UnsubscribeLink): Record<string, string> {
  return {
    'List-Unsubscribe': `<${link.postUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe.${userId}`).digest('base64url');
}
