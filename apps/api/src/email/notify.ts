import type { FastifyBaseLogger } from 'fastify';
import { intlLocale, type Locale, type Nudge, type WeeklyReview } from '@ct/shared';
import { proseLocale } from '../ai/language.ts';
import { env } from '../env.ts';
import { issueToken, issueVerification, TOKEN_TTL_MINUTES } from '../services/tokens.ts';
import { findRecipientByEmail, getEmailRecipient } from '../services/user.ts';
import { emailMessages } from './messages.ts';
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
 *
 * It is also the layer that knows which language to write in. `getEmailRecipient`
 * has carried `locale` since the weekly review was translated; every template
 * now takes it, so every call here passes it, and the two functions at the
 * bottom format their dates in it as well. The two messages that wrap prose the
 * model wrote are the exception, and `chromeLocale` is where they read it off
 * the prose instead.
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
      locale: recipient.locale,
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
      locale: recipient.locale,
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
      when: formatWhen(at, recipient.timezone, recipient.locale),
      locale: recipient.locale,
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
      when: formatWhen(sighting.at, recipient.timezone, recipient.locale),
      device: sighting.device,
      ip: sighting.ip,
      locale: recipient.locale,
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
 *
 * And the only one whose recipient is not written down. `deleteAccount` has
 * just cleared this address out of `email_deliveries`; a receipt logged the
 * ordinary way would put it back a moment later, which is how an erasure ends
 * up being not quite one. The row still says a receipt went out and when.
 */
export async function sendAccountDeletedEmail(
  input: {
    email: string;
    name: string | null;
    counts: { food_entries: number; chat_messages: number; photos: number };
    /**
     * Passed in for the same reason everything else is: there is no row left to
     * read it off by the time this runs. Both callers read it before the
     * deletion, beside the address.
     */
    locale: Locale;
  },
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  return sendEmail({
    to: input.email,
    userId: null,
    redactRecipient: true,
    logger,
    message: templates.accountDeleted({
      name: input.name,
      counts: input.counts,
      locale: input.locale,
    }),
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
      ? templates.accountSuspended({ name: recipient.displayName, locale: recipient.locale })
      : templates.accountRestored({
          name: recipient.displayName,
          appUrl: env.appUrl,
          locale: recipient.locale,
        }),
  });
}

// ---- The weekly review -----------------------------------------------------

/**
 * The key one week's review is sent under.
 *
 * Exported because the scheduler asks about it without sending: on every tick
 * of a Monday it is holding a review that is already written, and "has the mail
 * for this one gone out?" is a question worth answering before re-rendering the
 * message to find out. See `deliveryOutstanding`.
 */
export function weeklyReviewKey(userId: string, weekStart: string): string {
  return `weekly_review:${userId}:${weekStart}`;
}

/**
 * Monday's review.
 *
 * The idempotency key is the week, so the hourly tick can call this as often as
 * it likes: the second attempt to email the same week for the same account is
 * refused by a unique index rather than by hoping the schedule was right — and
 * a *failed* attempt is claimed again rather than refused, which is the whole
 * reason the tick is allowed to keep asking.
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
  const locale = chromeLocale(review.content, recipient.locale);

  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    idempotencyKey: weeklyReviewKey(userId, review.week_start),
    headers: unsubscribeHeaders(link),
    // Scheduled, not requested. Takes a slot from the provider rate limiter so
    // three thousand of these cannot be posted in the same second — and so that
    // somebody's password reset does not queue behind them.
    bulk: true,
    message: templates.weeklyReview({
      name: recipient.displayName,
      content: review.content,
      stats: review.stats,
      range: formatRange(review.week_start, review.week_end, locale),
      appUrl: env.appUrl,
      unsubscribeUrl: link.url,
      units: recipient.units,
      locale,
    }),
  });
}

// ---- Nudges ----------------------------------------------------------------

/**
 * A nudge, for the people who asked to hear about them.
 *
 * Three gates rather than the review's two, and the extra one is `notifyNudges`
 * defaulting to false. This is the only mail the product sends that nobody
 * scheduled and nobody triggered, so it goes out on an explicit yes and on
 * nothing else.
 *
 * The idempotency key is the nudge's own id, which is stronger than the
 * review's week key and needs to be: a nudge is not tied to a calendar period,
 * so there is no natural window to key on.
 */
export async function sendNudgeEmail(
  userId: string,
  nudge: Nudge,
  logger?: FastifyBaseLogger,
): Promise<SendResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no address');
  if (!recipient.notifyNudges) return SKIPPED('opted out');
  if (!recipient.verified) return SKIPPED('address not verified');

  const link = await unsubscribeLink(userId);
  const locale = chromeLocale(nudge.content, recipient.locale);

  return sendEmail({
    to: recipient.email,
    userId,
    logger,
    idempotencyKey: `nudge:${nudge.id}`,
    headers: unsubscribeHeaders(link),
    // Scheduled, like the review above, and paced with it.
    bulk: true,
    message: templates.nudge({
      name: recipient.displayName,
      content: nudge.content,
      appUrl: env.appUrl,
      unsubscribeUrl: link.url,
      locale,
    }),
  });
}

// ---- Formatting ------------------------------------------------------------

/**
 * Which language to draw an email in when the email is a wrapper around prose
 * somebody else wrote.
 *
 * Only the two AI-written messages call this. Everything else here is written
 * by us in all five languages, so the stored locale is both the question and
 * the answer — a verification code has no prose to disagree with.
 *
 * A nudge and a review do. They are written in the language the journal was
 * written in, on purpose (see `replyLanguage`), and that is regularly not the
 * language the interface is set to: `038_locale.sql` backfilled every account
 * that predates it to `'en'`, so a Bulgarian speaker who never opened the
 * language picker has `locale = 'en'` and a journal full of Bulgarian. Drawing
 * the chrome from the column produced exactly that email — an English "Here is
 * your week" over two Bulgarian sentences, with an English button beneath it.
 *
 * So the prose decides, and the column is the fallback for when it cannot: a
 * language the app does not ship in has no catalogue, and English chrome around
 * Italian prose is the best that is left. It is still the fallback rather than
 * the answer for the ordinary case too — somebody who *did* set the picker to
 * German and writes German gets German either way.
 */
function chromeLocale(content: string, stored: Locale): Locale {
  return proseLocale(content) ?? stored;
}

/**
 * An instant, in the reader's own timezone, in their own language, with the
 * zone named.
 *
 * The zone is not decoration. The single most useful thing a security email can
 * say is *when*, and "14:32" means nothing to someone deciding whether that was
 * them — they need to know whether it is their afternoon or somebody else's.
 *
 * The English join word is the one thing here that is not `Intl`'s to give: a
 * date-time skeleton renders "Thursday 20 August, 14:32", and the comma reads
 * as a list rather than a clause. So English gets its "at" and every other
 * language keeps the separator its own formatter chose, which is the right
 * answer in all five — inventing a join word for a language is exactly the
 * kind of thing that produces a sentence no native speaker would write.
 */
export function formatWhen(at: Date, timezone: string, locale: Locale): string {
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    hour12: false,
  });
  const formatted = formatter.format(at);
  return locale === 'en' ? formatted.replace(/,\s*(\d{2}:\d{2})/, ' at $1') : formatted;
}

/**
 * "11–17 August" where the month is shared, "28 July – 3 August" where it is
 * not — and the month named in the reader's language.
 *
 * Assembled here rather than by `formatRange` in `shared/locale.ts` because
 * this is the review's subject line and its subheading, where the year is
 * noise and the shared month is said once. `Intl.DateTimeFormat.formatRange`
 * would do the eliding itself, but it also brings the year back and puts the
 * separator wherever CLDR wants it, which is not the same shape.
 */
export function formatRange(startDate: string, endDate: string, locale: Locale): string {
  const m = emailMessages(locale);
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const day = (date: Date) => String(date.getUTCDate());
  const month = (date: Date) =>
    new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', timeZone: 'UTC' }).format(date);

  return start.getUTCMonth() === end.getUTCMonth()
    ? m['review.dayMonth'](`${day(start)}–${day(end)}`, month(end))
    : `${m['review.dayMonth'](day(start), month(start))} – ${m['review.dayMonth'](day(end), month(end))}`;
}
