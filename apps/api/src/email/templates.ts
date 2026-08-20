import type { ReviewStats } from '@ct/shared';
import { type Block, type RenderedEmail, renderEmail } from './layout.ts';

/**
 * Every message this server sends, in one file.
 *
 * They are pure: data in, subject and body out, no database and no clock. That
 * is what makes the copy reviewable in a diff and testable without a mail
 * server — and it keeps the decision about *whether* to send in the caller,
 * where the surrounding facts are.
 *
 * The house rules for the copy:
 *
 * - Say what happened before saying what to do about it. Someone reading a
 *   security email on a phone screen wants the fact first.
 * - Every security email ends by saying what to do if it was not them. An
 *   alert with no next step is just an anxiety delivery service.
 * - No urgency theatre, no "action required", no exclamation marks. The
 *   product's voice is a quiet one and the inbox should sound like the app.
 */

export type EmailCategory =
  /** About the account's safety. Always sent — there is nothing to opt out of. */
  | 'security'
  /** About the account itself: confirmations of things the owner did. */
  | 'account'
  /** Something the product decided to send. Subject to preferences. */
  | 'product';

export interface EmailMessage extends RenderedEmail {
  /** Recorded against the delivery, so the log reads as a list of events. */
  template: string;
  category: EmailCategory;
  /** Present exactly when the category is 'product'. */
  unsubscribeUrl?: string;
}

/** A first name to open with, or nothing — never "Hi null". */
function greeting(name: string | null): string {
  return name?.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : 'Hi,';
}

const IF_NOT_YOU =
  'If this was not you, change your password now — and if you cannot get in, reply to this email.';

// ---- Verification ----------------------------------------------------------

export function verifyEmail(input: {
  name: string | null;
  url: string;
  code: string;
}): EmailMessage {
  return {
    template: 'verify_email',
    category: 'account',
    ...renderEmail({
      // The code is in the subject line as well as the body, because a subject
      // is the part you can read from a notification without unlocking anything.
      subject: `${input.code} is your Day So Far confirmation code`,
      preheader: `Enter ${input.code} to finish setting up your account.`,
      heading: 'Confirm your email',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        {
          kind: 'text',
          text: 'Welcome to Day So Far. Enter this code to finish setting up your account:',
        },
        { kind: 'code', value: input.code },
        {
          kind: 'note',
          text: 'The code lasts 24 hours and works five times at most. Asking for a new one replaces it.',
        },
        {
          kind: 'text',
          text: 'Reading this on the same device you signed up on? The button does the same job without the typing.',
        },
        { kind: 'button', label: 'Confirm email', url: input.url },
        {
          kind: 'text',
          text: 'If you did not create an account, nothing has been set up in your name; ignore this and the address will be released.',
        },
      ],
    }),
  };
}

// ---- Passwords -------------------------------------------------------------

export function passwordReset(input: {
  name: string | null;
  url: string;
  expiresInMinutes: number;
}): EmailMessage {
  return {
    template: 'password_reset',
    category: 'security',
    ...renderEmail({
      subject: 'Reset your password',
      preheader: `Choose a new password. The link is good for ${input.expiresInMinutes} minutes.`,
      heading: 'Reset your password',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        { kind: 'text', text: 'Someone asked to reset the password on this account. If it was you, pick a new one here.' },
        { kind: 'button', label: 'Choose a new password', url: input.url },
        {
          kind: 'note',
          text: `The link expires in ${input.expiresInMinutes} minutes and can only be used once.`,
        },
        {
          kind: 'text',
          text:
            'If it was not you, you can ignore this — your password has not changed and ' +
            'nobody can get in without this link.',
        },
      ],
    }),
  };
}

export function passwordChanged(input: { name: string | null; when: string }): EmailMessage {
  return {
    template: 'password_changed',
    category: 'security',
    ...renderEmail({
      subject: 'Your password was changed',
      preheader: 'Every other device has been signed out.',
      heading: 'Your password was changed',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        {
          kind: 'text',
          text: 'The password on your account has just been changed, and every device that was signed in has been signed out.',
        },
        { kind: 'facts', items: [{ label: 'Changed', value: input.when }] },
        { kind: 'text', text: IF_NOT_YOU },
      ],
    }),
  };
}

// ---- Sessions --------------------------------------------------------------

export function newSignIn(input: {
  name: string | null;
  when: string;
  device: string;
  ip: string | null;
}): EmailMessage {
  return {
    template: 'new_sign_in',
    category: 'security',
    ...renderEmail({
      subject: 'New sign-in to Day So Far',
      preheader: `A device we have not seen before signed in — ${input.device}.`,
      heading: 'New sign-in',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        { kind: 'text', text: 'Your account was signed into from a device we have not seen before.' },
        {
          kind: 'facts',
          items: [
            { label: 'When', value: input.when },
            { label: 'Device', value: input.device },
            ...(input.ip ? [{ label: 'IP address', value: input.ip }] : []),
          ],
        },
        {
          kind: 'text',
          text: 'If that was you, there is nothing to do — you will not get this again from the same browser.',
        },
        { kind: 'text', text: IF_NOT_YOU },
      ],
    }),
  };
}

// ---- The account itself ----------------------------------------------------

export function accountDeleted(input: {
  name: string | null;
  counts: { food_entries: number; chat_messages: number; photos: number };
}): EmailMessage {
  const { counts } = input;
  return {
    template: 'account_deleted',
    category: 'account',
    ...renderEmail({
      subject: 'Your account has been deleted',
      preheader: 'Everything on it is gone. This is the last email you will get from us.',
      heading: 'Your account has been deleted',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        {
          kind: 'text',
          // Named rather than summarised: "your data has been removed" is what
          // every company says and nobody believes. Counts are checkable.
          text: 'Your account and everything in it has been permanently deleted. For your records, that was:',
        },
        {
          kind: 'facts',
          items: [
            { label: 'Meals logged', value: plural(counts.food_entries, 'entry', 'entries') },
            { label: 'Messages', value: plural(counts.chat_messages, 'message', 'messages') },
            { label: 'Photos', value: plural(counts.photos, 'photo', 'photos') },
          ],
        },
        {
          kind: 'text',
          text: 'Nothing was kept and nothing can be restored, including by us. This is the last email you will receive.',
        },
        { kind: 'text', text: 'Thanks for having given it a go.' },
      ],
    }),
  };
}

export function accountSuspended(input: { name: string | null }): EmailMessage {
  return {
    template: 'account_suspended',
    category: 'account',
    ...renderEmail({
      subject: 'Your account has been suspended',
      preheader: 'You have been signed out on every device. Your data is untouched.',
      heading: 'Your account has been suspended',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        {
          kind: 'text',
          text: 'An administrator has suspended your account, so you have been signed out everywhere and cannot sign back in for now.',
        },
        {
          kind: 'text',
          text: 'Nothing has been deleted — every meal, photo and conversation is exactly where you left it, and comes back with the account.',
        },
        { kind: 'text', text: 'Reply to this email if you think this is a mistake.' },
      ],
    }),
  };
}

export function accountRestored(input: { name: string | null; appUrl: string }): EmailMessage {
  return {
    template: 'account_restored',
    category: 'account',
    ...renderEmail({
      subject: 'Your account is active again',
      preheader: 'You can sign back in, and everything is where you left it.',
      heading: 'Your account is active again',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        { kind: 'text', text: 'The suspension on your account has been lifted. You can sign back in, and nothing was lost while it was off.' },
        { kind: 'button', label: 'Sign in', url: `${input.appUrl}/login` },
      ],
    }),
  };
}

// ---- The weekly review -----------------------------------------------------

/**
 * Monday's review, in the inbox.
 *
 * The prose is the agent's, quoted rather than paraphrased, and it is truncated
 * rather than sent whole: the email exists to get someone back into the app on
 * the one morning of the week there is something new to read, not to replace
 * the screen it lives on.
 */
export function weeklyReview(input: {
  name: string | null;
  content: string;
  stats: ReviewStats;
  range: string;
  appUrl: string;
  unsubscribeUrl: string;
}): EmailMessage {
  const { stats } = input;

  const items: Array<{ label: string; value: string }> = [
    { label: 'Days logged', value: `${stats.days_logged}/7` },
    {
      label: 'Average a day',
      value: stats.mean_kcal === null ? '—' : `${Math.round(stats.mean_kcal)} kcal`,
    },
    { label: 'On target', value: `${stats.days_on_target} days` },
  ];
  if (stats.weight_change_kg !== null) {
    items.push({ label: 'Weight', value: signed(stats.weight_change_kg) });
  }

  return {
    template: 'weekly_review',
    category: 'product',
    unsubscribeUrl: input.unsubscribeUrl,
    ...renderEmail({
      subject: `Your week: ${input.range}`,
      preheader: summaryLine(stats),
      heading: 'Last week, in review',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        { kind: 'stats', items },
        { kind: 'quote', text: excerpt(input.content) },
        { kind: 'button', label: 'Read the full review', url: `${input.appUrl}/progress` },
      ],
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
}

/** The first two paragraphs, and a marker if there was more. */
function excerpt(content: string, paragraphs = 2): string {
  const parts = content.trim().split(/\n{2,}/);
  const head = parts.slice(0, paragraphs).join('\n\n');
  return parts.length > paragraphs ? `${head}\n\n…` : head;
}

function summaryLine(stats: ReviewStats): string {
  if (stats.mean_kcal === null) return `${stats.days_logged} days logged.`;
  const weight =
    stats.weight_change_kg === null ? '' : `, weight ${signed(stats.weight_change_kg)}`;
  return `${stats.days_logged} days logged, averaging ${Math.round(stats.mean_kcal)} kcal${weight}.`;
}

function signed(kg: number): string {
  return `${kg > 0 ? '+' : ''}${kg.toFixed(1)} kg`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
