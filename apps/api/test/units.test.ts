import { describe, expect, it } from 'vitest';
import {
  bodyWeightToKg,
  cmToFeetInches,
  feetInchesToCm,
  formatBodyWeight,
  formatDistance,
  formatHeight,
  formatLoad,
  formatMass,
  formatWeightDelta,
  GRAMS_PER_OZ,
  loadToKg,
  toBodyWeight,
  unitsOf,
} from '@ct/shared';
import { onboardingPrompt, unitsBrief } from '../src/ai/prompt.ts';
import type { Profile } from '@ct/shared';

/**
 * Conversion is the whole of the imperial feature — everything downstream of it
 * is one function call in a JSX expression. Storage stays metric (UNITS.md), so
 * the only ways this can break are a wrong factor and a round trip that drifts,
 * and both are cheap to pin down here.
 */

const PROFILE = { units: null } as unknown as Profile;
const imperial = { ...PROFILE, units: 'imperial' } as Profile;
const metric = { ...PROFILE, units: 'metric' } as Profile;

describe('unitsOf', () => {
  it('reads metric when nobody has been asked yet', () => {
    expect(unitsOf(PROFILE)).toBe('metric');
    expect(unitsOf(null)).toBe('metric');
    expect(unitsOf(undefined)).toBe('metric');
  });

  it('reads what the profile says once it says something', () => {
    expect(unitsOf(imperial)).toBe('imperial');
    expect(unitsOf(metric)).toBe('metric');
  });
});

describe('body weight', () => {
  it('leaves metric alone', () => {
    expect(formatBodyWeight(72.4, 'metric')).toBe('72.4 kg');
  });

  it('converts to pounds at one decimal', () => {
    expect(formatBodyWeight(72.4, 'imperial')).toBe('159.6 lb');
  });

  /*
   * The round trip is the one that matters in practice: somebody types 165 into
   * the target-weight field, it is stored as kilograms, and the number that
   * comes back has to be the number they typed. A factor that is right to three
   * places and wrong at the fourth passes every other test here and shows up as
   * a field that reads 164.9 the moment you save it.
   */
  it('round-trips a typed figure back to itself', () => {
    for (const typed of [120, 165.5, 180, 210.4, 99.9]) {
      expect(toBodyWeight(bodyWeightToKg(typed, 'imperial'), 'imperial')).toBe(typed);
    }
  });

  it('signs a change, and can be asked not to', () => {
    expect(formatWeightDelta(0.4, 'metric')).toBe('+0.4 kg');
    expect(formatWeightDelta(-0.4, 'metric')).toBe('-0.4 kg');
    expect(formatWeightDelta(0.4, 'imperial', false)).toBe('0.9 lb');
  });
});

describe('height', () => {
  it('renders feet and inches, and comes back to the same centimetres', () => {
    expect(formatHeight(178, 'imperial')).toBe('5′10″');
    expect(formatHeight(178, 'metric')).toBe('178 cm');
    const { feet, inches } = cmToFeetInches(178);
    expect(Math.round(feetInchesToCm(feet, inches))).toBe(178);
  });

  /*
   * 12 inches is a foot. Rounding to the nearest inch can land on 12 from
   * below — 182.7 cm is 71.93 inches, which rounds to 72 — and a naive
   * divmod would render that as 5′12″.
   */
  it('never renders twelve inches', () => {
    for (let cm = 120; cm <= 220; cm += 0.1) {
      const { inches } = cmToFeetInches(cm);
      expect(inches).toBeLessThan(12);
    }
    expect(formatHeight(182.88, 'imperial')).toBe('6′0″');
  });
});

describe('portions', () => {
  it('keeps grams whole and switches to pounds past a pound', () => {
    expect(formatMass(200, 'metric')).toBe('200 g');
    expect(formatMass(200, 'imperial')).toBe('7.1 oz');
    // Exactly an ounce, which is the barcode screen's imperial basis.
    expect(formatMass(GRAMS_PER_OZ, 'imperial')).toBe('1 oz');
    expect(formatMass(700, 'imperial')).toBe('1.5 lb');
  });
});

describe('distance and load', () => {
  it('converts kilometres to miles and trims the trailing zero', () => {
    expect(formatDistance(5, 'metric')).toBe('5 km');
    expect(formatDistance(5, 'imperial')).toBe('3.1 mi');
    expect(formatDistance(8.05, 'imperial')).toBe('5 mi');
  });

  it('keeps a microplate visible', () => {
    expect(formatLoad(80, 'metric')).toBe('80 kg');
    expect(formatLoad(loadToKg(82.5, 'imperial'), 'imperial')).toBe('82.5 lb');
  });
});

describe('what the model is told', () => {
  it('says nothing to a metric account, because metric is what the tools do', () => {
    expect(unitsBrief(metric)).toBeNull();
    expect(unitsBrief(PROFILE)).toBeNull();
  });

  it('tells an imperial account to talk imperial and call metric', () => {
    const brief = unitsBrief(imperial)!;
    expect(brief).toContain('pounds');
    // The half that stops a 180 lb weigh-in being stored as 180 kg.
    expect(brief).toContain('Tool arguments never change');
  });

  it('puts the preference on the list onboarding still has to collect', () => {
    const prompt = onboardingPrompt(PROFILE, ['sex', 'whether they read metric or imperial units'], null);
    expect(prompt).toContain('whether they read metric or imperial units');
  });
});
