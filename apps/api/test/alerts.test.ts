import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALES, type Locale } from '@ct/shared';
import { emailMessages } from '../src/email/messages.ts';
import { query } from '../src/db.ts';
import { runDueAlerts } from '../src/scheduler.ts';
import {
  dueAlert,
  listAlerts,
  MILESTONE_HOUR,
  saveAlert,
  STREAK_MILESTONES,
} from '../src/services/alerts.ts';
import { saveNudge } from '../src/services/nudges.ts';
import { registerPushToken } from '../src/services/push-tokens.ts';
import { addDays } from '../src/time.ts';
import { addMeal, addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * The notifications nobody writes.
 *
 * Two things are worth testing here and they pull in opposite directions. One
 * is that these reach the accounts the model-written ones never could — a free
 * tier that hears nothing is the whole reason this exists. The other is that
 * arriving for free does not mean arriving often: a congratulation is still an
 * interruption, and it spends the same weekly allowance a nudge does.
 */

/** 20:30 on Thursday 19 March 2026 in Sofia (UTC+2) — past the milestone hour. */
const EVENING = new Date('2026-03-19T18:30:00Z');
/** 21:30 the same evening, which is past the recap hour as well. */
const LATE = new Date('2026-03-19T19:30:00Z');
/** 11:00 the same day. Past the account hour, before everything else. */
const MORNING = new Date('2026-03-19T09:00:00Z');
const TODAY = '2026-03-19';

const PREFS = {
  units: 'metric' as const,
  locale: 'en' as Locale,
  notifyMilestones: true,
  notifyDailyRecap: true,
};

let user: TestUser;

beforeEach(async () => {
  // Free on purpose. Every assertion below is about an account that `dueNudge`
  // and the review pass both refuse, and that is the point of the feature.
  user = await createUser({ plan: 'free' });
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
});

/** `days` consecutive logged days ending on `endingOn`. */
async function logStreak(days: number, endingOn = TODAY) {
  for (let i = 0; i < days; i++) {
    await addMeal(user, { date: addDays(endingOn, -i), kcal: 600 });
  }
}

const due = (now: Date, prefs = PREFS) =>
  dueAlert({
    userId: user.id,
    prefs,
    now,
    hour: Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: user.ctx.timezone,
        hour: '2-digit',
        hour12: false,
      }).format(now),
    ),
    today: TODAY,
  });

describe('streaks', () => {
  it('congratulates a run that reaches a milestone', async () => {
    await logStreak(7);

    const alert = await due(EVENING);

    expect(alert).toMatchObject({ kind: 'streak' });
    expect(alert!.body).toContain('7 days');
  });

  it('says nothing on the way to one', async () => {
    await logStreak(6);
    expect(await due(EVENING)).toBeNull();
  });

  /*
   * The failure this feature would otherwise ship with. The pass runs hourly,
   * so without a row to key on the same congratulation arrives at 20:00 and
   * again at 21:00 and again at 22:00, all evening.
   */
  it('congratulates a milestone once, however often the pass runs', async () => {
    await logStreak(7);
    await registerPushToken(user.id, { token: 'ExponentPushToken[a]', platform: 'ios' });
    const fetchImpl = pushOk();
    vi.stubGlobal('fetch', fetchImpl);

    await runDueAlerts(EVENING);
    await runDueAlerts(new Date('2026-03-19T19:00:00Z'));
    await runDueAlerts(new Date('2026-03-19T20:00:00Z'));

    expect((await listAlerts(user.id)).filter((a) => a.kind === 'streak')).toHaveLength(1);
    // And the relay heard about it exactly once, which is the half of this the
    // reader would actually notice.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  /*
   * A streak that ended on Tuesday is history. Telling somebody on Thursday
   * that they are on a seven-day run is telling them they are doing a thing
   * they have stopped doing.
   */
  it('ignores a run that does not reach today', async () => {
    await logStreak(10, addDays(TODAY, -2));
    expect(await due(EVENING)).toBeNull();
  });

  it('counts a day logged twice as one day', async () => {
    await logStreak(7);
    await addMeal(user, { date: TODAY, kcal: 400, hour: 19 });

    const alert = await due(EVENING);
    expect(alert).toMatchObject({ kind: 'streak' });
  });

  /*
   * The subject is the run, not the number, so a streak broken in April and
   * rebuilt in June is a second achievement and may be said out loud again.
   */
  it('lets a rebuilt streak be celebrated again', async () => {
    await logStreak(7);
    const first = await due(EVENING);
    await saveAlert(user.id, first!, TODAY);

    // A gap, then a fresh week ending a fortnight later.
    const later = addDays(TODAY, 14);
    for (let i = 0; i < 7; i++) await addMeal(user, { date: addDays(later, -i), kcal: 600 });

    const second = await dueAlert({
      userId: user.id,
      prefs: PREFS,
      now: EVENING,
      hour: MILESTONE_HOUR,
      today: later,
    });

    expect(second).toMatchObject({ kind: 'streak' });
    expect(second!.subject).not.toBe(first!.subject);
  });

  it('reaches for the largest milestone passed, not an exact match on today', async () => {
    // Thirty-one days: the pass was down on the evening day thirty landed.
    await logStreak(31);
    const alert = await due(EVENING);
    expect(alert!.body).toContain('30 days');
    expect(STREAK_MILESTONES).toContain(30);
  });

  it('waits for the evening', async () => {
    await logStreak(7);
    expect(await due(MORNING)).toBeNull();
  });
});

describe('goal reached', () => {
  it('speaks when the scale reaches the number, from the right side', async () => {
    await createGoal('lose', 78);
    await addWeight(user, addDays(TODAY, -1), 77.6);

    const alert = await due(EVENING);
    expect(alert).toMatchObject({ kind: 'goal_reached' });
    expect(alert!.body).toContain('77.6 kg');
  });

  it('says nothing on the way there', async () => {
    await createGoal('lose', 78);
    await addWeight(user, addDays(TODAY, -1), 79.4);
    expect(await due(EVENING)).toBeNull();
  });

  /*
   * The whole reason the direction is read off the goal. Somebody gaining who
   * passes 78 on the way up has reached it; somebody losing who is at 79 has
   * not, and "within a kilo" would congratulate them both.
   */
  it('reads the direction off the goal', async () => {
    await createGoal('gain', 78);
    await addWeight(user, addDays(TODAY, -1), 78.2);
    expect(await due(EVENING)).toMatchObject({ kind: 'goal_reached' });
  });

  it('ignores a weigh-in too old to be news', async () => {
    await createGoal('lose', 78);
    await addWeight(user, addDays(TODAY, -30), 77.0);
    expect(await due(EVENING)).toBeNull();
  });

  it('has nothing to say to a goal of maintaining', async () => {
    await createGoal('maintain', 78);
    await addWeight(user, addDays(TODAY, -1), 78.0);
    expect(await due(EVENING)).toBeNull();
  });
});

describe('the evening recap', () => {
  it('reports the day against its targets', async () => {
    await addMeal(user, { date: TODAY, kcal: 1800, protein_g: 120 });

    const alert = await due(LATE);

    expect(alert).toMatchObject({ kind: 'daily_recap' });
    expect(alert!.title).toBe('1,800 of 2,200 kcal');
    expect(alert!.body).toContain('120g of 160g');
  });

  it('says nothing about a day with nothing in it', async () => {
    expect(await due(LATE)).toBeNull();
  });

  it('is off unless it has been asked for', async () => {
    await addMeal(user, { date: TODAY, kcal: 1800 });
    const alert = await due(LATE, { ...PREFS, notifyDailyRecap: false });
    expect(alert).toBeNull();
  });

  /*
   * The one exemption from the weekly budget, and it has to hold: what somebody
   * switched this on *for* is a message every evening, and charging it to a
   * weekly allowance would honour the request by refusing it six days in seven.
   */
  it('is not rationed by the weekly budget', async () => {
    await addMeal(user, { date: TODAY, kcal: 1800 });
    await saveNudge(user.id, 'dormant', addDays(TODAY, -1), 'said yesterday', null);

    expect(await due(LATE)).toMatchObject({ kind: 'daily_recap' });
  });
});

describe('a plan about to lapse', () => {
  it('warns before the date, whatever the notification preferences say', async () => {
    await query(
      `UPDATE users SET plan = 'plus', plan_source = 'play', plan_expires_at = $2 WHERE id = $1`,
      [user.id, addDays(TODAY, 2)],
    );

    const alert = await due(MORNING, {
      units: 'metric',
      locale: 'en',
      notifyMilestones: false,
      notifyDailyRecap: false,
    });

    expect(alert).toMatchObject({ kind: 'plan_expiring' });
    expect(alert!.title).toContain('Plus');
  });

  it('leaves a comped account alone, which has no expiry to be past', async () => {
    await query(
      `UPDATE users SET plan = 'coach', plan_source = 'manual', plan_expires_at = $2 WHERE id = $1`,
      [user.id, addDays(TODAY, 2)],
    );
    expect(await due(MORNING)).toBeNull();
  });

  it('says nothing about a renewal that is months away', async () => {
    await query(
      `UPDATE users SET plan = 'plus', plan_source = 'play', plan_expires_at = $2 WHERE id = $1`,
      [user.id, addDays(TODAY, 40)],
    );
    expect(await due(MORNING)).toBeNull();
  });
});

describe('the shared frequency budget', () => {
  /*
   * The promise the switches make is "at most one a week", and it is a promise
   * about the reader's pocket rather than about any one feature. Two senders
   * each keeping honestly to one a week is two a week.
   */
  it('will not celebrate in the week after a nudge', async () => {
    await logStreak(7);
    await saveNudge(user.id, 'dormant', addDays(TODAY, -2), 'said on Tuesday', null);

    expect(await due(EVENING)).toBeNull();
  });

  it('will not celebrate twice in a week', async () => {
    await logStreak(7);
    const first = await due(EVENING);
    await saveAlert(user.id, first!, TODAY);

    // A goal reached the next day, which would otherwise be due on its own.
    await createGoal('lose', 78);
    await addWeight(user, TODAY, 77.0);

    const next = await dueAlert({
      userId: user.id,
      prefs: PREFS,
      now: EVENING,
      hour: MILESTONE_HOUR,
      today: addDays(TODAY, 1),
    });
    expect(next).toBeNull();
  });

  it('speaks again once the week has passed', async () => {
    await logStreak(7);
    await saveNudge(user.id, 'dormant', addDays(TODAY, -9), 'said last week', null);

    expect(await due(EVENING)).toMatchObject({ kind: 'streak' });
  });

  it('is silent for the day after a weekly review', async () => {
    await logStreak(7);
    await query(
      `INSERT INTO weekly_reviews (user_id, week_start, week_end, content, stats)
       VALUES ($1, $2, $3, 'review', '{}'::jsonb)`,
      [user.id, addDays(TODAY, -7), addDays(TODAY, -1)],
    );

    expect(await due(EVENING)).toBeNull();
  });

  it('does not let a switched-off milestone spend the week', async () => {
    await logStreak(7);

    await dueAlert({
      userId: user.id,
      prefs: { ...PREFS, notifyMilestones: false },
      now: EVENING,
      hour: MILESTONE_HOUR,
      today: TODAY,
    });

    // Nothing was written, so nothing was spent: the nudge pass still has the
    // week's allowance to work with.
    expect(await listAlerts(user.id)).toHaveLength(0);
  });
});

describe('the pass', () => {
  it('runs for a free account, which every other pass refuses', async () => {
    await logStreak(7);
    await registerPushToken(user.id, { token: 'ExponentPushToken[free]', platform: 'ios' });
    const fetchImpl = pushOk();
    vi.stubGlobal('fetch', fetchImpl);

    const result = await runDueAlerts(EVENING);

    expect(result.generated).toContain(user.id);
    expect(fetchImpl).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reports a failure against the account it belongs to and keeps going', async () => {
    const other = await createUser({ plan: 'free' });
    await setUserTargets(other, '2026-01-01', {});
    await logStreak(7);

    // No device anywhere: every send is skipped, and the pass still completes.
    const result = await runDueAlerts(EVENING);

    expect(result.failed).toHaveLength(0);
    expect(result.considered).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The gap `STREAKS.md` §8 opened up.
 *
 * A badge wall drawn from keys localises for free; an alert stores rendered
 * prose and so has to pick a language at the moment it is worded. Before this,
 * every title and body was an English literal — so a phone set to Bulgarian got
 * a Bulgarian grid and an English notification about the same streak.
 */
describe('the language a phone is read in', () => {
  const inLocale = (locale: 'en' | 'bg' | 'de') => due(EVENING, { ...PREFS, locale });

  it('words a streak in the reader own language', async () => {
    await logStreak(7);

    expect(await inLocale('en')).toMatchObject({ title: 'A week, every day' });
    expect((await inLocale('bg'))?.title).toBe('Седмица, всеки ден');
    expect((await inLocale('de'))?.title).toBe('Eine Woche, jeden Tag');
  });

  it('words a goal and its weight in it too', async () => {
    await createGoal('lose', 78);
    await addWeight(user, TODAY, 77.4);

    const bg = await inLocale('bg');
    expect(bg?.title).toBe('Стигна дотам');
    expect(bg?.body).toContain('Последното ти тегло');
    /*
     * The weight itself still reads "77.4 kg" rather than "77,4 kg", and that
     * is deliberately not fixed here. `formatBodyWeight(kg, units)` takes no
     * locale, so every screen in the app has the same dot — Today, History and
     * the weigh-in card included. Correcting it only inside this one sentence
     * would make the notification disagree with the app it is about.
     *
     * Left as its own job: widening `formatBodyWeight` is a change to fifteen
     * call sites across both clients and the prompt.
     */
    expect(bg?.body).toContain('77.4 kg');
  });

  it('groups the recap numbers the way the reader does', async () => {
    await addMeal(user, { date: TODAY, kcal: 1840, protein_g: 120 });
    const prefs = { ...PREFS, notifyMilestones: false };

    // `1,840` in English against `1.840` in German — the separator is the
    // reader's, which `toLocaleString('en-US')` could never be.
    //
    // Bulgarian is deliberately not the example here: it groups from five
    // digits up, so 1840 is "1840" in it, and a test asserting "1 840" would be
    // asserting a bug.
    expect((await due(LATE, prefs))?.title).toContain('1,840');
    expect((await due(LATE, { ...prefs, locale: 'de' }))?.title).toContain('1.840');
  });

  /**
   * `alert.streakTitles` is indexed by position in `STREAK_MILESTONES`, which is
   * the cheapest way to hold seven bespoke titles through a catalogue whose type
   * derivation understands strings, functions and string arrays — and nothing
   * else. Parallel arrays need a guard, so here it is.
   */
  it('keeps a title for every milestone in every language', () => {
    for (const locale of LOCALES) {
      const titles = emailMessages(locale)['alert.streakTitles'];
      expect(titles).toHaveLength(STREAK_MILESTONES.length);
      expect(titles.every((title) => title.length > 0)).toBe(true);
    }
  });
});

// ---- Helpers ---------------------------------------------------------------

async function createGoal(goal: string, targetKg: number) {
  await query('UPDATE users SET goal = $2, target_weight_kg = $3 WHERE id = $1', [
    user.id,
    goal,
    targetKg,
  ]);
}

function pushOk() {
  return vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({ data: [{ status: 'ok', id: 'x' }] }),
        text: async () => '',
      }) as unknown as Response,
  );
}
