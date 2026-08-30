import { describe, expect, it } from 'vitest';
import { energyFloor, reconcileEnergy } from '../src/services/energy.ts';

/**
 * The floor, and the things it must not trip over.
 *
 * Half of these cases are real foods with their published figures, because the
 * only way this check earns its place is by never firing on one. A rule that
 * rewrites olive oil is worse than no rule at all.
 */

const item = (over: Partial<Parameters<typeof energyFloor>[0]> & { name?: string } = {}) => ({
  name: 'Thing',
  kcal: 100,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ...over,
});

describe('energyFloor', () => {
  it('is the Atwater sum of the macros', () => {
    expect(energyFloor(item({ protein_g: 10, carbs_g: 20, fat_g: 5 }))).toBe(40 + 80 + 45);
  });

  it('re-prices fiber down from 4 to 2 kcal, reading it as part of the carbohydrate', () => {
    const withFiber = energyFloor(item({ carbs_g: 30, fiber_g: 10 }));
    // 20g of starch at 4 plus 10g of fiber at 2, rather than 30g at 4.
    expect(withFiber).toBe(80 + 20);
    expect(withFiber).toBeLessThan(energyFloor(item({ carbs_g: 30 })));
  });

  it('ignores a fiber figure larger than the carbohydrate holding it', () => {
    // Not either labelling convention — a mistake — so it buys no discount.
    expect(energyFloor(item({ carbs_g: 5, fiber_g: 40 }))).toBe(20);
  });

  it('ignores negative macros rather than crediting energy against them', () => {
    expect(energyFloor(item({ protein_g: -10, carbs_g: 20 }))).toBe(80);
  });
});

describe('reconcileEnergy', () => {
  it('leaves an item alone when its calories are possible', () => {
    const items = [item({ name: 'Rice', kcal: 234, protein_g: 4.9, carbs_g: 50.4, fat_g: 0.5 })];
    const { items: out, corrected } = reconcileEnergy(items);

    expect(corrected).toEqual([]);
    expect(out[0]).toBe(items[0]);
  });

  it('raises an item its own macros rule out', () => {
    // 25g of fat and 40g of carbohydrate is 385 kcal before anything else.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Creamy pasta', kcal: 300, protein_g: 12, carbs_g: 40, fat_g: 25 }),
    ]);

    expect(items[0]!.kcal).toBe(433);
    expect(corrected).toEqual([{ name: 'Creamy pasta', from: 300, to: 433 }]);
  });

  it('only ever raises, because macros are a floor on energy and not a target', () => {
    // A gin and tonic: alcohol carries 7 kcal/g and appears in none of the four
    // fields, so the calories genuinely exceed what the macros account for.
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Gin and tonic', kcal: 170, protein_g: 0, carbs_g: 16, fat_g: 0 }),
    ]);

    expect(items[0]!.kcal).toBe(170);
    expect(corrected).toEqual([]);
  });

  it.each([
    ['Olive oil', 884, 0, 0, 100],
    ['Butter', 717, 0.85, 0.06, 81],
    ['Chicken breast', 165, 31, 0, 3.6],
    ['Cooked white rice', 130, 2.7, 28, 0.3],
  ])('does not fire on %s at its published figures', (name, kcal, protein, carbs, fat) => {
    const { corrected } = reconcileEnergy([
      item({ name, kcal, protein_g: protein, carbs_g: carbs, fat_g: fat }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('does not fire on almonds, whose measured energy is under the arithmetic', () => {
    const { corrected } = reconcileEnergy([
      item({ name: 'Almonds', kcal: 579, protein_g: 21, carbs_g: 22, fat_g: 50, fiber_g: 12.5 }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('leaves a small item alone where a percentage is not a meaningful amount', () => {
    const { corrected } = reconcileEnergy([
      item({ name: 'Splash of milk', kcal: 17, protein_g: 1, carbs_g: 1.5, fat_g: 1 }),
    ]);
    expect(corrected).toEqual([]);
  });

  it('corrects one item without touching the rest of the meal', () => {
    const { items, corrected } = reconcileEnergy([
      item({ name: 'Chicken', kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7.2 }),
      item({ name: 'Peanut butter', kcal: 90, protein_g: 8, carbs_g: 7, fat_g: 25 }),
    ]);

    expect(items[0]!.kcal).toBe(330);
    expect(items[1]!.kcal).toBe(285);
    expect(corrected.map((c) => c.name)).toEqual(['Peanut butter']);
  });

  it('is idempotent — a corrected item passes the check it was corrected by', () => {
    const once = reconcileEnergy([
      item({ name: 'Creamy pasta', kcal: 300, protein_g: 12, carbs_g: 40, fat_g: 25 }),
    ]);
    const twice = reconcileEnergy(once.items);

    expect(twice.corrected).toEqual([]);
    expect(twice.items[0]!.kcal).toBe(once.items[0]!.kcal);
  });
});
