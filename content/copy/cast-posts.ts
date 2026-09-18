/**
 * The Instagram deck. Render with `pnpm cards:cast` (see
 * `scripts/content/cast-cards.ts`).
 *
 * ---------------------------------------------------------------------------
 * Why this file exists next to `cards.txt` rather than inside it
 *
 * `cards.txt` is one string per line because a text card is one string. These
 * are not: a post is a layout, a cast member, a meal with macros that decide
 * who carries it. So the deck is typed, and the type is the brief.
 *
 * ---------------------------------------------------------------------------
 * What the competition is doing, and why this is different (checked 2026-09-18)
 *
 * - **Cal AI** posts almost no design at all: creator video, real plates, a
 *   white caption hook burned into the first frame. It works because they buy
 *   ~400 creators a month. Nothing to copy here without their budget.
 * - **MacroFactor** posts white science cards — condensed uppercase headline, a
 *   diagram, a wordmark at the foot. Authoritative, and cold.
 * - **Lifesum** posts an editorial headline in one accent colour over cream or
 *   a photo, with a paragraph of body copy *inside* the image.
 * - **Yazio** posts memes: cut-out food on paper, "which potato is joining your
 *   dinner?", "would u rather, 600 kcal". Cheapest engagement in the category.
 * - **Duolingo** posts the mascot and nothing else. No logo, no headline
 *   typography, one line in the character's mouth. The character *is* the
 *   brand asset.
 *
 * Four of those five are photography or licensing problems. The fifth is the
 * one we can actually do, because the cast already exists, is drawn from
 * geometry rather than from a stock library, and is tied to the three macros —
 * so a character in a post is not decoration, it is the product explaining
 * itself. That is the whole strategy: Duolingo's format, Yazio's playfulness,
 * and a mechanic neither of them has.
 *
 * ---------------------------------------------------------------------------
 * The rules, which are `cards.txt`'s rules
 *
 * - Every line is true of the app as shipped. No feature claims in a post that
 *   a new install cannot do that day.
 * - The cast never reacts to a number, only to showing up (CAST.md). There is
 *   no "disappointed" drawing and there is no post that shames anybody.
 * - Whoever carries a meal is decided by the meal's own macros, by the same
 *   rule the app uses. Give a meal to the wrong character and the post
 *   contradicts the app.
 * - Typed lines are written the way the corpus says people type: sentence case,
 *   no full stop, a quantity about half the time (`content/copy/corpus.md`).
 */

import type { CastName, Mood, Prop } from '../../packages/shared/src/cast.ts'
import type { Ground } from '../../scripts/content/cast-cards.ts'

export type Post =
  /** One of them, big, with a line over their head. The brand post. */
  | { layout: 'solo'; who: CastName; mood?: Mood; prop?: Prop; head: string; sub?: string; ground?: Ground }
  /** All three on the ledge. The "who are these" post. */
  | { layout: 'trio'; head: string; sub?: string; moods?: [Mood, Mood, Mood]; ground?: Ground }
  /**
   * The app's own moment, drawn rather than screenshotted: somebody types what
   * they ate, a card lands, whoever it is mostly made of catches it. `who` is
   * derived from the macros unless it is named.
   */
  | {
      layout: 'journal'
      typed: string
      meal: string
      kcal: number
      protein: number
      carbs: number
      fat: number
      head?: string
      caught?: string
      who?: CastName
      /** Cheering by default, which is what actually happens when a card lands. */
      mood?: Mood
      ground?: Ground
    }
  /** A meal, the three of them, and a question with a right answer. */
  | { layout: 'guess'; head: string; typed: string; sub?: string; ground?: Ground }

export const POSTS: Post[] = [
  /* ---- Who they are ----------------------------------------------------- */
  {
    layout: 'trio',
    head: 'Meet the three',
    sub: 'Ember is protein, Skye is carbs, Plum is fat. They live in your journal.',
  },
  {
    layout: 'solo',
    who: 'ember',
    mood: 'proud',
    ground: 'macro',
    head: 'Ember takes the protein',
    sub: 'Whoever your meal is mostly made of is the one who catches it.',
  },
  {
    layout: 'solo',
    who: 'skye',
    mood: 'hopeful',
    ground: 'macro',
    head: 'Skye takes the carbs',
    sub: 'Rice, bread, oats, the banana you forgot about.',
  },
  {
    layout: 'solo',
    who: 'plum',
    mood: 'sleepy',
    ground: 'macro',
    head: 'Plum takes the fat',
    sub: 'And sleeps through the small hours, where a 1am snack still counts as tonight.',
  },

  /* ---- What the app does, said by somebody ------------------------------ */
  {
    layout: 'solo',
    who: 'skye',
    mood: 'thinking',
    ground: 'cream',
    head: 'Just type what you ate',
    sub: 'No database, no serving sizes, no scrolling. A sentence is a log.',
  },
  {
    layout: 'solo',
    who: 'ember',
    mood: 'wave',
    head: 'It works with no signal',
    sub: 'Log on the metro. It sends itself when you are back.',
  },
  {
    layout: 'solo',
    who: 'plum',
    mood: 'hold',
    prop: 'mug',
    ground: 'cream',
    head: 'Amounts are optional',
    sub: 'Say 200 g if you know it. Say "a bowl" if you do not.',
  },
  {
    layout: 'solo',
    who: 'ember',
    mood: 'puffed',
    head: 'Exercise goes in the same box',
    sub: 'Type "went for a 5km run" where you type your lunch.',
  },
  {
    layout: 'solo',
    who: 'skye',
    mood: 'stir',
    head: 'Photograph the fridge',
    sub: 'It writes you something to cook out of what is actually in there.',
  },

  /* ---- The mechanic, shown ---------------------------------------------- */
  {
    layout: 'journal',
    head: 'A sentence is a log',
    typed: 'two eggs and toast',
    meal: 'Two eggs and toast',
    kcal: 302,
    protein: 18,
    carbs: 31,
    fat: 12,
    mood: 'idle',
  },
  {
    layout: 'journal',
    head: 'Say it in your own words',
    typed: 'банички и айрян',
    meal: 'Banitsa and ayran',
    kcal: 612,
    protein: 17,
    carbs: 61,
    fat: 33,
    caught: 'Plum caught it — mostly fat',
  },
  {
    layout: 'journal',
    head: 'Change your mind, in words',
    typed: 'actually it was two of them',
    meal: 'Chicken with rice',
    kcal: 780,
    protein: 82,
    carbs: 62,
    fat: 16,
    caught: 'Say what changed and the card changes. No editing a row.',
  },
  {
    layout: 'journal',
    head: 'Even the boring ones',
    typed: 'greek yoghurt with honey',
    meal: 'Greek yoghurt with honey',
    kcal: 244,
    protein: 25,
    carbs: 22,
    fat: 6,
  },

  /* ---- Something to answer ---------------------------------------------- */
  {
    layout: 'guess',
    head: 'Who catches this one?',
    typed: 'feta, tomato and olive oil',
    sub: 'By calories, not by grams. Answer in the comments.',
  },
  {
    layout: 'guess',
    head: 'Whose meal is this?',
    typed: 'chocolate and a black coffee',
    sub: 'One of them is having a much better day than the others.',
  },
]
