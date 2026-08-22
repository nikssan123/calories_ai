import { z } from 'zod';

/**
 * Metric on disk, whatever they read on screen.
 *
 * Every column in this app keeps its unit in its own name — `weight_kg`,
 * `quantity_g`, `distance_km` — and that unit never depends on who is looking.
 * A number whose meaning changes with a row in another table is a number no
 * aggregate can be trusted with, and it would mean somebody's whole history
 * changed weight the day they flipped this preference.
 *
 * So this file is the only place a conversion happens, and it happens at the
 * two edges: on the way onto a screen, and on the way off a keyboard.
 *
 * See UNITS.md for what converts, what deliberately does not, and why.
 */

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export const UnitSystem = z.enum(UNIT_SYSTEMS);
export type UnitSystem = z.infer<typeof UnitSystem>;

/**
 * Null on a profile means "never asked" — a new account that onboarding has not
 * reached yet. Resolved here rather than at each call site so that null is a
 * special case in exactly one place: the onboarding prompt, which is the only
 * code that has any business caring about the difference.
 */
export function unitsOf(profile: { units?: UnitSystem | null } | null | undefined): UnitSystem {
  return profile?.units ?? 'metric';
}

// ---- The factors -----------------------------------------------------------

const LB_PER_KG = 2.204_622_621_85;
const OZ_PER_G = 0.035_273_961_95;
const IN_PER_CM = 0.393_700_787_402;
const MI_PER_KM = 0.621_371_192_237;

/** A pound of food, in grams. Where a portion stops being read in ounces. */
const G_PER_LB = 453.592_37;

/** The imperial answer to "per 100 g" — what a deli counter quotes. */
export const GRAMS_PER_OZ = 28.349_523_125;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const gToOz = (g: number) => g * OZ_PER_G;
export const ozToG = (oz: number) => oz / OZ_PER_G;
export const cmToIn = (cm: number) => cm * IN_PER_CM;
export const inToCm = (inches: number) => inches / IN_PER_CM;
export const kmToMi = (km: number) => km * MI_PER_KM;
export const miToKm = (mi: number) => mi / MI_PER_KM;

/** `82.50` → `82.5`, `176.0` → `176`. Precision nobody measured is noise. */
function trim(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, '');
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---- Body weight -----------------------------------------------------------
//
// One decimal in both systems, so switching never looks like the scale moved.

export const bodyWeightUnit = (units: UnitSystem) => (units === 'imperial' ? 'lb' : 'kg');

/** The stored kilograms, as the number this person's scale would show. */
export const toBodyWeight = (kg: number, units: UnitSystem) =>
  round(units === 'imperial' ? kgToLb(kg) : kg, 1);

/** The inverse, for anything typed into a weigh-in field. */
export const bodyWeightToKg = (value: number, units: UnitSystem) =>
  units === 'imperial' ? lbToKg(value) : value;

export const formatBodyWeight = (kg: number, units: UnitSystem) =>
  `${toBodyWeight(kg, units)} ${bodyWeightUnit(units)}`;

/**
 * A change on the scale, sign and all. Separate from the above because the sign
 * is the whole point of it — an unsigned "0.4 kg this week" says nothing.
 */
export function formatWeightDelta(kg: number, units: UnitSystem, signed = true): string {
  const value = toBodyWeight(kg, units);
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value} ${bodyWeightUnit(units)}`;
}

// ---- Height ----------------------------------------------------------------

/**
 * Whole inches. Someone who says they are five ten did not measure to the half
 * inch, and rendering 5′10.2″ back at them is precision the input never had.
 */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cmToIn(cm));
  // 71.6 cm rounds to 12 inches, which is a foot and not "5 feet 12".
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

export const feetInchesToCm = (feet: number, inches: number) => inToCm(feet * 12 + inches);

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units !== 'imperial') return `${round(cm, 0)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″`;
}

// ---- Distance --------------------------------------------------------------

export const distanceUnit = (units: UnitSystem) => (units === 'imperial' ? 'mi' : 'km');

export const toDistance = (km: number, units: UnitSystem) =>
  round(units === 'imperial' ? kmToMi(km) : km, 1);

export const distanceToKm = (value: number, units: UnitSystem) =>
  units === 'imperial' ? miToKm(value) : value;

export const formatDistance = (km: number, units: UnitSystem) =>
  `${trim(toDistance(km, units), 1)} ${distanceUnit(units)}`;

// ---- Barbell load ----------------------------------------------------------
//
// A tenth rather than a whole pound, because microplates exist and somebody
// who added 2.5 lb wants to see that they did.

export const loadUnit = (units: UnitSystem) => (units === 'imperial' ? 'lb' : 'kg');

export const toLoad = (kg: number, units: UnitSystem) =>
  round(units === 'imperial' ? kgToLb(kg) : kg, 1);

export const loadToKg = (value: number, units: UnitSystem) =>
  units === 'imperial' ? lbToKg(value) : value;

export const formatLoad = (kg: number, units: UnitSystem) =>
  `${trim(toLoad(kg, units), 1)} ${loadUnit(units)}`;

// ---- Food portions ---------------------------------------------------------

/**
 * How much of something was on the plate.
 *
 * Ounces up to a pound and pounds above it, because that is where an American
 * recipe changes over too: nobody buys 24 oz of mince, they buy a pound and a
 * half. Grams stay whole — a portion estimated from a photograph does not have
 * a decimal place in it.
 */
export function formatMass(g: number, units: UnitSystem): string {
  if (units !== 'imperial') return `${Math.round(g)} g`;
  if (g >= G_PER_LB) return `${trim(g / G_PER_LB, 1)} lb`;
  return `${trim(gToOz(g), 1)} oz`;
}

/** For the few places that need the number and its unit apart. */
export const massUnit = (units: UnitSystem) => (units === 'imperial' ? 'oz' : 'g');

export const toMass = (g: number, units: UnitSystem) =>
  round(units === 'imperial' ? gToOz(g) : g, units === 'imperial' ? 1 : 0);

export const massToG = (value: number, units: UnitSystem) =>
  units === 'imperial' ? ozToG(value) : value;
