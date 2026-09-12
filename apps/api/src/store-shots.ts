/**
 * Seeds the store-screenshot account for one language, then exits.
 *
 *   npx tsx src/store-shots.ts ../../store/listings/bg.json bg
 *
 * The account is `shots@example.invalid` on the dev database — an unroutable
 * TLD, so a stray verification mail reaches nobody. It is rewritten from
 * scratch on every run: the same dinner, the same correction, the same day, in
 * whichever language the pack holds, so twelve store listings differ only in
 * their words. `store/tools/capture-shots.sh` drives the emulator around it.
 */
import { readFileSync } from 'node:fs';
import { query, queryOne } from './db.ts';
import { createAccount, markOnboarded, updateUser } from './services/user.ts';
import { createFoodEntry } from './services/log.ts';
import { insertMessage } from './services/chat.ts';
import { setTargets } from './services/targets.ts';
import { localDateFor, type DayContext } from '@ct/shared';

const EMAIL = 'shots@example.invalid';
const PASSWORD = 'ShotsPass123!';
const CTX: DayContext = { timezone: 'Europe/Sofia', dayStartHour: 4 };

const pack = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const locale = process.argv[3]!;
const s = pack.shots;

const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function main() {
  let row = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [EMAIL]);
  if (!row) {
    const id = await createAccount(EMAIL, PASSWORD, 'Nik', CTX.timezone, locale as never);
    // Verified by hand: an unverified login mails a code, and the dev box has a real key.
    await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [id]);
    row = { id };
  }
  const userId = row.id;

  await updateUser(userId, {
    locale: locale as never,
    display_name: 'Nik',
    units: 'metric',
    sex: 'male',
    birth_date: '1994-03-18',
    height_cm: 181,
    target_weight_kg: 78,
    activity_level: 'moderate',
    goal: 'lose',
    timezone: CTX.timezone,
    day_start_hour: CTX.dayStartHour,
  } as never);
  await markOnboarded(userId);

  await query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
  await query('DELETE FROM food_entries WHERE user_id = $1', [userId]);

  const today = localDateFor(new Date(), CTX);
  const yesterday = localDateFor(at(1, 12), CTX);
  for (const date of [today, yesterday]) {
    await setTargets(userId, date, { kcal: 2200, protein_g: 150, carbs_g: 230, fat_g: 73, is_custom: false, source: 'calculated' } as never, 'screenshots');
  }

  // Today: 1,350 of 2,200 — the ring in frame 3.
  await createFoodEntry({
    userId, meal: 'breakfast', eatenAt: at(0, 8, 20), description: s.cardTitle,
    confidence: 'high', source: 'text', ctx: CTX,
    items: [{ name: s.items[0], quantity_desc: null, kcal: 420, protein_g: 26, carbs_g: 38, fat_g: 17, fiber_g: 3, sodium_mg: 520, sat_fat_g: 8, sugar_g: 14 }],
  } as never);
  await createFoodEntry({
    userId, meal: 'lunch', eatenAt: at(0, 13, 10), description: s.cardTitle,
    confidence: 'high', source: 'text', ctx: CTX,
    items: [{ name: s.items[1], quantity_desc: null, kcal: 930, protein_g: 55, carbs_g: 63, fat_g: 53, fiber_g: 5, sodium_mg: 1215, sat_fat_g: 15, sugar_g: 28 }],
  } as never);

  // Yesterday's dinner: the card the journal frames are about.
  const dinner = await createFoodEntry({
    userId, meal: 'dinner', eatenAt: at(1, 19, 40), description: s.cardTitle,
    confidence: 'medium', source: 'text', ctx: CTX,
    items: s.items.map((name: string, i: number) => ({
      name, quantity_desc: null,
      kcal: [430, 300, 50][i] ?? 0, protein_g: [52, 6, 2][i] ?? 0,
      carbs_g: [0, 84, 8][i] ?? 0, fat_g: [9, 1, 1][i] ?? 0,
    })),
  } as never);

  const card = (kcal: number, protein: number, carbs: number, before: number, after: number) => ({
    type: 'food' as const,
    entry_id: (dinner as { id: string }).id,
    meal: 'dinner' as const,
    description: s.cardTitle,
    confidence: 'medium' as const,
    items: s.items.map((name: string) => ({ name, quantity: null })),
    kcal, protein_g: protein, carbs_g: carbs, fat_g: 11,
    // Today's date on the card, so it draws no "on 11.09" suffix; the entry itself
    // stays on yesterday so today's ring keeps the 1,350 the third frame wants.
    day: { local_date: today, kcal_before: before, kcal_after: after, target_kcal: 2200 },
  });

  await insertMessage(userId, 'user', s.userLog);
  await insertMessage(userId, 'assistant', s.replyLog, null, null, [
    { kind: 'food_logged', entry_id: (dinner as { id: string }).id, summary: s.cardTitle, card: card(715, 59, 78, 1350, 2065) } as never,
  ]);
  await insertMessage(userId, 'user', s.userCorrection);
  await insertMessage(userId, 'assistant', s.replyCorrection, null, null, [
    { kind: 'food_updated', entry_id: (dinner as { id: string }).id, summary: s.cardTitle, card: card(780, 60, 92, 1350, 2130) } as never,
  ]);

  console.log(`seeded ${EMAIL} in ${locale}: ${s.userLog}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
