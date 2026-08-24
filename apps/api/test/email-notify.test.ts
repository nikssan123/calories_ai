import { describe, expect, it } from 'vitest';
import type { ReviewStats, WeeklyReview } from '@ct/shared';
import { query } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  formatRange,
  formatWhen,
  sendAccountDeletedEmail,
  sendAccountStatusEmail,
  sendNewSignInEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWeeklyReviewEmail,
} from '../src/email/notify.ts';
import * as templates from '../src/email/templates.ts';
import { createUser } from './helpers/factories.ts';
import { lastEmail, mailbox } from './helpers/email.ts';

/**
 * The rules about who hears about what. The templates themselves are asserted
 * here too, but only through the layer that chooses them — what matters is not
 * that a function returns a string, it is that the right person gets it.
 */

/** `createUser` grandfathers accounts as verified, matching the migration. */
async function unverified(): Promise<Awaited<ReturnType<typeof createUser>>> {
  const user = await createUser();
  await query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [user.id]);
  return user;
}

const STATS: ReviewStats = {
  week_start: '2026-08-10',
  week_end: '2026-08-16',
  days_logged: 6,
  mean_kcal: 2143.4,
  mean_protein_g: 152,
  target_kcal: 2200,
  target_protein_g: 160,
  days_on_target: 4,
  days_protein_hit: 3,
  // A real week, so the strip in the email has gaps and hits to draw: Thursday
  // was never logged, and four of the six landed inside the band — which is
  // what `days_on_target` above says, and the two have to agree or the picture
  // contradicts the number printed beside it.
  days: [
    { local_date: '2026-08-10', kcal: 2180, protein_g: 155 },
    { local_date: '2026-08-11', kcal: 2240, protein_g: 160 },
    { local_date: '2026-08-12', kcal: 2050, protein_g: 141 },
    { local_date: '2026-08-14', kcal: 2205, protein_g: 158 },
    { local_date: '2026-08-15', kcal: 2620, protein_g: 149 },
    { local_date: '2026-08-16', kcal: 1725, protein_g: 149 },
  ],
  previous_mean_kcal: 2300,
  previous_days_logged: 5,
  weight_start_kg: 84.2,
  weight_end_kg: 83.6,
  weight_change_kg: -0.6,
  exercise_sessions: 2,
  exercise_kcal: 610,
  top_foods: [],
  highest_day: null,
  lowest_day: null,
  adaptive: null,
};

function review(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    week_start: '2026-08-10',
    week_end: '2026-08-16',
    content: 'You logged six days.\n\nProtein was the weak spot.\n\nAim for one more day.',
    stats: STATS,
    message_id: null,
    created_at: '2026-08-17T05:00:00.000Z',
    ...overrides,
  };
}

describe('sendVerificationEmail', () => {
  it('emails a code and a link, both against one row', async () => {
    const user = await unverified();
    expect(await sendVerificationEmail(user.id)).toMatchObject({ status: 'sent' });

    const message = lastEmail()!;
    const code = /\b(\d{6})\b/.exec(message.text)?.[1];
    expect(code).toBeDefined();
    expect(message.text).toMatch(/\/verify\?token=\S+/);
    // The code leads the subject: a subject is the part you can read off a
    // notification without unlocking anything.
    expect(message.subject).toBe(`${code} is your Day So Far confirmation code`);

    // One row, two ways in — which is what makes spending either spend both.
    const rows = await query('SELECT 1 FROM auth_tokens WHERE purpose = $1', [
      'email_verification',
    ]);
    expect(rows).toHaveLength(1);
  });

  it('does nothing for an address that is already confirmed', async () => {
    const user = await createUser();
    expect(await sendVerificationEmail(user.id)).toMatchObject({
      status: 'skipped',
      reason: 'already verified',
    });
    expect(mailbox()).toHaveLength(0);
  });

  it('does nothing for the pre-accounts row, which has no address', async () => {
    const rows = await query<{ id: string }>(
      "INSERT INTO users (timezone) VALUES ('UTC') RETURNING id",
    );
    expect(await sendVerificationEmail(rows[0]!.id)).toMatchObject({ status: 'skipped' });
    expect(mailbox()).toHaveLength(0);
  });
});

describe('sendPasswordResetEmail', () => {
  it('emails a reset link and says how long it lasts', async () => {
    const user = await createUser();
    expect(await sendPasswordResetEmail(user.email)).toMatchObject({ status: 'sent' });

    const message = lastEmail()!;
    expect(message.subject).toBe('Reset your password');
    expect(message.text).toMatch(/\/reset\?token=\S+/);
    expect(message.text).toContain('60 minutes');
  });

  it('is silent for an address with no account', async () => {
    expect(await sendPasswordResetEmail('nobody@example.test')).toMatchObject({
      status: 'skipped',
      reason: 'no such account',
    });
    expect(mailbox()).toHaveLength(0);
    expect(await query('SELECT 1 FROM auth_tokens')).toHaveLength(0);
  });

  it('finds the account whatever case the address was typed in', async () => {
    const user = await createUser({ email: 'Nik@Example.test' });
    expect(await sendPasswordResetEmail('nik@EXAMPLE.test')).toMatchObject({ status: 'sent' });
    // Addressed as it was registered, not as it was typed.
    expect(lastEmail()!.to).toBe(user.email);
  });
});

describe('security notices', () => {
  it('tells someone their password changed, and when', async () => {
    const user = await createUser({ timezone: 'Europe/Sofia', display_name: 'Nik Lyutov' });
    await sendPasswordChangedEmail(user.id, new Date('2026-08-20T11:32:00Z'));

    const message = lastEmail()!;
    expect(message.subject).toBe('Your password was changed');
    expect(message.text).toContain('Hi Nik,');
    // 11:32 UTC is 14:32 in Sofia — the reader's own clock, or the fact is useless.
    expect(message.text).toContain('14:32');
    expect(message.text).toContain('If this was not you');
  });

  it('reports a new sign-in with the device and the address', async () => {
    const user = await createUser();
    await sendNewSignInEmail(user.id, {
      device: 'Chrome on Windows',
      ip: '203.0.113.9',
      at: new Date('2026-08-20T11:32:00Z'),
    });

    const message = lastEmail()!;
    expect(message.subject).toBe('New sign-in to Day So Far');
    expect(message.text).toContain('Chrome on Windows');
    expect(message.text).toContain('203.0.113.9');
  });

  it('omits the address line when there is no address to report', async () => {
    const user = await createUser();
    await sendNewSignInEmail(user.id, { device: 'Firefox', ip: null, at: new Date() });

    expect(lastEmail()!.text).not.toContain('IP address');
  });

  it('opens without a name when the account has none', async () => {
    const user = await createUser({ display_name: null });
    await sendPasswordChangedEmail(user.id, new Date());

    // Never "Hi null,".
    expect(lastEmail()!.text).toContain('Hi,');
    expect(lastEmail()!.text).not.toContain('null');
  });
});

describe('account notices', () => {
  it('itemises what a deletion destroyed', async () => {
    await sendAccountDeletedEmail({
      email: 'gone@example.test',
      name: 'Nik',
      counts: { food_entries: 412, chat_messages: 1, photos: 0 },
    });

    const message = lastEmail()!;
    expect(message.to).toBe('gone@example.test');
    expect(message.subject).toBe('Your account has been deleted');
    // Counts are checkable; "your data has been removed" is not.
    expect(message.text).toContain('412 entries');
    expect(message.text).toContain('1 message');
    expect(message.text).toContain('0 photos');
  });

  it('says a suspension changed nothing about the data', async () => {
    const user = await createUser();
    await sendAccountStatusEmail(user.id, true);

    expect(lastEmail()!.subject).toBe('Your account has been suspended');
    expect(lastEmail()!.text).toContain('Nothing has been deleted');
  });

  it('says when the account is back, with a way in', async () => {
    const user = await createUser();
    await sendAccountStatusEmail(user.id, false);

    expect(lastEmail()!.subject).toBe('Your account is active again');
    expect(lastEmail()!.text).toContain(`${env.appUrl}/login`);
  });
});

describe('sendWeeklyReviewEmail', () => {
  it('leads with the numbers and links to the screen the rest lives on', async () => {
    const user = await createUser({ display_name: 'Nik' });
    expect(await sendWeeklyReviewEmail(user.id, review())).toMatchObject({ status: 'sent' });

    const message = lastEmail()!;
    expect(message.subject).toBe('Your week: 10–16 August');
    expect(message.text).toContain('You logged six days.');
    expect(message.text).toContain(`${env.appUrl}/progress`);
    expect(message.text).toContain('Days logged: 6/7');
    expect(message.text).toContain('2,143 kcal');
    expect(message.text).toContain('-0.6 kg');
  });

  it('says what each figure is next to, so a number means something', async () => {
    const user = await createUser();
    await sendWeeklyReviewEmail(user.id, review());

    const message = lastEmail()!;
    // A mean with nothing beside it is a number; a mean with last week's beside
    // it is the only part of this email that says whether anything is moving.
    expect(message.text).toContain('down 157 on the week before');
    expect(message.text).toContain('5 the week before');
    expect(message.text).toContain('within 10% of 2,200 kcal');
  });

  it('draws the week as seven days, gaps and all', async () => {
    const user = await createUser();
    await sendWeeklyReviewEmail(user.id, review());

    const message = lastEmail()!;
    // Thursday is the day the fixture never logged, and it has to survive as a
    // gap rather than being dropped out of the row.
    expect(message.text).toMatch(/Thu\s+—/);
    expect(message.text).toMatch(/Mon\s+2,180\s+\(on target\)/);
    expect(message.text).toContain('6 days logged, 4 of them within 10% of target.');
  });

  it('truncates the prose rather than reprinting the whole screen', async () => {
    const user = await createUser();
    await sendWeeklyReviewEmail(user.id, review());

    expect(lastEmail()!.text).toContain('Protein was the weak spot.');
    expect(lastEmail()!.text).not.toContain('Aim for one more day.');
    expect(lastEmail()!.text).toContain('…');
  });

  it('carries an unsubscribe link and the headers a mail client acts on', async () => {
    const user = await createUser();
    await sendWeeklyReviewEmail(user.id, review());

    const message = lastEmail()!;
    expect(message.text).toMatch(/Turn off weekly emails: \S+\/unsubscribe\?u=\S+&s=\S+/);
    expect(message.headers).toMatchObject({
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(message.headers!['List-Unsubscribe']).toMatch(/^<.*\/api\/email\/unsubscribe\?u=.*>$/);
  });

  it('respects an opt-out', async () => {
    const user = await createUser({ notify_weekly_review: false });
    expect(await sendWeeklyReviewEmail(user.id, review())).toMatchObject({
      status: 'skipped',
      reason: 'opted out',
    });
    expect(mailbox()).toHaveLength(0);
  });

  it('will not send recurring mail to an unproved address', async () => {
    const user = await unverified();
    // The address may belong to a stranger who was typed in by mistake, and a
    // weekly email is what turns that mistake into a spam complaint.
    expect(await sendWeeklyReviewEmail(user.id, review())).toMatchObject({
      status: 'skipped',
      reason: 'address not verified',
    });
    expect(mailbox()).toHaveLength(0);
  });

  it('sends the same week only once, however often the tick runs', async () => {
    const user = await createUser();
    await sendWeeklyReviewEmail(user.id, review());
    expect(await sendWeeklyReviewEmail(user.id, review())).toMatchObject({ status: 'skipped' });

    expect(mailbox()).toHaveLength(1);
  });

  it('still sends the following week', async () => {
    const user = await createUser();
    await sendWeeklyReviewEmail(user.id, review());
    await sendWeeklyReviewEmail(user.id, review({ week_start: '2026-08-17', week_end: '2026-08-23' }));

    expect(mailbox()).toHaveLength(2);
  });
});

describe('the weekly template’s own edge cases', () => {
  it('copes with a week that has no numbers in it', () => {
    const message = templates.weeklyReview({
      name: null,
      content: 'Nothing to report.',
      stats: { ...STATS, days_logged: 0, mean_kcal: null, weight_change_kg: null },
      range: '10–16 August',
      appUrl: 'https://example.test',
      unsubscribeUrl: 'https://example.test/unsubscribe',
      units: 'metric',
    });

    expect(message.text).toContain('Average a day: —');
    expect(message.text).not.toContain('Weight:');
    expect(message.text).toContain('Days logged: 0/7');
  });

  it('boxes off a target change, and says nothing when there was none', () => {
    const base = {
      name: null,
      content: 'x',
      range: '10–16 August',
      appUrl: 'https://example.test',
      unsubscribeUrl: 'https://example.test/u',
      units: 'metric' as const,
    };

    expect(templates.weeklyReview({ ...base, stats: STATS }).text).not.toContain('target moved');

    const moved = templates.weeklyReview({
      ...base,
      stats: {
        ...STATS,
        adaptive: {
          eligible: true,
          blocked_by: null,
          estimate: null,
          current: { kcal: 2200, protein_g: 160, carbs_g: 220, fat_g: 70, is_custom: false, source: 'calculated' as const },
          proposed: { kcal: 2320, protein_g: 160, carbs_g: 240, fat_g: 74, is_custom: false, source: 'adaptive' as const },
          delta_kcal: 120,
          explanation: 'You lost faster than the plan asked for.',
        },
      },
    });
    // Wrapped at 72 like every other paragraph, so the assertion is on a
    // fragment that a line break cannot land inside.
    expect(moved.text).toContain('Your target moved to 2,320 kcal');
    expect(moved.text).toContain('You lost faster than the plan');
  });

  it('signs a gain as well as a loss', () => {
    const gained = templates.weeklyReview({
      name: null,
      content: 'x',
      stats: { ...STATS, weight_change_kg: 0.4 },
      range: '10–16 August',
      appUrl: 'https://example.test',
      unsubscribeUrl: 'https://example.test/u',
      units: 'metric',
    });
    expect(gained.text).toContain('+0.4 kg');
  });
});

describe('an account with nowhere to write to', () => {
  /**
   * The pre-accounts placeholder row, and — one day — a provider-only sign-in.
   * Every notifier has to survive it, because most of them are called from a
   * path that has no reason to have checked.
   */
  it('is skipped by every notifier rather than throwing', async () => {
    const rows = await query<{ id: string }>(
      "INSERT INTO users (timezone) VALUES ('UTC') RETURNING id",
    );
    const id = rows[0]!.id;

    expect(await sendPasswordChangedEmail(id, new Date())).toMatchObject({ status: 'skipped' });
    expect(
      await sendNewSignInEmail(id, { device: 'Firefox', ip: null, at: new Date() }),
    ).toMatchObject({ status: 'skipped' });
    expect(await sendAccountStatusEmail(id, true)).toMatchObject({ status: 'skipped' });
    expect(await sendWeeklyReviewEmail(id, review())).toMatchObject({ status: 'skipped' });
    expect(mailbox()).toHaveLength(0);
  });
});

describe('formatWhen', () => {
  it('renders the reader’s own wall clock, with the zone named', () => {
    const at = new Date('2026-08-20T11:32:00Z');

    expect(formatWhen(at, 'Europe/Sofia')).toContain('14:32');
    expect(formatWhen(at, 'UTC')).toContain('11:32');
    expect(formatWhen(at, 'America/New_York')).toContain('07:32');
    // The weekday and the zone are what make the time judgeable.
    expect(formatWhen(at, 'UTC')).toContain('Thursday');
    expect(formatWhen(at, 'UTC')).toMatch(/UTC|GMT/);
    expect(formatWhen(at, 'UTC')).toContain(' at ');
  });
});

describe('formatRange', () => {
  it('names the month once when the week does not cross one', () => {
    expect(formatRange('2026-08-10', '2026-08-16')).toBe('10–16 August');
  });

  it('names both when it does', () => {
    expect(formatRange('2026-07-28', '2026-08-03')).toBe('28 July – 3 August');
  });
});
