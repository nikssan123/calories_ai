import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  calculateTargets,
  FALLBACK_TARGETS,
  GOAL_KCAL_DELTA,
  macrosFor,
  MIN_TARGET_KCAL,
  predictTdee,
} from '../src/services/targets.ts';

/**
 * Every number the user sees comes out of here. It is pure arithmetic with no
 * I/O, which makes it both the cheapest thing to test and the most expensive
 * thing to get wrong.
 */

const ADULT = {
  sex: 'male' as const,
  birth_date: '1990-01-01',
  height_cm: 180,
  weight_kg: 85,
  activity_level: 'moderate' as const,
  goal: 'maintain' as const,
};

describe('ageFrom', () => {
  it('returns null for a missing or unparseable date', () => {
    expect(ageFrom(null)).toBeNull();
    expect(ageFrom('not a date')).toBeNull();
  });

  it('produces a plausible adult age', () => {
    const age = ageFrom('1990-01-01')!;
    expect(age).toBeGreaterThan(30);
    expect(age).toBeLessThan(70);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const born = `${now.getUTCFullYear() - 30}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
    expect(ageFrom(born)).toBeLessThanOrEqual(30);
  });
});

describe('predictTdee', () => {
  it('applies Mifflin-St Jeor and the activity multiplier', () => {
    // BMR = 10*85 + 6.25*180 - 5*age + 5, then x1.55 for moderate.
    const age = ageFrom(ADULT.birth_date)!;
    const bmr = 10 * 85 + 6.25 * 180 - 5 * age + 5;
    expect(predictTdee(ADULT)).toBeCloseTo(bmr * 1.55, 6);
  });

  it('is lower for female at identical measurements', () => {
    expect(predictTdee({ ...ADULT, sex: 'female' })!).toBeLessThan(predictTdee(ADULT)!);
  });

  it('rises monotonically with activity level', () => {
    const levels = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
    const values = levels.map((activity_level) => predictTdee({ ...ADULT, activity_level })!);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('defaults a missing activity level to moderate', () => {
    expect(predictTdee({ ...ADULT, activity_level: null })).toBe(
      predictTdee({ ...ADULT, activity_level: 'moderate' }),
    );
  });

  it.each(['sex', 'birth_date', 'height_cm', 'weight_kg'] as const)(
    'returns null without %s',
    (field) => {
      expect(predictTdee({ ...ADULT, [field]: null })).toBeNull();
    },
  );
});

describe('macrosFor', () => {
  it('anchors protein to bodyweight, harder when cutting', () => {
    expect(macrosFor(2400, 85, 'lose').protein_g).toBe(170);
    expect(macrosFor(2400, 85, 'maintain').protein_g).toBe(153);
  });

  it('falls back to a share of energy when bodyweight is unknown', () => {
    expect(macrosFor(2000, null, 'maintain').protein_g).toBe(150);
  });

  it('puts 28% of energy in fat', () => {
    expect(macrosFor(2400, 85, 'maintain').fat_g).toBe(Math.round((2400 * 0.28) / 9));
  });

  it('gives the remaining energy to carbs, and never goes negative', () => {
    const m = macrosFor(2400, 85, 'maintain');
    expect(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9).toBeCloseTo(2400, -2);
    // A tiny target against a heavy person leaves nothing for carbs.
    expect(macrosFor(1200, 140, 'lose').carbs_g).toBe(0);
  });
});

describe('calculateTargets', () => {
  it('falls back when the profile is incomplete', () => {
    expect(calculateTargets({ ...ADULT, sex: null })).toEqual(FALLBACK_TARGETS);
  });

  it('subtracts the deficit for a loss goal and adds for gain', () => {
    const maintain = calculateTargets({ ...ADULT, goal: 'maintain' }).kcal;
    const lose = calculateTargets({ ...ADULT, goal: 'lose' }).kcal;
    const gain = calculateTargets({ ...ADULT, goal: 'gain' }).kcal;
    expect(lose).toBeCloseTo(maintain + GOAL_KCAL_DELTA.lose, -1);
    expect(gain).toBeCloseTo(maintain + GOAL_KCAL_DELTA.gain, -1);
  });

  it('rounds to the nearest 10 rather than reporting false precision', () => {
    expect(calculateTargets(ADULT).kcal % 10).toBe(0);
  });

  it('never returns a starvation target', () => {
    const tiny = calculateTargets({
      sex: 'female',
      birth_date: '1940-01-01',
      height_cm: 140,
      weight_kg: 40,
      activity_level: 'sedentary',
      goal: 'lose',
    });
    expect(tiny.kcal).toBe(MIN_TARGET_KCAL);
  });

  it('marks its output as formula-derived, not custom', () => {
    expect(calculateTargets(ADULT)).toMatchObject({ is_custom: false, source: 'calculated' });
  });

  it('treats a missing goal as maintenance', () => {
    expect(calculateTargets({ ...ADULT, goal: null }).kcal).toBe(
      calculateTargets({ ...ADULT, goal: 'maintain' }).kcal,
    );
  });
});
