/**
 * Recomputes every formula-derived target under the current arithmetic.
 *
 *   pnpm --filter @ct/api rebalance-targets -- --dry-run
 *   pnpm --filter @ct/api rebalance-targets
 *
 * A one-off, and it exists because the fix it carries cannot reach anybody on
 * its own. `retargetFromProfile` only fires when somebody edits one of the five
 * fields the formula reads, and the adaptive pass needs a fortnight of intake
 * and weigh-ins before it will say anything — so an account handed a bad split
 * at setup would sit on it until they happened to change their height.
 *
 * The bad split, concretely: protein was anchored to scale weight at 2 g/kg
 * with no ceiling, and the deficit was a flat 500 kcal. Together, for a
 * sedentary woman of 97 kg, that produced 194 g of protein against a 1,420 kcal
 * target — 55% of the day, leaving 62 g of carbohydrate.
 *
 * Custom targets are left alone: a number somebody typed is not ours to move,
 * here or anywhere else. Adaptive rows are rebased rather than replaced, for
 * the reason given on `retargetFromProfile` — the measurement stands, only the
 * goal's share of it is re-applied.
 */
import type { Goal, Targets } from '@ct/shared';
import { isEntrypoint, runAsScript } from './cli.ts';
import { pool, query } from './db.ts';
import { latestWeight } from './services/log.ts';
import {
  calculateTargets,
  macrosFor,
  setTargets,
  targetKcalFor,
  targetsForDate,
} from './services/targets.ts';
import { getUser } from './services/user.ts';
import { localDateFor } from './time.ts';

const REASON = 'rebalanced: protein capped at a share of energy, deficit made proportional';

export async function rebalanceTargets(dryRun: boolean): Promise<number> {
  // Everyone holding a target row, not everyone with an account: an account
  // that has never been given a number has nothing to rebalance and will get
  // the new arithmetic the first time it asks.
  const users = await query<{ user_id: string }>(
    'SELECT DISTINCT user_id FROM targets',
  );

  let changed = 0;
  for (const { user_id } of users) {
    const profile = await getUser(user_id);
    const today = localDateFor(new Date(), {
      timezone: profile.timezone,
      dayStartHour: profile.day_start_hour,
    });
    const current = await targetsForDate(user_id, today);
    if (current.is_custom) continue;

    const weight = await latestWeight(user_id);
    const basis = {
      weight_kg: weight?.weight_kg ?? null,
      height_cm: profile.height_cm,
      goal: profile.goal,
    };

    let next: Targets;
    if (current.source === 'adaptive') {
      // The old flat delta is what the learned maintenance is hiding behind, so
      // that is the one to undo — the new factor was never applied to this row.
      const maintenance = current.kcal - OLD_GOAL_KCAL_DELTA[profile.goal ?? 'maintain'];
      const kcal = targetKcalFor(maintenance, profile.goal);
      next = { ...current, kcal, ...macrosFor(kcal, basis) };
    } else {
      next = calculateTargets({
        sex: profile.sex,
        birth_date: profile.birth_date,
        height_cm: profile.height_cm,
        weight_kg: basis.weight_kg,
        activity_level: profile.activity_level,
        goal: profile.goal,
      });
    }

    if (
      next.kcal === current.kcal &&
      next.protein_g === current.protein_g &&
      next.carbs_g === current.carbs_g &&
      next.fat_g === current.fat_g
    ) {
      continue;
    }

    console.log(
      `${profile.email ?? user_id}: ` +
        `${current.kcal} kcal / ${current.protein_g}P ${current.carbs_g}C ${current.fat_g}F` +
        ` -> ${next.kcal} kcal / ${next.protein_g}P ${next.carbs_g}C ${next.fat_g}F`,
    );
    changed += 1;
    if (!dryRun) await setTargets(user_id, today, next, REASON);
  }
  return changed;
}

/** The deficit as it was, needed only to undo it. */
const OLD_GOAL_KCAL_DELTA: Record<Goal, number> = { lose: -500, maintain: 0, gain: 300 };

export async function main(argv: string[] = process.argv): Promise<void> {
  const dryRun = argv.includes('--dry-run');
  const changed = await rebalanceTargets(dryRun);
  console.log(
    dryRun
      ? `${changed} target(s) would move. Re-run without --dry-run to write them.`
      : `${changed} target(s) rebalanced.`,
  );
}

if (isEntrypoint(import.meta.url)) void runAsScript(main, () => pool.end());
