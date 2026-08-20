import type { FastifyBaseLogger } from 'fastify';
import type { WeeklyReview } from '@ct/shared';
import { env } from '../env.ts';
import { issueToken, issueVerification, TOKEN_TTL_MINUTES } from '../services/tokens.ts';
import { findRecipientByEmail, getEmailRecipient } from '../services/user.ts';
import { sendEmail, type SendResult } from './send.ts';
import * as templates from './templates.ts';
import { unsubscribeHeaders, unsubscribeLink } from './unsubscribe.ts';

/**
 * One function per thing that happens, and the rules about who hears about it.
 *
 * This is the only layer that knows both the event and the recipient, so it is
 * where the two policies live:
 *
 * 1. **Security and account mail always goes.** There is no preference to
 *    consult, because "your password was changed" is not a newsletter.
 * 2. **Product mail goes only to a verified address, and only if wanted.** An
 *    address nobody has proved they can read may well belong to a stranger who
 *    was typed in by mistake, and the weekly review is exactly the kind of
 *    recurring mail that turns such a mistake into a spam complaint.
 *
 * Every function here answers rather than throws, and every caller is free to
 * ignore the answer. A notification is the least important thing happening in
 * any request that triggers one.
 */

const SKIPPED = (reason: string): SendResult => ({ status: 'skipped', reason });

// ---- Verification and passwords --------------------------------------------

/**
 * The confirm-your-address link, sent at signup and again on request.
 *
 * A no-op for an address that is already confirmed: the link would still work,
 * but re-proving something is a strange thing to ask of someone, and a "resend"
 * button that mails a verified user is how duplicate confirmations happen.
 */
export async function sendVerificationEmail(
  userId: string,
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no address');
  if (recipient.verified) return SKIPPED('already verified');

  const { token, code } = await issueVerification(userId, recipient.email);
  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    message: templates.verifyEmail({
      name: recipient.displayName,
      url: `${env.appUrl}/verify?token=${encodeURIComponent(token)}`,
      code,
    }),
  });
}

/**
 * The reset link.
 *
 * Takes an address rather than a user because at this point in the flow there
 * is no user — that is the whole problem being solved. An address with no
 * account is silently a no-op: the route above answers identically either way,
 * and this is the half of that promise that would otherwise leak the difference
 * through timing or through a log line.
 */
export async function sendPasswordResetEmail(
  email: string,
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await findRecipientByEmail(email);
  if (!recipient) {
    logger?.info({ email }, 'password reset requested for an unknown address');
    return SKIPPED('no such account');
  }

  const { token } = await issueToken(recipient.userId, 'password_reset', recipient.email);
  return sendEmail({
    to: recipient.email,
    userId: recipient.userId,
    logger,
    message: templates.passwordReset({
      name: recipient.displayName,
      url: `${env.appUrl}/reset?token=${encodeURIComponent(token)}`,
      expiresInMinutes: TOKEN_TTL_MINUTES.password_reset,
    }),
  });
}

export async function sendPasswordChangedEmail(
  userId: string,
  at: Date,
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no address');

  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    message: templates.passwordChanged({
      name: recipient.displayName,
      when: formatWhen(at, recipient.timezone),
    }),
  });
}

// ---- Sessions --------------------------------------------------------------

export async function sendNewSignInEmail(
  userId: string,
  sighting: { device: string; ip: string | null; at: Date },
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no address');

  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    message: templates.newSignIn({
      name: recipient.displayName,
      when: formatWhen(sighting.at, recipient.timezone),
      device: sighting.device,
      ip: sighting.ip,
    }),
  });
}

// ---- The account itself ----------------------------------------------------

/**
 * The receipt for a deletion.
 *
 * Everything it needs is passed in because by the time this runs there is
 * nothing left to look up — which is also why the delivery is recorded against
 * a null user. This is the one message that outlives its recipient's account.
 */
export async function sendAccountDeletedEmail(
  input: {
    email: string;
    name: string | null;
    counts: { food_entries: number; chat_messages: number; photos: number };
  },
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  return sendEmail({
    to: input.email,
    userId: null,
    logger,
    message: templates.accountDeleted({ name: input.name, counts: input.counts }),
  });
}

/** Suspension and its reversal. Both are things done *to* someone, so both are told. */
export async function sendAccountStatusEmail(
  userId: string,
  disabled: boolean,
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no address');

  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    message: disabled
      ? templates.accountSuspended({ name: recipient.displayName })
      : templates.accountRestored({ name: recipient.displayName, appUrl: env.appUrl }),
  });
}

// ---- The weekly review -----------------------------------------------------

/**
 * Monday's review.
 *
 * The idempotency key is the week, so the hourly tick can call this as often as
 * it likes: the second attempt to email the same week for the same account is
 * refused by a unique index rather than by hoping the schedule was right.
 */
export async function sendWeeklyReviewEmail(
  userId: string,
  review: WeeklyReview,
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no address');
  if (!recipient.notifyWeeklyReview) return SKIPPED('opted out');
  if (!recipient.verified) return SKIPPED('address not verified');

  const link = await unsubscribeLink(userId);

  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    idempotencyKey: `weekly_review:${userId}:${review.week_start}`,
    headers: unsubscribeHeaders(link),
    message: templates.weeklyReview({
      name: recipient.displayName,
      content: review.content,
      stats: review.stats,
      range: formatRange(review.week_start, review.week_end),
      appUrl: env.appUrl,
      unsubscribeUrl: link.url,
    }),
  });
}

// ---- Formatting ------------------------------------------------------------

/**
 * An instant, in the reader's own timezone and with the zone named.
 *
 * The zone is not decoration. The single most useful thing a security email can
 * say is *when*, and "14:32" means nothing to someone deciding whether that was
 * them — they need to know whether it is their afternoon or somebody else's.
 */
export function formatWhen(at: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    hour12: false,
  });
  // en-GB renders this as "Thursday 20 August at 14:32 GMT+3"; the comma before
  // the time reads as a list rather than a clause.
  return formatter.format(at).replace(/,\s*(\d{2}:\d{2})/, ' at $1');
}

/** "11–17 August" where the month is shared, "28 July – 3 August" where it is not. */
export function formatRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const day = (date: Date) => String(date.getUTCDate());
  const month = (date: Date) =>
    new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(date);

  return start.getUTCMonth() === end.getUTCMonth()
    ? `${day(start)}–${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}
