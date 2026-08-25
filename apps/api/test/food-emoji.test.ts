import { describe, expect, it } from 'vitest';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';

/**
 * The emoji table is decoration, so none of this is about being right — it is
 * about the two ways the table can be silently broken.
 *
 * The first is ordering: a compound reached by one of its own ingredients.
 * The second is the one that shipped — an entry written in one of the four
 * languages the app is drawn in matching nothing at all, so every row fell
 * through to the meal fallback and a glass of iced tea logged at lunch came
 * back as a sandwich.
 */

describe('foodEmoji', () => {
  it('matches English', () => {
    expect(foodEmoji('iced tea')).toBe('🍵');
    expect(foodEmoji('chicken soup')).toBe('🍲');
    expect(foodEmoji('cheesecake')).toBe('🍰');
    expect(foodEmoji('grapefruit')).toBe('🍊');
    expect(foodEmoji('hamburger')).toBe('🍔');
    expect(foodEmoji('sweet potato')).toBe('🍠');
    expect(foodEmoji('peanut butter')).toBe('🥜');
    expect(foodEmoji('apple juice')).toBe('🧃');
  });

  it('matches Bulgarian, whose letters ASCII word boundaries cannot see', () => {
    expect(foodEmoji('студен чай', 'lunch')).toBe('🍵');
    expect(foodEmoji('кисело мляко')).toBe('🥛');
    expect(foodEmoji('пилешка супа')).toBe('🍲');
    expect(foodEmoji('кюфтета с картофи')).toBe('🍖');
    expect(foodEmoji('кебапче')).toBe('🍖');
    expect(foodEmoji('кебап')).toBe('🥙');
    expect(foodEmoji('баница')).toBe('🥧');
    expect(foodEmoji('шопска салата')).toBe('🥗');
    expect(foodEmoji('два домата')).toBe('🍅');
  });

  it('matches German, including the words that are one word', () => {
    expect(foodEmoji('eistee')).toBe('🍵');
    expect(foodEmoji('hähnchenbrust mit reis')).toBe('🍗');
    expect(foodEmoji('käsekuchen')).toBe('🍰');
    expect(foodEmoji('käse')).toBe('🧀');
    expect(foodEmoji('zwiebelsuppe')).toBe('🍲');
    expect(foodEmoji('apfelsaft')).toBe('🧃');
    expect(foodEmoji('bratkartoffeln')).toBe('🥔');
  });

  it('matches Spanish and French, accents and all', () => {
    expect(foodEmoji('té helado')).toBe('🍵');
    expect(foodEmoji('thé glacé')).toBe('🍵');
    expect(foodEmoji('ensalada mixta')).toBe('🥗');
    expect(foodEmoji('tarta de queso')).toBe('🍰');
    expect(foodEmoji('pommes de terre')).toBe('🥔');
    expect(foodEmoji('œufs brouillés')).toBe('🍳');
    expect(foodEmoji('blanc de poulet')).toBe('🍗');
  });

  it('still falls back on the meal when nothing matches', () => {
    expect(foodEmoji('whatever it was', 'breakfast')).toBe('🍳');
    expect(foodEmoji('whatever it was', 'lunch')).toBe('🥪');
    expect(foodEmoji('whatever it was')).toBe('🍽️');
  });

  it('never matches a term inside a longer word', () => {
    // The reason `\b` was there in the first place, in every alphabet.
    expect(foodEmoji('hamburger')).not.toBe('🥩');
    expect(foodEmoji('чайник')).toBe('🍵');
    expect(foodEmoji('theatre tickets')).toBe('🍽️');
    expect(foodEmoji('sublime')).toBe('🍽️');
  });
});

describe('exerciseEmoji', () => {
  it('reads every language the app is drawn in', () => {
    expect(exerciseEmoji('5k run')).toBe('🏃');
    expect(exerciseEmoji('бягане 5 км')).toBe('🏃');
    expect(exerciseEmoji('плуване')).toBe('🏊');
    expect(exerciseEmoji('krafttraining')).toBe('🏋️');
    expect(exerciseEmoji('natación')).toBe('🏊');
    expect(exerciseEmoji('randonnée')).toBe('🚶');
  });

  it('falls back to movement', () => {
    expect(exerciseEmoji('something else entirely')).toBe('🏃');
  });
});
