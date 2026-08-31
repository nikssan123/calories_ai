import type { ReviewStats, UnitSystem } from '@ct/shared';
import { formatNumber, formatWeightDelta, type Locale } from '@ct/shared';
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
 * - **No string is written down here.** Every template takes a `locale` and
 *   reads its words out of `email/messages.ts`, including the ones that used to
 *   look too small to bother with — a button label, a fact's label, "IP
 *   address". A template that keeps one English sentence sends an email that is
 *   mostly translated, which reads worse than one that is not translated at
 *   all. What is left in this file is the shape of each message and the
 *   decisions about which blocks appear.
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
 *
 * The catalogue is required. It used to default to English, which is exactly
 * how a translated template ended up opening in the wrong language.
 */
function greeting(name: string | null, m: EmailMessages): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? m['review.greeting'](first) : m['review.greetingNoName'];
}

// ---- Verification ----------------------------------------------------------

export function verifyEmail(input: {
  name: string | null;
  url: string;
  code: string;
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'verify_email',
    category: 'account',
    ...renderEmail({
      locale: input.locale,
      subject: m['verify.subject'](input.code),
      preheader: m['verify.preheader'](input.code),
      heading: m['verify.heading'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['verify.intro'] },
        { kind: 'code', value: input.code },
        { kind: 'note', text: m['verify.codeNote'] },
        { kind: 'text', text: m['verify.buttonHint'] },
        { kind: 'button', label: m['verify.button'], url: input.url },
        { kind: 'text', text: m['verify.notYou'] },
      ],
    }),
  };
}

// ---- Passwords -------------------------------------------------------------

export function passwordReset(input: {
  name: string | null;
  url: string;
  expiresInMinutes: number;
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'password_reset',
    category: 'security',
    ...renderEmail({
      locale: input.locale,
      // Subject and heading are the same sentence here, so they read the same
      // key rather than the catalogue carrying it twice. See `messages.ts`.
      subject: m['reset.subject'],
      preheader: m['reset.preheader'](input.expiresInMinutes),
      heading: m['reset.subject'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['reset.intro'] },
        { kind: 'button', label: m['reset.button'], url: input.url },
        { kind: 'note', text: m['reset.expiry'](input.expiresInMinutes) },
        { kind: 'text', text: m['reset.notYou'] },
      ],
    }),
  };
}

export function passwordChanged(input: {
  name: string | null;
  when: string;
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'password_changed',
    category: 'security',
    ...renderEmail({
      locale: input.locale,
      subject: m['changed.subject'],
      preheader: m['changed.preheader'],
      heading: m['changed.subject'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['changed.body'] },
        { kind: 'facts', items: [{ label: m['changed.whenLabel'], value: input.when }] },
        { kind: 'text', text: m['common.ifNotYou'] },
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
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'new_sign_in',
    category: 'security',
    ...renderEmail({
      locale: input.locale,
      subject: m['signin.subject'],
      preheader: m['signin.preheader'](input.device),
      heading: m['signin.heading'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['signin.body'] },
        {
          kind: 'facts',
          items: [
            { label: m['signin.whenLabel'], value: input.when },
            { label: m['signin.deviceLabel'], value: input.device },
            ...(input.ip ? [{ label: m['signin.ipLabel'], value: input.ip }] : []),
          ],
        },
        { kind: 'text', text: m['signin.wasYou'] },
        { kind: 'text', text: m['common.ifNotYou'] },
      ],
    }),
  };
}

// ---- The account itself ----------------------------------------------------

export function accountDeleted(input: {
  name: string | null;
  counts: { food_entries: number; chat_messages: number; photos: number };
  locale: Locale;
}): EmailMessage {
  const { counts } = input;
  const m = emailMessages(input.locale);
  return {
    template: 'account_deleted',
    category: 'account',
    ...renderEmail({
      locale: input.locale,
      subject: m['deleted.subject'],
      preheader: m['deleted.preheader'],
      heading: m['deleted.subject'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['deleted.intro'] },
        {
          kind: 'facts',
          items: [
            { label: m['deleted.mealsLabel'], value: m['deleted.mealsValue'](counts.food_entries) },
            {
              label: m['deleted.messagesLabel'],
              value: m['deleted.messagesValue'](counts.chat_messages),
            },
            { label: m['deleted.photosLabel'], value: m['deleted.photosValue'](counts.photos) },
          ],
        },
        { kind: 'text', text: m['deleted.nothingKept'] },
        { kind: 'text', text: m['deleted.thanks'] },
      ],
    }),
  };
}

export function accountSuspended(input: {
  name: string | null;
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'account_suspended',
    category: 'account',
    ...renderEmail({
      locale: input.locale,
      subject: m['suspended.subject'],
      preheader: m['suspended.preheader'],
      heading: m['suspended.subject'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['suspended.body'] },
        { kind: 'text', text: m['suspended.dataSafe'] },
        { kind: 'text', text: m['suspended.mistake'] },
      ],
    }),
  };
}

export function accountRestored(input: {
  name: string | null;
  appUrl: string;
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'account_restored',
    category: 'account',
    ...renderEmail({
      locale: input.locale,
      subject: m['restored.subject'],
      preheader: m['restored.preheader'],
      heading: m['restored.subject'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: m['restored.body'] },
        { kind: 'button', label: m['restored.button'], url: `${input.appUrl}/login` },
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
      value: stats.mean_kcal === null ? '—' : `${round(stats.mean_kcal, locale)} kcal`,
      hint: averageHint(stats, locale, m),
    },
    {
      label: m['review.daysOnTarget'],
      value: `${stats.days_on_target}`,
      hint: m['review.withinTarget'](round(stats.target_kcal, locale)),
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
              value: `${round(stats.exercise_kcal, locale)} kcal`,
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
      locale,
      subject: m['review.subject'](input.range),
      preheader: summaryLine(stats, units, locale, m),
      heading: m['review.heading'],
      subheading: input.range,
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'stats', items },
        weekStrip(stats, locale, m),
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
                title: m['review.targetMoved'](round(change.proposed.kcal, locale)),
                // The model wrote this one, in the reader's language already.
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
                  value: `${m['review.times'](food.times)} · ${round(food.kcal, locale)} kcal`,
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
function weekStrip(stats: ReviewStats, locale: Locale, m: EmailMessages): Block {
  const band = stats.target_kcal * 0.1;
  const byDate = new Map(stats.days.map((day) => [day.local_date, day.kcal]));

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(stats.week_start, index);
    const kcal = byDate.get(date);
    return {
      label: m['review.weekdays'][new Date(`${date}T00:00:00Z`).getUTCDay()]!,
      value: kcal === undefined ? null : round(kcal, locale),
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

/**
 * "Down 157 on the week before" — the comparison that makes a mean mean anything.
 *
 * Three catalogue entries rather than one sentence with a signed number in it:
 * a direction is a word in some languages and a suffix in others, and there is
 * no way to translate "up"/"down" on its own that survives being dropped into
 * a sentence built here.
 */
function averageHint(
  stats: ReviewStats,
  locale: Locale,
  m: EmailMessages,
): string | undefined {
  if (stats.mean_kcal === null || stats.previous_mean_kcal === null) return undefined;
  const delta = Math.round(stats.mean_kcal - stats.previous_mean_kcal);
  if (delta === 0) return m['review.averageLevel'];
  const size = round(Math.abs(delta), locale);
  return delta > 0 ? m['review.averageUp'](size) : m['review.averageDown'](size);
}

/**
 * Thousands separated, because four-figure calories are read, not parsed — and
 * separated the way the reader's language does it, which is a space in
 * Bulgarian and French and a full stop in German, not always a comma.
 */
function round(value: number, locale: Locale): string {
  return formatNumber(Math.round(value), locale);
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
  /**
   * The chrome's language. `content` is already in it — a nudge is written by
   * the model, with `languageBrief` in front of it, like the review's prose —
   * so this governs the greeting, the heading and the button.
   */
  locale: Locale;
}): EmailMessage {
  const m = emailMessages(input.locale);
  return {
    template: 'nudge',
    category: 'product',
    unsubscribeUrl: input.unsubscribeUrl,
    ...renderEmail({
      locale: input.locale,
      subject: subjectFrom(input.content),
      preheader: input.content,
      heading: m['nudge.heading'],
      blocks: [
        { kind: 'text', text: greeting(input.name, m) },
        { kind: 'text', text: input.content },
        { kind: 'button', label: m['nudge.button'], url: input.appUrl },
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
