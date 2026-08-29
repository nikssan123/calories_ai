import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  calculateTargets,
  FALLBACK_TARGETS,
  GOAL_TDEE_FACTOR,
  macrosFor,
  MAX_PROTEIN_ENERGY_SHARE,
  MIN_TARGET_KCAL,
  predictTdee,
  proteinAnchorKg,
  targetInputsChanged,
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

describe('proteinAnchorKg', () => {
  it('leaves someone inside the healthy range on their own weight', () => {
    // 75 kg at 180 cm is a BMI of 23 — below the ceiling, so nothing is capped.
    expect(proteinAnchorKg(75, 180)).toBe(75);
  });

  it('caps a heavier person at what the top of the range weighs at their height', () => {
    // 25 x 1.72^2. Fat mass does not eat, so it does not get a protein figure.
    expect(proteinAnchorKg(97, 172)).toBeCloseTo(73.96, 2);
  });

  it('has nothing to cap against without a height', () => {
    expect(proteinAnchorKg(97, null)).toBe(97);
  });
});

describe('macrosFor', () => {
  const basis = { weight_kg: 85, height_cm: 180, goal: 'maintain' as const };

  it('anchors protein to the reference weight, harder when cutting', () => {
    // 85 kg at 180 cm is a BMI of 26.2, so the anchor is the 81 kg ceiling.
    expect(macrosFor(2400, { ...basis, goal: 'lose' }).protein_g).toBe(162);
    expect(macrosFor(2400, basis).protein_g).toBe(146);
  });

  it('falls back to a share of energy when bodyweight is unknown', () => {
    expect(macrosFor(2000, { ...basis, weight_kg: null }).protein_g).toBe(150);
  });

  it('puts 28% of energy in fat', () => {
    expect(macrosFor(2400, basis).fat_g).toBe(Math.round((2400 * 0.28) / 9));
  });

  /**
   * The bug this cap exists for: a sedentary 56-year-old woman, 172 cm and
   * 97 kg, was handed 194 g of protein against a 1,420 kcal target — 55% of her
   * whole day, and most of a kilo of chicken. The anchor alone does not catch
   * it, because a figure per kilo cannot see the size of the target.
   */
  it('never lets protein claim more than its share of the day', () => {
    for (const [kcal, weight_kg, height_cm] of [
      [1540, 97, 172],
      [1200, 140, 165],
      [1400, 120, 158],
      [2400, 85, 180],
    ] as const) {
      const m = macrosFor(kcal, { weight_kg, height_cm, goal: 'lose' });
      expect(m.protein_g * 4).toBeLessThanOrEqual(kcal * MAX_PROTEIN_ENERGY_SHARE);
    }
  });

  it('gives the remaining energy to carbs, and always has some to give', () => {
    const m = macrosFor(2400, basis);
    expect(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9).toBeCloseTo(2400, -2);

    // Protein is capped at 35% and fat takes 28%, so a third of the day is left
    // for carbohydrate no matter who is asking. This used to come out at zero.
    const tight = macrosFor(1200, { weight_kg: 140, height_cm: 165, goal: 'lose' });
    expect(tight.carbs_g).toBeGreaterThan(100);
    expect(tight.protein_g * 4 + tight.carbs_g * 4 + tight.fat_g * 9).toBeCloseTo(1200, -2);
  });
});

describe('targetInputsChanged', () => {
  const profile = {
    sex: 'male' as const,
    birth_date: '1990-01-01',
    height_cm: 180,
    activity_level: 'moderate' as const,
    goal: 'maintain' as const,
  };

  it.each(['sex', 'birth_date', 'height_cm', 'activity_level', 'goal'] as const)(
    'sees %s move',
    (field) => {
      expect(targetInputsChanged(profile, { ...profile, [field]: null })).toBe(true);
    },
  );

  it('ignores a patch the formula cannot read', () => {
    expect(targetInputsChanged(profile, { ...profile })).toBe(false);
  });
});

describe('calculateTargets', () => {
  it('falls back when the profile is incomplete', () => {
    expect(calculateTargets({ ...ADULT, sex: null })).toEqual(FALLBACK_TARGETS);
  });

  it('takes a share off for a loss goal and adds one for gain', () => {
    const maintain = calculateTargets({ ...ADULT, goal: 'maintain' }).kcal;
    const lose = calculateTargets({ ...ADULT, goal: 'lose' }).kcal;
    const gain = calculateTargets({ ...ADULT, goal: 'gain' }).kcal;
    expect(lose).toBeCloseTo(maintain * GOAL_TDEE_FACTOR.lose, -1);
    expect(gain).toBeCloseTo(maintain * GOAL_TDEE_FACTOR.gain, -1);
  });

  /**
   * A flat 500 was 17% off a large man's maintenance and 26% off a small
   * woman's — the same instruction read as "moderate" by the person with room
   * to spare and "aggressive" by the person without.
   */
  it('cuts everyone by the same proportion, not the same number', () => {
    const small = calculateTargets({
      sex: 'female',
      birth_date: '1970-04-04',
      height_cm: 172,
      weight_kg: 97,
      activity_level: 'sedentary',
      goal: 'lose',
    });
    const large = calculateTargets({ ...ADULT, goal: 'lose', activity_level: 'very_active' });

    const share = (t: { kcal: number }, inputs: Parameters<typeof predictTdee>[0]) =>
      t.kcal / predictTdee(inputs)!;

    expect(share(small, { sex: 'female', birth_date: '1970-04-04', height_cm: 172, weight_kg: 97, activity_level: 'sedentary', goal: 'lose' })).toBeCloseTo(
      share(large, { ...ADULT, goal: 'lose', activity_level: 'very_active' }),
      2,
    );
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
