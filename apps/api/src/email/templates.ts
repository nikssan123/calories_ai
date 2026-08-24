import type { ReviewStats, UnitSystem } from '@ct/shared';
import { formatWeightDelta, type Locale } from '@ct/shared';
import { emailMessages, type EmailMessages } from './messages.ts';
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
/**
 * The opening line.
 *
 * Takes a catalogue rather than a locale because the two shapes it needs — with
 * a name and without — are different sentences in several languages, not one
 * sentence with an optional word: Spanish ends the greeting with a colon and
 * French does not, and neither is a substring of the other.
 */
function greeting(name: string | null, m: EmailMessages = emailMessages('en')): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? m['review.greeting'](first) : m['review.greetingNoName'];
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
            { label: 'Meals logged', value: pluralEn(counts.food_entries, 'entry', 'entries') },
            { label: 'Messages', value: pluralEn(counts.chat_messages, 'message', 'messages') },
            { label: 'Photos', value: pluralEn(counts.photos, 'photo', 'photos') },
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
 * The email is not a copy of the Progress screen, and it is not a teaser for it
 * either — it is the week, answered. Someone reading this on a phone at seven
 * in the morning should be able to close it knowing four numbers, the shape of
 * the week and whether their target moved, without tapping anything.
 *
 * So the arithmetic leads and the prose follows, truncated: the model's
 * paragraphs are the best part of the review but they are also six hundred
 * words, and an email that reprints them leaves the screen it links to with
 * nothing to offer. Every number here is already on `stats`; nothing is
 * computed twice.
 */
export function weeklyReview(input: {
  name: string | null;
  content: string;
  stats: ReviewStats;
  range: string;
  appUrl: string;
  unsubscribeUrl: string;
  /** The stats arrive in kilograms; this is what the reader's scale says. */
  units: UnitSystem;
  /**
   * Which language the chrome is in. `content` is already in it — the review
   * was generated with `languageBrief` in front of it — so this governs the
   * labels around the prose and nothing else.
   */
  locale: Locale;
}): EmailMessage {
  const { stats, units, locale } = input;
  const m = emailMessages(locale);

  const items: Array<{ label: string; value: string; hint?: string }> = [
    {
      label: m['review.daysLogged'],
      value: `${stats.days_logged}/7`,
      hint:
        stats.previous_days_logged === stats.days_logged
          ? m['review.sameAsBefore']
          : m['review.weekBefore'](stats.previous_days_logged),
    },
    {
      label: m['review.averageADay'],
      value: stats.mean_kcal === null ? '—' : `${round(stats.mean_kcal)} kcal`,
      hint: averageHint(stats),
    },
    {
      label: m['review.daysOnTarget'],
      value: `${stats.days_on_target}`,
      hint: m['review.withinTarget'](String(round(stats.target_kcal))),
    },
    /*
     * The fourth cell is whichever of the three there is something to say
     * about. A grid with a hole in it reads as a bug, and so does an em dash in
     * the last slot — but a week that had nothing on the scale usually had
     * something in the gym, and one that had neither still had protein.
     */
    ...(stats.weight_change_kg !== null
      ? [
          {
            label: m['review.weight'],
            value: formatWeightDelta(stats.weight_change_kg, units),
            hint: m['review.acrossTheWeek'],
          },
        ]
      : stats.exercise_sessions > 0
        ? [
            {
              label: m['review.burnedOver'](stats.exercise_sessions),
              value: `${round(stats.exercise_kcal)} kcal`,
              hint: m['review.onTopOfTarget'],
            },
          ]
        : [
            {
              label: m['review.proteinADay'],
              value: stats.mean_protein_g === null ? '—' : `${Math.round(stats.mean_protein_g)} g`,
              hint: m['review.proteinTarget'](String(Math.round(stats.target_protein_g))),
            },
          ]),
  ];

  const change = stats.adaptive?.eligible ? stats.adaptive : null;

  return {
    template: 'weekly_review',
    category: 'product',
    unsubscribeUrl: input.unsubscribeUrl,
    ...renderEmail({
      subject: m['review.subject'](input.range),
      preheader: summaryLine(stats, units, locale, m),
      heading: m['review.heading'],
      subheading: input.range,
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'stats', items },
        weekStrip(stats, m),
        { kind: 'rule' },
        { kind: 'subhead', text: m['review.howItRead'] },
        // Paragraph by paragraph rather than one block with newlines in it: the
        // layout renders a text block as a single `<p>`, so a joined excerpt
        // would arrive as one slab with its breaks silently gone.
        ...excerpt(input.content).map((text): Block => ({ kind: 'text', text })),
        ...(change
          ? [
              {
                kind: 'callout' as const,
                title: `Your target moved to ${round(change.proposed.kcal)} kcal`,
                text: change.explanation,
              },
            ]
          : []),
        ...(stats.top_foods.length > 0
          ? [
              { kind: 'subhead' as const, text: m['review.onRepeat'] },
              {
                kind: 'facts' as const,
                items: stats.top_foods.slice(0, 3).map((food) => ({
                  label: food.name,
                  value: `${m['review.times'](food.times)} · ${round(food.kcal)} kcal`,
                })),
              },
            ]
          : []),
        { kind: 'button', label: m['review.readWholeReview'], url: `${input.appUrl}/progress` },
      ],
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
}

/**
 * The week as seven cells, in the order the days happened.
 *
 * Built by walking the seven dates rather than by reading the array, because
 * `stats.days` only holds days that were logged — the gaps are the whole point
 * of the picture and they exist by omission. A review written before those
 * daily rows existed has none at all, and then every day reads as missing,
 * which is the honest answer for a week this email cannot see inside.
 */
function weekStrip(stats: ReviewStats, m: EmailMessages): Block {
  const band = stats.target_kcal * 0.1;
  const byDate = new Map(stats.days.map((day) => [day.local_date, day.kcal]));

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(stats.week_start, index);
    const kcal = byDate.get(date);
    return {
      label: m['review.weekdays'][new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      value: kcal === undefined ? null : round(kcal),
      tone:
        kcal === undefined
          ? ('missing' as const)
          : Math.abs(kcal - stats.target_kcal) <= band
            ? ('hit' as const)
            : ('logged' as const),
    };
  });

  const hits = days.filter((day) => day.tone === 'hit').length;
  return {
    kind: 'week',
    days,
    // Says in words what the fill says in colour, because the plain-text
    // alternative of this block has no colour to read and a caption about
    // "the green ones" would be describing something that is not there.
    caption:
      stats.days_logged === 0
        ? m['review.nothingThisWeek']
        : m['review.stripCaption'](stats.days_logged, hits),
  };
}

/** Calendar arithmetic on an ISO date, without dragging a timezone into it. */
function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** "Down 157 on the week before" — the comparison that makes a mean mean anything. */
function averageHint(stats: ReviewStats): string | undefined {
  if (stats.mean_kcal === null || stats.previous_mean_kcal === null) return undefined;
  const delta = Math.round(stats.mean_kcal - stats.previous_mean_kcal);
  if (delta === 0) return 'level with the week before';
  return `${delta > 0 ? 'up' : 'down'} ${round(Math.abs(delta))} on the week before`;
}

/** Thousands separated, because four-figure calories are read, not parsed. */
function round(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

/**
 * A nudge, in the inbox.
 *
 * No stats block and no excerpt, unlike the review above: the whole nudge is
 * two sentences, so anything wrapped around it would be more chrome than
 * message. The subject carries the sentence rather than a label, because a
 * subject line reading "A note from Day So Far" tells nobody whether to open it.
 */
export function nudge(input: {
  name: string | null;
  content: string;
  appUrl: string;
  unsubscribeUrl: string;
}): EmailMessage {
  return {
    template: 'nudge',
    category: 'product',
    unsubscribeUrl: input.unsubscribeUrl,
    ...renderEmail({
      subject: subjectFrom(input.content),
      preheader: input.content,
      heading: 'A quick note',
      blocks: [
        { kind: 'text', text: greeting(input.name) },
        { kind: 'text', text: input.content },
        { kind: 'button', label: 'Open the journal', url: input.appUrl },
      ],
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
}

/** The nudge's first sentence, trimmed to something a mail client will show whole. */
function subjectFrom(content: string): string {
  const first = content.trim().split(/(?<=[.!?])\s+/)[0] ?? content.trim();
  return first.length > 78 ? `${first.slice(0, 75).trimEnd()}…` : first;
}

/**
 * The first two paragraphs, as paragraphs, and a marker if there were more.
 *
 * Returns the list rather than a joined string because the layout's text block
 * is one `<p>`: handing it a blob with blank lines in it produces a slab of
 * HTML with the breaks gone, and the review's paragraphing is most of what
 * makes it readable.
 */
function excerpt(content: string, paragraphs = 2): string[] {
  const parts = content
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const head = parts.slice(0, paragraphs);
  return parts.length > paragraphs ? [...head, '…'] : head;
}

function summaryLine(
  stats: ReviewStats,
  units: UnitSystem,
  locale: Locale,
  m: EmailMessages,
): string {
  if (stats.mean_kcal === null) return m['review.summaryNoMean'](stats.days_logged);
  const weight =
    stats.weight_change_kg === null
      ? ''
      : m['review.summaryWeight'](formatWeightDelta(stats.weight_change_kg, units));
  return m['review.summary'](stats.days_logged, Math.round(stats.mean_kcal), weight);
}

/**
 * English's two forms, for the templates that are still only in English.
 *
 * Named for the language it knows rather than for the job, because that is the
 * whole of its correctness: it hardcodes English's *categories* and English's
 * *vocabulary*, and using it inside a translated template is what put "5 days
 * logged" in the middle of a Bulgarian review. The weekly review now takes its
 * plurals from `email/messages.ts`; the transactional mail below has not been
 * translated yet, and until it is, this is right for it.
 */
function pluralEn(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
