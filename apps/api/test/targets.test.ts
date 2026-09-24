import { describe, expect, it } from 'vitest';
import { TARGET_INPUTS } from '@ct/shared';
import {
  ageFrom,
  bmiFor,
  calculateTargets,
  effectiveGoal,
  FALLBACK_TARGETS,
  GOAL_TDEE_FACTOR,
  isUnderweight,
  macrosFor,
  MAX_PROTEIN_ENERGY_SHARE,
  MIN_GAIN_SURPLUS_KCAL,
  MIN_HEALTHY_BMI,
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

  // Driven from the list itself rather than a copy of it: a sixth input added
  // to the formula has to arrive already covered, because the thing it would
  // otherwise break is a screen telling somebody nothing moved.
  it.each(TARGET_INPUTS)('sees %s move', (field) => {
    expect(targetInputsChanged(profile, { ...profile, [field]: null })).toBe(true);
  });

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

/**
 * The guard that reads the profile before it believes the goal.
 *
 * Both profiles below are real shapes that arrived through the campaigns and
 * were answered badly — see `MIN_HEALTHY_BMI`. The arithmetic is asserted
 * against `predictTdee` rather than against figures, because every one of them
 * moves with the birth date as the years pass.
 */
describe('the underweight guard', () => {
  /** 175 cm and 48 kg: BMI 15.7, and asking to reach 60. */
  const UNDER = {
    sex: 'female' as const,
    birth_date: '1953-04-21',
    height_cm: 175,
    weight_kg: 48,
    activity_level: 'sedentary' as const,
    goal: 'gain' as const,
  };

  it('works out BMI, and answers null without both halves of it', () => {
    expect(bmiFor(48, 175)).toBeCloseTo(15.7, 1);
    expect(bmiFor(null, 175)).toBeNull();
    expect(bmiFor(48, null)).toBeNull();
  });

  /*
   * A guard that fired on an absence would re-aim the goal of everybody who has
   * not finished onboarding, which is a larger population than the one it is for.
   */
  it('does not fire on a profile that has not been measured', () => {
    expect(isUnderweight({ weight_kg: null, height_cm: 175 })).toBe(false);
    expect(isUnderweight({ weight_kg: 48, height_cm: null })).toBe(false);
    expect(isUnderweight({ weight_kg: 48, height_cm: 175 })).toBe(true);
  });

  it('draws the line at the WHO threshold and not a gram either side', () => {
    const metres = UNDER.height_cm / 100;
    const atTheLine = MIN_HEALTHY_BMI * metres * metres;
    expect(isUnderweight({ weight_kg: atTheLine + 0.01, height_cm: UNDER.height_cm })).toBe(false);
    expect(isUnderweight({ weight_kg: atTheLine - 0.01, height_cm: UNDER.height_cm })).toBe(true);
  });

  it('refuses a deficit to somebody already under it', () => {
    const losing = { ...UNDER, goal: 'lose' as const };
    expect(effectiveGoal('lose', losing)).toBe('maintain');
    expect(calculateTargets(losing).kcal).toBe(calculateTargets({ ...UNDER, goal: 'maintain' }).kcal);
  });

  /* One kilo either side of the line, with the calorie floor kept well clear. */
  it('still cuts for a profile just inside the healthy range', () => {
    const healthy = {
      ...UNDER,
      weight_kg: 57,
      activity_level: 'moderate' as const,
      goal: 'lose' as const,
    };
    expect(isUnderweight(healthy)).toBe(false);
    expect(calculateTargets(healthy).kcal).toBeCloseTo(
      predictTdee(healthy)! * GOAL_TDEE_FACTOR.lose,
      -1,
    );
  });

  it('holds at maintenance one kilo the other side of it', () => {
    const under = {
      ...UNDER,
      weight_kg: 56,
      activity_level: 'moderate' as const,
      goal: 'lose' as const,
    };
    expect(isUnderweight(under)).toBe(true);
    expect(calculateTargets(under).kcal).toBeCloseTo(predictTdee(under)!, -1);
  });

  /*
   * The half that is about the plan being a plan. 12% of this maintenance is
   * 151 kcal a day, which is the twenty-month figure in `MIN_HEALTHY_BMI`.
   */
  it('gives a surplus worth having rather than a share of very little', () => {
    const tdee = predictTdee(UNDER)!;
    expect(tdee * (GOAL_TDEE_FACTOR.gain - 1)).toBeLessThan(MIN_GAIN_SURPLUS_KCAL);
    /* Within half a step of the rounding this target is reported at. */
    expect(calculateTargets(UNDER).kcal - tdee).toBeGreaterThanOrEqual(MIN_GAIN_SURPLUS_KCAL - 5);
  });

  it('leaves a healthy gain on the factor, floor or no floor', () => {
    const gaining = { ...ADULT, goal: 'gain' as const };
    expect(isUnderweight(gaining)).toBe(false);
    expect(calculateTargets(gaining).kcal).toBeCloseTo(
      predictTdee(gaining)! * GOAL_TDEE_FACTOR.gain,
      -1,
    );
  });

  /* A floor, not a replacement: the factor wins where the factor is bigger. */
  it('keeps the factor when the factor already clears the floor', () => {
    const tall = {
      sex: 'male' as const,
      birth_date: '2000-01-01',
      height_cm: 195,
      weight_kg: 70,
      activity_level: 'very_active' as const,
      goal: 'gain' as const,
    };
    const tdee = predictTdee(tall)!;
    expect(isUnderweight(tall)).toBe(true);
    expect(tdee * (GOAL_TDEE_FACTOR.gain - 1)).toBeGreaterThan(MIN_GAIN_SURPLUS_KCAL);
    expect(calculateTargets(tall).kcal).toBeCloseTo(tdee * GOAL_TDEE_FACTOR.gain, -1);
  });

  /*
   * 2.0 g/kg is protein sparing against a deficit. Once the deficit is refused
   * there is nothing left for it to spare anything against, so the macros are
   * split for the goal the calories were actually aimed at.
   */
  it('splits the macros for the goal the calories were aimed at', () => {
    const losing = { ...UNDER, goal: 'lose' as const };
    const targets = calculateTargets(losing);
    expect(targets.protein_g).toBe(
      macrosFor(targets.kcal, { ...losing, goal: 'maintain' }).protein_g,
    );
  });
});
