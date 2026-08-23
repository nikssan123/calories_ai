import type { FastifyBaseLogger } from 'fastify';
import type { Nudge, WeeklyReview } from '@ct/shared';
import { getEmailRecipient } from '../services/user.ts';
import { pushTokensFor } from '../services/push-tokens.ts';
import { sendPush, type PushResult } from './send.ts';

/**
 * Who hears a notification on their phone, and what it says when they do.
 *
 * The sibling of `email/notify`, and deliberately the same shape: one function
 * per thing that happens, every one of them answering rather than throwing, and
 * the policy living here rather than at the call site.
 *
 * Two rules differ from the email ones, and both are about what a channel *is*.
 *
 * **Verification does not gate a push.** Mail is gated on it because an address
 * nobody has proved they can read may belong to a stranger who was typed in by
 * mistake. A push token cannot be mistyped: it was minted by this app, on a
 * device, inside a session that had already signed in. The proof is the token.
 *
 * **A push is louder than an email, so it does not get to be extra.** The
 * switches were written about mail — "at most one a week, when something in
 * your log is worth a mention" — and answering the same yes twice, once in a
 * mailbox and once as a buzz in a pocket, is how a promise about frequency
 * quietly becomes a lie. So a nudge that reaches a phone does not also reach an
 * inbox; see `nudgeReachedAPhone` and its one caller.
 *
 * The weekly review is the exception, and it earns it: the mail carries the
 * whole thing — the writing, the stats, the layout — and the push is a notice
 * that it arrived. Those are two different messages, so both may go.
 */

const SKIPPED = (reason: string): PushResult => ({ status: 'skipped', reason });

/**
 * "Your week is ready" — and no more than that.
 *
 * Deliberately not the review's opening line. A weekly review is something to
 * sit down with, and a phone notification is read at a bus stop; trying to say
 * the substance in 140 characters would only guarantee it is skimmed in the one
 * place it cannot be read properly. The push says a thing exists and where to
 * find it.
 */
export async function sendWeeklyReviewPush(
  userId: string,
  review: WeeklyReview,
  logger?: FastifyBaseLogger,
): Promise<PushResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no account');
  if (!recipient.notifyWeeklyReview) return SKIPPED('opted out');

  const devices = await pushTokensFor(userId);
  return sendPush(
    devices,
    {
      title: 'Your week is ready',
      body: recipient.displayName
        ? `${recipient.displayName}, here is how the week went.`
        : 'Here is how the week went.',
      data: { route: '/progress', review: review.id },
    },
    logger,
  );
}

/**
 * A nudge, on the phone, in full.
 *
 * The opposite decision from the review, and for the opposite reason: a nudge
 * *is* one sentence. There is nothing to go and read, so a notification that
 * only said "you have a nudge" would make somebody open an app to be told a
 * thing that had already fitted on the lock screen.
 */
export async function sendNudgePush(
  userId: string,
  nudge: Nudge,
  logger?: FastifyBaseLogger,
): Promise<PushResult> {
  const recipient = await getEmailRecipient(userId);
  if (!recipient) return SKIPPED('no account');
  if (!recipient.notifyNudges) return SKIPPED('opted out');

  const devices = await pushTokensFor(userId);
  return sendPush(
    devices,
    { title: 'Day So Far', body: nudge.content, data: { route: '/', nudge: nudge.id } },
    logger,
  );
}

/**
 * Whether the nudge got there, which is the question the mail depends on.
 *
 * A separate predicate rather than a flag threaded through the result, because
 * the caller is deciding something the sender has no opinion about: `failed`
 * and `skipped` both mean the pocket stayed quiet, and both mean the inbox
 * should not.
 */
export function nudgeReachedAPhone(result: PushResult): boolean {
  return result.status === 'sent';
}
