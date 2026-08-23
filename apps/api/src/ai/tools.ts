import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type {
  ChatAction,
  ChatCard,
  Confidence,
  DaySummary,
  EntrySource,
  ExerciseEntry,
  FoodEntry,
  Meal,
  MealPlan,
  PantryItem,
  Progress,
  UnitSystem,
} from '@ct/shared';
import { DIETS, UNIT_SYSTEMS, bodyWeightUnit, formatMass, toBodyWeight } from '@ct/shared';
import { query } from '../db.ts';
import { addDays, type DayContext, inferMeal, localDateFor, resolveWhen } from '../time.ts';
import {
  createExerciseEntry,
  createFoodEntry,
  deleteExerciseEntry,
  deleteFoodEntry,
  getFoodEntry,
  logWeight,
  updateFoodEntry,
} from '../services/log.ts';
import { buildDaySummary, buildProgress } from '../services/summary.ts';
import { getUser, markOnboarded, missingProfileFields, updateUser } from '../services/user.ts';
import { addNote, forgetNote, MAX_NOTE_LENGTH } from '../services/notes.ts';
import { calculateTargets, setTargets, targetsForDate } from '../services/targets.ts';
import { latestWeight } from '../services/log.ts';
import { repeatFoodEntry } from '../services/history.ts';
import {
  InvalidBarcodeError,
  InvalidPortionError,
  logScannedProduct,
  lookupBarcode,
} from '../services/barcode.ts';
import {
  addPantryItems,
  ageInDays,
  deletePantryItem,
  listPantry,
  PantryFullError,
  STALE_AFTER_DAYS,
} from '../services/pantry.ts';
import {
  addExtras,
  deleteExtra,
  listExtras,
  ShoppingListFullError,
  updateExtra,
} from '../services/shopping.ts';
import { cookRecipe, getRecipe, listRecipes, setRecipeSaved } from '../services/recipes.ts';
import {
  cookLibraryRecipe,
  getLibraryRecipe,
  listLibrary,
  setLibrarySaved,
} from '../services/library.ts';
import { buildKitchenTools, emptyCollector, type KitchenCollector } from './kitchen.ts';
import type { ToolsetName } from './providers/types.ts';
import { itemShape } from './shapes.ts';

/**
 * §17 in the plan splits the AI into logging / analysis / coaching. That split is
 * expressed here as two groups of tools — writes and reads — over one agent,
 * rather than three prompts. Coaching falls out of the read tools plus the
 * system prompt.
 *
 * These run as an in-process MCP server: no subprocess, no network hop, direct
 * calls into the same services the REST routes use.
 */

export const SERVER_NAME = 'nutrition';

export interface ToolContext {
  userId: string;
  ctx: DayContext;
  now: Date;
  /**
   * Which system the person reads. Only the cards use it — a card's numbers are
   * put there by the server, so the server is the one that has to convert them.
   * Tool *arguments* stay metric whatever this says; see UNITS.md.
   */
  units: UnitSystem;
  /** Set when the turn included a photo, so logged entries link back to it. */
  photoId: string | null;
  /** Collected during the turn and returned to the client for rendering. */
  actions: ChatAction[];
  /**
   * Filled by the kitchen toolset — recipes proposed, ingredients spotted. The
   * journal never sets it, and the kitchen tools are the only readers, so a
   * journal turn carries nothing extra for it.
   */
  kitchen?: KitchenCollector;
}

const FoodItemSchema = z.object(itemShape);
type FoodItemInput = z.infer<typeof FoodItemSchema>;

const confidenceField = z
  .enum(['high', 'medium', 'low'])
  .describe(
    'high = packaged or weighed; medium = a normally described meal; low = a vague description or an unfamiliar restaurant dish.',
  );

const mealField = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

const whenField = z
  .string()
  .nullable()
  .default(null)
  .describe(
    'When it happened, if not now. Accepts an ISO timestamp or plain language ("yesterday 8pm", "this morning"). Null means now.',
  );

const ok = (payload: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
});
const fail = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

function toItems(items: FoodItemInput[]) {
  return items.map((i) => ({
    name: i.name,
    quantity_g: i.quantity_g,
    quantity_desc: i.quantity_desc,
    kcal: i.kcal,
    protein_g: i.protein_g,
    carbs_g: i.carbs_g,
    fat_g: i.fat_g,
    fiber_g: i.fiber_g,
    sodium_mg: i.sodium_mg,
    sat_fat_g: i.sat_fat_g,
    sugar_g: i.sugar_g,
  }));
}

function pickTotals(entry: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }) {
  return {
    kcal: Math.round(entry.kcal),
    protein_g: Math.round(entry.protein_g),
    carbs_g: Math.round(entry.carbs_g),
    fat_g: Math.round(entry.fat_g),
  };
}

/**
 * Cards are built here, from the entry the database just returned, rather than
 * from the arguments the model passed in. The two differ more often than it
 * looks — the meal is inferred from the clock when the model leaves it null,
 * quantities round, and an update returns the merged entry rather than the
 * patch — and a card showing the request instead of the result would be a
 * confident picture of something that did not happen.
 *
 * Exported because the scanner logs without a turn and still owes the journal
 * a card. Two builders would be two answers to "where did this meal leave the
 * day?", and the wrong one would be discovered in a screenshot.
 */
export function foodCard(entry: FoodEntry, day: DaySummary, units: UnitSystem): ChatCard {
  const kcalAfter = Math.round(day.consumed.kcal);
  return {
    type: 'food',
    entry_id: entry.id,
    meal: entry.meal,
    description: entry.description,
    confidence: entry.confidence,
    items: entry.items.map((item) => ({
      name: item.name,
      // The fallback is a weight nobody described, so it is the one the reader's
      // own scale would show — grams for most people, ounces for the rest.
      quantity:
        item.quantity_desc ?? (item.quantity_g === null ? null : formatMass(item.quantity_g, units)),
    })),
    ...pickTotals(entry),
    /*
     * The day this landed in, read back after the write — so the bar on the
     * card is the same arithmetic the ring on the dashboard is doing, not a
     * second opinion about it. `day.consumed` already includes this entry,
     * which is why the "before" figure is derived by taking it back out rather
     * than by reading the day twice and hoping nothing moved in between.
     */
    day: {
      local_date: entry.local_date,
      kcal_before: Math.max(0, kcalAfter - Math.round(entry.kcal)),
      kcal_after: kcalAfter,
      target_kcal: day.targets.kcal,
    },
  };
}

function exerciseCard(entry: ExerciseEntry): ChatCard {
  return {
    type: 'exercise',
    entry_id: entry.id,
    description: entry.description,
    confidence: entry.confidence,
    kcal_burned: Math.round(entry.kcal_burned),
    duration_min: entry.duration_min,
    distance_km: entry.distance_km,
    category: entry.category,
    sets: entry.sets,
  };
}

/**
 * A week of dinners, projected down to what a card draws.
 *
 * Built from the plan the database returned, like every other card here — and
 * trimmed to a line per night, because putting seven whole recipes through a
 * stored chat message to render seven titles would make the journal's history
 * mostly ingredient lists nobody ever reads back.
 */
function planCard(plan: MealPlan): ChatCard {
  return {
    type: 'plan',
    week_start: plan.week_start,
    nights: plan.slots.map((slot) => ({
      slot_id: slot.id,
      local_date: slot.local_date,
      weekday: slot.weekday,
      title: slot.recipe?.title ?? null,
      kcal: slot.recipe ? Math.round(slot.recipe.kcal) : null,
      protein_g: slot.recipe ? Math.round(slot.recipe.protein_g) : null,
      minutes: slot.recipe?.minutes ?? null,
      portions: slot.portions,
      covers: slot.covers,
      cooked: slot.cooked_at !== null,
    })),
  };
}

/**
 * One pantry item, with its age said in days rather than as a timestamp.
 *
 * The age is the whole point of the list — an ingredient last seen three weeks
 * ago is a maybe, and a model handed an ISO date will happily treat it as a
 * fact about the fridge. Staples read as fresh by design.
 */
function pantryLine(item: PantryItem, now: Date) {
  const age = ageInDays(item, now);
  return {
    name: item.name,
    quantity: item.quantity_desc,
    is_staple: item.is_staple,
    last_seen_days_ago: age,
    ...(item.is_staple || age <= STALE_AFTER_DAYS ? {} : { stale: true }),
  };
}

/** Turns a metric name into a plottable card, with real points behind it. */
function trendCard(
  metric: 'calories' | 'protein' | 'weight' | 'exercise',
  days: number,
  caption: string | null,
  progress: Progress,
  units: UnitSystem,
): Extract<ChatCard, { type: 'trend' }> {
  const base = { type: 'trend' as const, metric, caption };
  const window = `last ${days} days`;

  switch (metric) {
    case 'weight':
      return {
        ...base,
        title: `Weight · ${window}`,
        // The only trend with a body unit on it. The series is converted too:
        // the line's shape survives a linear conversion, but the average printed
        // beside it would otherwise be a kilogram figure labelled "lb".
        unit: bodyWeightUnit(units),
        target: null,
        average:
          progress.weight.average_7d_kg === null
            ? null
            : toBodyWeight(progress.weight.average_7d_kg, units),
        series: progress.weight.series.map((point) => ({
          ...point,
          value: point.value === null ? null : toBodyWeight(point.value, units),
          average: point.average === null ? null : toBodyWeight(point.average, units),
        })),
      };
    case 'protein':
      return {
        ...base,
        title: `Protein · ${window}`,
        unit: 'g',
        target: progress.protein.target_g,
        average: progress.protein.average_g,
        series: progress.protein.series,
      };
    case 'exercise':
      return {
        ...base,
        title: `Exercise · ${window}`,
        unit: 'kcal',
        target: null,
        average:
          progress.exercise.series.length === 0
            ? null
            : Math.round(progress.exercise.total_kcal / progress.exercise.series.length),
        series: progress.exercise.series,
      };
    case 'calories':
      return {
        ...base,
        title: `Calories · ${window}`,
        unit: 'kcal',
        target: progress.calories.target_kcal,
        average: progress.calories.average_kcal,
        series: progress.calories.series,
      };
  }
}

export interface ServerOptions {
  /**
   * Drop every write tool. The weekly review reads the same data through the
   * same code path as the journal, but must not be able to change it.
   */
  readOnly?: boolean;
  /**
   * Which set of tools the run gets. `kitchen` replaces the nutrition tools
   * outright rather than adding to them: a recipe agent holding `log_food`
   * would eventually log food, and a fridge photo is not a meal.
   */
  toolset?: ToolsetName;
}

export function buildNutritionServer(tc: ToolContext, options: ServerOptions = {}) {
  const logFood = tool(
    'log_food',
    'Record one meal in the nutrition log. Call it once per meal — a message describing breakfast and lunch is two calls. Break the meal into one item per distinct food so individual parts can be corrected later.',
    {
      description: z.string().describe('Short human label for the whole meal, e.g. "Chicken, rice and salad".'),
      meal: mealField.nullable().default(null).describe('Null to infer from the time it was eaten.'),
      when: whenField,
      items: z.array(FoodItemSchema).min(1),
      note: z.string().nullable().default(null).describe('Anything worth remembering about this entry.'),
      confidence: confidenceField,
    },
    async (args) => {
      const eatenAt = resolveWhen(args.when ?? undefined, tc.now, tc.ctx);
      const entry = await createFoodEntry({
        userId: tc.userId,
        meal: (args.meal as Meal | null) ?? inferMeal(eatenAt, tc.ctx.timezone),
        eatenAt,
        description: args.description,
        note: args.note,
        confidence: args.confidence as Confidence,
        source: (tc.photoId ? 'photo' : 'text') as EntrySource,
        photoId: tc.photoId,
        items: toItems(args.items),
        ctx: tc.ctx,
      });

      const day = await buildDaySummary(tc.userId, entry.local_date);
      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry, day, tc.units),
      });

      return ok({
        entry_id: entry.id,
        // Echoed back on every write. Without it the model cannot tell which day
        // it just wrote to, so a totals figure that belongs to another day reads
        // as today's and gets reported to the user as today's.
        local_date: entry.local_date,
        meal: entry.meal,
        logged: pickTotals(entry),
        day_totals: day.consumed,
        targets: day.targets,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
        protein_remaining: day.targets.protein_g - day.consumed.protein_g,
      });
    },
    { alwaysLoad: true },
  );

  const updateFood = tool(
    'update_food_entry',
    'Correct an entry that is already logged, e.g. when the user says "there was more rice" or "that was actually a large one". Replaces the item list, so send the full corrected set of items, not just the changed one. Use this instead of logging a compensating second entry.',
    {
      entry_id: z.string().describe('The id of the entry to correct.'),
      description: z.string().nullable().default(null),
      meal: mealField.nullable().default(null),
      when: whenField,
      items: z
        .array(FoodItemSchema)
        .nullable()
        .default(null)
        .describe('The complete corrected item list. Null to leave the food unchanged.'),
      confidence: confidenceField.nullable().default(null),
    },
    async (args) => {
      // Read first: a `when` that crosses a day boundary is the single most
      // damaging thing this tool can do silently, and the only way to say so is
      // to know where the entry started.
      const before = await getFoodEntry(tc.userId, args.entry_id);
      const entry = await updateFoodEntry(tc.userId, args.entry_id, {
        meal: (args.meal as Meal | null) ?? undefined,
        description: args.description ?? undefined,
        confidence: (args.confidence as Confidence | null) ?? undefined,
        eatenAt: args.when ? resolveWhen(args.when, tc.now, tc.ctx) : undefined,
        items: args.items ? toItems(args.items) : undefined,
        ctx: tc.ctx,
      });

      if (!entry) return fail('No entry with that id. Call get_day to list the ids for a date.');

      const day = await buildDaySummary(tc.userId, entry.local_date);
      tc.actions.push({
        kind: 'food_updated',
        entry_id: entry.id,
        summary: `Updated ${entry.description} — now ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry, day, tc.units),
      });

      const movedFrom = before && before.local_date !== entry.local_date ? before.local_date : null;
      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        ...(movedFrom
          ? {
              moved_from_date: movedFrom,
              warning: `This entry was moved from ${movedFrom} to ${entry.local_date}. Only leave it moved if the user asked for that entry to change day; otherwise move it back.`,
            }
          : {}),
        updated: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
      });
    },
    { alwaysLoad: true },
  );

  const logExercise = tool(
    'log_exercise',
    'Record an activity and its estimated burn. Exercise burn is inherently uncertain — prefer conservative estimates and set confidence to "low" unless the user gave real data from a device. For anything covering ground, fill in distance_km: it is the assumption the user is most likely to correct.',
    {
      description: z.string().describe('e.g. "5km run", "45 min weight training".'),
      duration_min: z.number().nullable().default(null),
      distance_km: z
        .number()
        .nullable()
        .default(null)
        .describe(
          'Distance covered in kilometres, always — convert from miles yourself, 5 mi is 8.05. Send the figure you actually based the burn on, including when you estimated it yourself from a described route. Null for activities that do not cover ground.',
        ),
      kcal_burned: z.number().describe('Estimated calories burned.'),
      when: whenField,
      confidence: confidenceField,
    },
    async (args) => {
      const entry = await createExerciseEntry({
        userId: tc.userId,
        description: args.description,
        performedAt: resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
        durationMin: args.duration_min,
        distanceKm: args.distance_km,
        kcalBurned: args.kcal_burned,
        confidence: args.confidence as Confidence,
        source: 'text',
        ctx: tc.ctx,
      });

      tc.actions.push({
        kind: 'exercise_logged',
        entry_id: entry.id,
        summary: `${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`,
        card: exerciseCard(entry),
      });
      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        kcal_burned: entry.kcal_burned,
        distance_km: entry.distance_km,
      });
    },
    { alwaysLoad: true },
  );

  const categoryField = z
    .enum(['strength', 'cardio', 'class', 'sport', 'flexibility'])
    .describe(
      'strength = sets and reps against a load; cardio = running, cycling, swimming, machines; class = HIIT, spin, CrossFit, anything an instructor ran; sport = a game or a climb; flexibility = yoga, pilates, stretching.',
    );

  /**
   * The counted path. `log_exercise` above estimates a burn from a sentence,
   * which is right for "5km run"; this one is for work measured in sets, where
   * the load is the point and the burn is the number nobody came for.
   */
  const logWorkout = tool(
    'log_workout',
    'Record a training session where the user told you the actual sets — "bench 3x8 at 80kg", "5 sets of 10 squats". One call per session, with every exercise in it. Use log_exercise instead for anything measured in time or distance, and ask_workout when they said they trained but not what they did.',
    {
      category: categoryField,
      when: whenField,
      duration_min: z
        .number()
        .nullable()
        .default(null)
        .describe('Total session time if they said. Null to estimate it from the sets.'),
      exercises: z
        .array(
          z.object({
            name: z.string().describe('The exercise, as they said it — "Bench press", "Bulgarian split squat".'),
            sets: z
              .array(
                z.object({
                  reps: z.number().nullable().default(null),
                  weight_kg: z.number().nullable().default(null).describe('Load per set, in kilograms always — convert from pounds yourself, 225 lb is 102. Null for bodyweight.'),
                  duration_sec: z.number().nullable().default(null).describe('For a held exercise like a plank.'),
                  distance_m: z.number().nullable().default(null),
                }),
              )
              .min(1)
              .describe('One entry per set actually performed. "3x8" is three entries of 8, not one saying 3.'),
          }),
        )
        .min(1),
    },
    async (args) => {
      const { logWorkout: write } = await import('../services/workouts.ts');
      const entry = await write({
        userId: tc.userId,
        category: args.category as never,
        exercises: args.exercises as never,
        durationMin: args.duration_min,
        performedAt: resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
        ctx: tc.ctx,
      });

      tc.actions.push({
        kind: 'exercise_logged',
        entry_id: entry.id,
        summary: `${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`,
        card: exerciseCard(entry),
      });
      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        sets_recorded: entry.sets.length,
        duration_min: entry.duration_min,
        kcal_burned: entry.kcal_burned,
        // Said back so the model does not report a burn it invented: this
        // figure came from bodyweight, time and a MET, not from the sentence.
        burn_note: 'Computed from their bodyweight and the time, not estimated by you.',
      });
    },
    { alwaysLoad: true },
  );

  /**
   * "Went to the gym" is not a loggable fact, and the three things that would
   * make it one — which kind, which exercises, how many — are things the user
   * knows and the model would only guess at.
   *
   * Asking in conversation would be three more turns and most of a minute for
   * something they could tap out in fifteen seconds. So the tool draws a card
   * that collects the lot and posts it itself, and the model's part ends here.
   */
  const askWorkout = tool(
    'ask_workout',
    'Draw the workout card when they say they trained but not what they did — "went to the gym", "did a workout", "leg day". It asks them which kind and collects the exercises and sets. Do not call it when they already told you enough to log: a run with a distance goes to log_exercise, and named sets go to log_workout.',
    {
      category: categoryField
        .nullable()
        .default(null)
        .describe('Where to open the card, if they hinted. Null to let them choose.'),
      when: whenField,
      heard: z
        .string()
        .nullable()
        .default(null)
        .describe('What you understood, in a few words — "gym session this morning". Shown on the card so the question does not feel blind.'),
    },
    async (args) => {
      tc.actions.push({
        kind: 'workout_asked',
        entry_id: null,
        summary: args.heard ?? 'Workout',
        card: {
          type: 'workout_prompt',
          suggested_category: (args.category as never) ?? null,
          performed_at: resolveWhen(args.when ?? undefined, tc.now, tc.ctx).toISOString(),
          heard: args.heard,
        },
      });
      // Nothing is logged yet, and saying so keeps the model from congratulating
      // them on a session that is still an unanswered question on their screen.
      return ok({
        asked: true,
        logged: false,
        note: 'The card is on their screen and fills itself in. Say one short line inviting them to fill it, and do not claim anything has been recorded.',
      });
    },
    { alwaysLoad: true },
  );

  /**
   * Nobody should have to pick "Other" because their gym does an exercise this
   * app has not been told about.
   */
  const defineExercise = tool(
    'define_exercise',
    'Teach the app an exercise it does not know, so it appears in their picker from now on. Call it when they mention something specific that is not already in the catalogue — a machine, a variation, a named movement. Do not call it for one-off phrasings of something that already exists ("chest day" is not an exercise).',
    {
      name: z.string().describe('The exercise, properly capitalised — "Bulgarian split squat".'),
      category: categoryField,
      emoji: z.string().describe('One emoji for it. Reuse the obvious one: 🏋️ barbell work, 🦵 legs, 💪 arms and shoulders, 🤸 bodyweight, 🏃 cardio, 🧘 mobility.'),
      tracks: z
        .enum(['reps', 'duration', 'distance'])
        .describe('What one set is measured in, which decides the fields they get: reps and a load, a clock, or a distance.'),
      met: z
        .number()
        .describe('Metabolic equivalent. Roughly: 3 easy, 5 ordinary weights, 8 hard, 10+ flat out. Match a similar exercise rather than agonising.'),
    },
    async (args) => {
      const { defineExerciseType } = await import('../services/workouts.ts');
      const type = await defineExerciseType({
        userId: tc.userId,
        name: args.name,
        category: args.category as never,
        emoji: args.emoji,
        tracks: args.tracks as never,
        met: args.met,
      });
      return ok({ exercise: type.name, id: type.id, already_known: !type.custom });
    },
    { alwaysLoad: true },
  );

  const logWeightTool = tool(
    'log_weight',
    'Record a bodyweight measurement. One per day — logging again for the same day replaces the earlier value.',
    {
      weight_kg: z.number().describe('Kilograms, always. Convert from pounds or stones yourself before calling — 180 lb is 81.6.'),
      when: whenField,
    },
    async (args) => {
      const entry = await logWeight(
        tc.userId,
        args.weight_kg,
        resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
        tc.ctx,
      );
      // §12 again: a single weigh-in means very little on its own, so the card
      // shows it against the trend rather than as a number to react to.
      const trend = await buildProgress(tc.userId, tc.ctx, 30);
      tc.actions.push({
        kind: 'weight_logged',
        entry_id: entry.id,
        summary: `Weight ${entry.weight_kg} kg on ${entry.local_date}`,
        card: {
          type: 'weight',
          weight_kg: entry.weight_kg,
          change_7d_kg: trend.weight.change_7d_kg,
          series: trend.weight.series,
        },
      });
      return ok(entry);
    },
    { alwaysLoad: true },
  );

  const remember = tool(
    'remember',
    'Save a standing instruction the user gives you about how to log or how to talk to them — "don\'t log my commute walk", "I use a small plate", "skip the remaining-budget line". Only for things that apply from now on. A one-off correction to a meal is not a note: fix the entry instead, where the number itself is the record. Nor is a recipe they want kept — that is `import_recipe`, which prices it so it can actually be cooked and logged.',
    {
      note: z
        .string()
        .describe('The instruction in one short sentence, written so it still makes sense months later.'),
    },
    async (args) => {
      const saved = await addNote(tc.userId, args.note);
      if (!saved) return fail('An empty note has nothing to remember.');
      return ok({ remembered: saved.note, note_id: saved.id, max_length: MAX_NOTE_LENGTH });
    },
    { alwaysLoad: true },
  );

  const forget = tool(
    'forget',
    'Drop a standing instruction that no longer applies, by the id shown in your notes.',
    { note_id: z.string() },
    async (args) => {
      const gone = await forgetNote(tc.userId, args.note_id);
      if (!gone) return fail('No note with that id. The current notes are listed in your context.');
      return ok({ forgotten: true });
    },
    { alwaysLoad: true },
  );

  const deleteEntry = tool(
    'delete_entry',
    'Remove a logged entry the user says did not happen or was a mistake.',
    {
      entry_id: z.string(),
      kind: z.enum(['food', 'exercise']),
    },
    async (args) => {
      const existing = args.kind === 'food' ? await getFoodEntry(tc.userId, args.entry_id) : null;
      const deleted =
        args.kind === 'food'
          ? await deleteFoodEntry(tc.userId, args.entry_id)
          : await deleteExerciseEntry(tc.userId, args.entry_id);

      if (!deleted) return fail('No entry with that id. Call get_day to list the ids for a date.');

      tc.actions.push({
        kind: 'food_deleted',
        entry_id: args.entry_id,
        summary: `Removed ${existing?.description ?? 'entry'}`,
        // Nothing to draw: the entry it referred to no longer exists.
        card: null,
      });
      return ok({ deleted: true, local_date: existing?.local_date ?? null });
    },
    { alwaysLoad: true },
  );

  const getDay = tool(
    'get_day',
    'Read a full day: totals, targets, every entry with its id, and the weigh-in. Call this before correcting or deleting an entry whose id you do not already have. Defaults to today.',
    {
      date: z.string().nullable().default(null).describe('YYYY-MM-DD. Null for today.'),
      days_ago: z.number().nullable().default(null).describe('Alternative to date — 1 means yesterday.'),
    },
    async (args) => {
      const today = localDateFor(tc.now, tc.ctx);
      const date = args.date ?? (args.days_ago ? addDays(today, -args.days_ago) : today);
      const day = await buildDaySummary(tc.userId, date);
      return ok({
        local_date: day.local_date,
        consumed: day.consumed,
        targets: day.targets,
        burned_kcal: day.burned_kcal,
        weight_kg: day.weight?.weight_kg ?? null,
        food: day.food_entries.map((e) => ({
          id: e.id,
          meal: e.meal,
          description: e.description,
          kcal: Math.round(e.kcal),
          protein_g: Math.round(e.protein_g),
          confidence: e.confidence,
          items: e.items.map((i) => ({
            name: i.name,
            quantity_g: i.quantity_g,
            quantity_desc: i.quantity_desc,
            kcal: Math.round(i.kcal),
          })),
        })),
        exercise: day.exercise_entries.map((e) => ({
          id: e.id,
          description: e.description,
          duration_min: e.duration_min,
          distance_km: e.distance_km,
          kcal_burned: Math.round(e.kcal_burned),
        })),
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const searchHistory = tool(
    'search_food_history',
    'Search past meals by keyword and/or meal slot. This is how you answer "what do I normally have for breakfast?" and how you resolve shorthand like "my usual" — look up what they actually ate before and reuse those quantities.',
    {
      query: z.string().nullable().default(null).describe('Matches the meal description and item names.'),
      meal: mealField.nullable().default(null),
      days_back: z.number().nullable().default(null).describe('How far back to search. Null means 90.'),
      limit: z.number().nullable().default(null).describe('Max entries to return. Null means 10.'),
    },
    async (args) => {
      const today = localDateFor(tc.now, tc.ctx);
      const from = addDays(today, -(args.days_back ?? 90));
      const limit = Math.min(args.limit ?? 10, 30);

      const rows = await query<any>(
        `SELECT e.id, e.meal, e.local_date, e.description,
                COALESCE(SUM(i.kcal), 0)      AS kcal,
                COALESCE(SUM(i.protein_g), 0) AS protein_g,
                json_agg(
                  json_build_object('name', i.name, 'quantity_g', i.quantity_g,
                                    'quantity_desc', i.quantity_desc, 'kcal', i.kcal)
                  ORDER BY i.position
                ) FILTER (WHERE i.id IS NOT NULL) AS items
           FROM food_entries e
           LEFT JOIN food_items i ON i.entry_id = e.id
          WHERE e.user_id = $1
            AND e.local_date >= $2
            AND ($3::text IS NULL OR e.meal = $3)
            AND ($4::text IS NULL OR e.description ILIKE '%' || $4 || '%'
                 OR EXISTS (SELECT 1 FROM food_items fi
                             WHERE fi.entry_id = e.id AND fi.name ILIKE '%' || $4 || '%'))
       GROUP BY e.id
       ORDER BY e.local_date DESC, e.eaten_at DESC
          LIMIT $5`,
        [tc.userId, from, args.meal, args.query, limit],
      );

      return ok({
        matches: rows.map((r) => ({
          id: r.id,
          date: r.local_date,
          meal: r.meal,
          description: r.description,
          kcal: Math.round(Number(r.kcal)),
          protein_g: Math.round(Number(r.protein_g)),
          items: r.items ?? [],
        })),
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const setProfile = tool(
    'set_profile',
    'Save what you have learned about the user during setup: sex, date of birth, height, activity level, goal, target weight, which units they read. Call it as soon as you learn a value — do not wait until you have them all. Targets are recalculated automatically each time. To record their current weight use log_weight instead; that is a measurement, not a profile field. It also holds what they will not eat, which is the one thing here you may learn long after setup is over.',
    {
      sex: z.enum(['male', 'female']).nullable().default(null),
      birth_date: z.string().nullable().default(null).describe('YYYY-MM-DD. If they give only an age, convert it to an approximate birth date.'),
      height_cm: z.number().nullable().default(null).describe('Height in centimetres, always — convert from feet and inches yourself. 5\'10" is 178.'),
      target_weight_kg: z.number().nullable().default(null).describe('Goal weight in kilograms, always — convert from pounds or stones yourself. 165 lb is 74.8.'),
      units: z
        .enum(UNIT_SYSTEMS)
        .nullable()
        .default(null)
        .describe(
          'Which system they read: "imperial" for pounds, ounces, feet and miles, "metric" for kilos, grams and kilometres. Set it from how they answer rather than asking twice — someone who says they are 5\'10" and 180 lb has told you. It changes nothing about what you store here, only how you write numbers back to them.',
        ),
      activity_level: z
        .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
        .nullable()
        .default(null)
        .describe('sedentary = desk job; light = 1-3 sessions/week; moderate = 3-5; active = 6-7; very_active = physical job or twice daily.'),
      goal: z.enum(['lose', 'maintain', 'gain']).nullable().default(null),
      display_name: z.string().nullable().default(null).describe('What they want to be called.'),
      timezone: z.string().nullable().default(null).describe('IANA name, e.g. Europe/Sofia.'),
      day_start_hour: z
        .number()
        .nullable()
        .default(null)
        .describe('Hour their day rolls over, 0-12. Default 4 — only set it if they say something about late-night eating.'),
      /*
       * The two fields here that are not about setup at all.
       *
       * They belong on the profile rather than in a note because they are true
       * of every meal this person will ever eat, and because the recipe engine
       * reads them as hard limits — which it does not, and cannot, do for a
       * sentence filed with `remember`. Someone who says they are vegetarian
       * once should never be handed a chicken traybake, and telling them you
       * have "made a note of it" when the kitchen cannot see the note is the
       * shape of promise this app does not get to make.
       */
      diet: z
        .enum(DIETS)
        .nullable()
        .default(null)
        .describe('A dietary pattern they keep, when they mention one. "none" clears it. Set it the moment they say it, whether or not you are in setup.'),
      avoids: z
        .array(z.string())
        .nullable()
        .default(null)
        .describe(
          'Foods they will not or cannot eat — allergies, intolerances, dislikes strong enough to matter. The complete list, not an addition: send what they already avoid plus the new one, and an empty list to clear it. Their current list is in your context.',
        ),
    },
    async (args) => {
      // Only forward the fields actually supplied; null means "not mentioned".
      const patch = Object.fromEntries(
        Object.entries(args).filter(([, value]) => value !== null),
      );
      const profile = await updateUser(tc.userId, patch);

      // Recalculate targets from whatever is now known, unless the user has
      // taken manual control of them.
      const today = localDateFor(tc.now, tc.ctx);
      const existing = await targetsForDate(tc.userId, today);
      if (!existing.is_custom) {
        const weight = await latestWeight(tc.userId);
        await setTargets(
          tc.userId,
          today,
          calculateTargets({
            sex: profile.sex,
            birth_date: profile.birth_date,
            height_cm: profile.height_cm,
            weight_kg: weight?.weight_kg ?? null,
            activity_level: profile.activity_level,
            goal: profile.goal,
          }),
          'set during conversation',
        );
      }

      const missing = missingProfileFields(profile);
      const weight = await latestWeight(tc.userId);
      if (missing.length === 0 && weight && !profile.is_setup_complete) {
        await markOnboarded(tc.userId);
      }

      const targets = await targetsForDate(tc.userId, today);
      return ok({
        saved: Object.keys(patch),
        still_missing: missing,
        current_weight_kg: weight?.weight_kg ?? null,
        needs_current_weight: !weight,
        targets,
        /*
         * Returned with the number rather than left to the prompt, because this
         * is the one moment the caveat is actually load-bearing: a target that
         * arrives with no account of where it came from gets read as a
         * prescription, and it is nothing of the sort.
         */
        what_this_number_is:
          'Mifflin-St Jeor times an activity multiplier, plus a goal adjustment — a population average for someone this size, not a measurement of them. Say so in a clause the first time you hand it over, mention that it will be corrected from their own data after a fortnight of logging, and say that anyone pregnant, breastfeeding, or managing a medical condition should get their number from a clinician instead. Once, in passing. Do not repeat it every time targets come up.',
      });
    },
    { alwaysLoad: true },
  );

  const getProgress = tool(
    'get_progress',
    'Read trends over a window: average calories and protein, weight trend, adherence, exercise volume. Use this for "am I on track?", "why have I not lost weight?", and anything about averages rather than a single day.',
    {
      days: z.number().nullable().default(null).describe('Window size in days. Null means 30.'),
    },
    async (args) => {
      const progress = await buildProgress(tc.userId, tc.ctx, Math.min(args.days ?? 30, 365));
      // Trim the per-day series: the model needs the aggregates, not 30 rows.
      return ok({
        weight: {
          current_kg: progress.weight.current_kg,
          average_7d_kg: progress.weight.average_7d_kg,
          change_7d_kg: progress.weight.change_7d_kg,
          change_since_start_kg: progress.weight.change_since_start_kg,
          to_target_kg: progress.weight.to_target_kg,
        },
        calories: {
          average_kcal: progress.calories.average_kcal,
          target_kcal: progress.calories.target_kcal,
        },
        protein: progress.protein,
        exercise: progress.exercise,
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  /**
   * The display tools.
   *
   * They take no data — only a choice of what to draw — and the series is read
   * from Postgres here. That asymmetry is the whole design: the model is good
   * at knowing when a picture answers better than a paragraph, and a model that
   * could also supply the points could draw a weight loss that never happened.
   * A wrong sentence invites argument; a wrong chart is just believed.
   */
  const showChart = tool(
    'show_chart',
    'Draw a chart in the conversation. Use it when the answer is about a shape over time — "am I on track?", "how has my weight moved?", "have I been eating more at weekends?" — where a trend line says it better than a sentence. The data is read from the log; you choose only the metric and the window. Say your point in words too: the chart supports the answer, it is not the answer. Do not call this for a single day or when the user asked something a number answers.',
    {
      metric: z
        .enum(['calories', 'protein', 'weight', 'exercise'])
        .describe('Which series to plot.'),
      days: z.number().nullable().default(null).describe('Window size in days. Null means 30.'),
      caption: z
        .string()
        .nullable()
        .default(null)
        .describe('One short line under the title saying what it shows. Null for none.'),
    },
    async (args) => {
      const days = Math.min(Math.max(args.days ?? 30, 7), 365);
      const progress = await buildProgress(tc.userId, tc.ctx, days);
      const card = trendCard(args.metric, days, args.caption, progress, tc.units);

      tc.actions.push({
        kind: 'card_shown',
        entry_id: null,
        summary: card.title,
        card,
      });
      // Deliberately terse: the numbers went to the user, not to the model. The
      // model already has get_progress when it needs to reason about them.
      return ok({ shown: args.metric, days });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const showDay = tool(
    'show_day',
    'Draw one day as a card — calories against target, macros, and any burn. Use it when the user asks how a day went, or after a log when the state of the day is the point rather than the meal. Do not call it after every single log; the app already shows the running total.',
    {
      date: z
        .string()
        .nullable()
        .default(null)
        .describe('YYYY-MM-DD. Null means today.'),
      caption: z.string().nullable().default(null).describe('One short line under the title.'),
    },
    async (args) => {
      const date = args.date ?? localDateFor(tc.now, tc.ctx);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('date must be YYYY-MM-DD.');

      const day = await buildDaySummary(tc.userId, date);
      tc.actions.push({
        kind: 'card_shown',
        entry_id: null,
        summary: `${date} — ${day.consumed.kcal} of ${day.targets.kcal} kcal`,
        card: {
          type: 'day',
          local_date: day.local_date,
          caption: args.caption,
          consumed: day.consumed,
          targets: day.targets,
          burned_kcal: day.burned_kcal,
        },
      });
      return ok({ shown: date });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  /*
   * The kitchen gets its own tools and none of these.
   *
   * Built after the nutrition tools rather than instead of them so this
   * function keeps one signature and one return shape — the Anthropic provider
   * rebuilds the server from here on every run and should not have to know
   * which kind of run it is beyond passing the option through. The unused
   * definitions above cost a closure allocation and nothing else; they are
   * never handed to a model.
   */
  if (options.toolset === 'kitchen') {
    const { tools } = buildKitchenTools({
      userId: tc.userId,
      kitchen: tc.kitchen ?? emptyCollector(),
    });
    return {
      server: createSdkMcpServer({ name: SERVER_NAME, version: '1.0.0', tools }),
      toolNames: tools.map((t) => `mcp__${SERVER_NAME}__${t.name}`),
      tools,
    };
  }

  /**
   * "What can I make tonight?" — answered in the conversation.
   *
   * The Cook tab was the only door to the kitchen, which is the wrong shape for
   * a product whose front page is a chat box: the question arrives in the
   * journal far more often than anyone goes looking for a tab.
   *
   * Two things about it are unusual and deliberate. It runs a whole second
   * agent inside a tool call, which is why it is slow and why its cost is
   * recorded separately under `recipe` — the journal turn is Sonnet and this is
   * Opus, and folding them into one figure would misprice both. And it enforces
   * its own ceiling, because the route limiter counts requests to
   * `/recipes/suggest` and this request never goes there.
   */
  const suggestRecipesTool = tool(
    'suggest_recipes',
    'Answer "what can I cook?" / "what should I make for dinner?" with real recipes built from what is in their kitchen and what is left of their day. Use it when they are asking what to cook, not when they are asking what they ate or how they are doing. It is slow and it costs money, so call it once per conversation turn at most, and not at all if they only wanted a sentence of advice.',
    {
      wants: z
        .string()
        .nullable()
        .default(null)
        .describe('What they asked for in their own words — "something quick", "use up the spinach". Null if they just asked what to cook.'),
      meal: mealField.nullable().default(null).describe('Null to infer from the time of day.'),
      minutes: z
        .number()
        .nullable()
        .default(null)
        .describe('Minutes they have, if they said. Null if they did not.'),
      portions: z
        .number()
        .nullable()
        .default(null)
        .describe('How many servings to cook, if they want to batch it. Null means one.'),
      protein_min: z.number().nullable().default(null).describe('A protein floor, if they asked for one.'),
      kcal_max: z.number().nullable().default(null).describe('A calorie ceiling, if they asked for one.'),
    },
    async (args) => {
      /*
       * Imported at call time, not at the top of the file. `ai/recipes.ts`
       * builds its tools through `buildNutritionServer`, so a static import
       * here would be a cycle evaluated at module load — and this one is
       * genuinely lazy anyway, since most journal turns never reach it.
       */
      const { suggestRecipes, RecipeBudgetError } = await import('./recipes.ts');

      let recipes, message;
      try {
        // The ceiling is enforced inside the engine, so this tool shares one
        // budget with the three routes rather than having a fourth of its own.
        ({ recipes, message } = await suggestRecipes(tc.userId, {
          meal: (args.meal as Meal | null) ?? null,
          wants: args.wants,
          minutes: args.minutes,
          portions: args.portions,
          proteinMin: args.protein_min,
          kcalMax: args.kcal_max,
          now: tc.now,
        }));
      } catch (error) {
        if (error instanceof RecipeBudgetError) {
          return fail(
            `They have used all ${error.allowed} recipe suggestions for today. Tell them so plainly, and answer from what you already know — search_food_history will tell you what they usually eat.`,
          );
        }
        throw error;
      }

      tc.actions.push({
        kind: 'recipes_suggested',
        entry_id: null,
        summary: recipes.map((r) => r.title).join(', '),
        card: { type: 'recipes', recipes },
      });

      // Terse on purpose, as with the display tools: the recipes went to the
      // user's screen as cards. What the model gets back is enough to write a
      // sentence around them and nothing it would be tempted to recite.
      return ok({
        suggested: recipes.map((r) => ({
          title: r.title,
          kcal: Math.round(r.kcal),
          protein_g: Math.round(r.protein_g),
          minutes: r.minutes,
          missing: r.ingredients.filter((i) => i.missing).map((i) => i.name),
        })),
        your_note_to_them: message,
      });
    },
    { alwaysLoad: true },
  );

  /**
   * "Save this — it's how I make it."
   *
   * The journal could suggest a recipe and could not keep one. Asked to save a
   * dish somebody already cooks, the only tool that fit at all was `remember`,
   * so the answer came back as a standing note: "I'll reference it for nutrients
   * next time." True of what it did, and not at all what was asked — a note is
   * a sentence in the prompt, not a recipe you can scale and log in a tap.
   *
   * The Cook tab has had the paste-a-recipe form since the kitchen shipped.
   * This is the same engine behind the same budget, reached from the place
   * people actually mention their own cooking.
   */
  const importRecipeTool = tool(
    'import_recipe',
    'Save a recipe the user brought — their own, a family one, something they pasted or dictated — as one of their recipes, priced per portion so it can be logged in one tap afterwards. Use it whenever they ask you to save, keep, add or remember a recipe, or hand you a dish with its ingredients and method. This, not `remember`: a note cannot be scaled, priced or cooked. Needs a real recipe to work from — at least a list of ingredients — so ask for the method if all you have is a name. It is slow and it costs money, so call it once per turn at most.',
    {
      text: z
        .string()
        .describe(
          'The recipe as they gave it: title, ingredients and method, in their own words. Pass everything they said about it — do not summarise it, and do not invent quantities they did not give.',
        ),
      portions: z
        .number()
        .nullable()
        .default(null)
        .describe('How many portions it makes, if they said. Null to let the recipe speak for itself.'),
    },
    async (args) => {
      // Lazy for the same reason as suggest_recipes: `ai/recipes.ts` builds its
      // tools through this module, so a static import here is a load-time cycle.
      const { suggestRecipes, RecipeBudgetError } = await import('./recipes.ts');

      const text = args.text.trim();
      if (text.length < 20) {
        return fail(
          'That is not enough to price. Ask them for the ingredients and roughly how it is made, then call this again.',
        );
      }

      let recipes, message;
      try {
        ({ recipes, message } = await suggestRecipes(tc.userId, {
          portions: args.portions,
          now: tc.now,
          job: { kind: 'import', text },
        }));
      } catch (error) {
        if (error instanceof RecipeBudgetError) {
          return fail(
            `They have used all ${error.allowed} recipe runs for today, so this one cannot be saved yet. Tell them plainly, and that it will work again tomorrow.`,
          );
        }
        throw error;
      }

      const [saved] = recipes;
      if (!saved) return fail("That did not come back as a recipe. Ask them to say how it's made.");

      tc.actions.push({
        kind: 'recipes_suggested',
        entry_id: null,
        summary: saved.title,
        card: { type: 'recipes', recipes },
      });

      // Terse, as with the other card tools: it is already on their screen.
      return ok({
        saved: {
          title: saved.title,
          portions: saved.portions,
          kcal_per_portion: Math.round(saved.kcal),
          protein_g_per_portion: Math.round(saved.protein_g),
        },
        where_it_lives: 'Cook, under "For you" — and it can be logged from there or from here.',
        your_note_to_them: message,
      });
    },
    { alwaysLoad: true },
  );

  // ---- The kitchen ---------------------------------------------------------

  /**
   * The pantry, from the conversation.
   *
   * `suggest_recipes` has always read it, but only from the inside: the journal
   * could cook out of a kitchen it was not allowed to look at or correct. So
   * "what have I got in?" had no answer, and "I used the last of the chicken"
   * landed on the only tool that would take it — `remember` — which files it as
   * a sentence in a prompt the kitchen never reads. The pantry is the main
   * input to every recipe this app suggests, and it was reachable from one tab
   * and nowhere else.
   */
  const getPantry = tool(
    'get_pantry',
    'Read what they have told the app is in their kitchen, with how long ago each item was last mentioned. Use it for "what have I got in?", before you talk about cooking something specific, and to check whether an item is already listed before adding it.',
    {},
    async () => {
      const items = await listPantry(tc.userId);
      return ok({
        count: items.length,
        items: items.map((item) => pantryLine(item, tc.now)),
        // Said on every read rather than left to the prompt, because this is
        // the premise the model would otherwise get wrong in the direction that
        // costs something: a confident recipe built on food that is long gone.
        what_this_is: `A memory of what they have mentioned, not a stocktake. Nothing is deducted when they cook, so anything last seen more than ${STALE_AFTER_DAYS} days ago is a maybe — build on it only if you say you are assuming it is still there. Staples are exempt from that.`,
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const updatePantry = tool(
    'update_pantry',
    'Change what the app thinks is in their kitchen. Adding an item that is already listed refreshes it rather than duplicating it, which is also how you record "yes, still got that". Call it whenever they mention shopping, running out, or using something up — "got a big bag of rice", "we finished the eggs" — so the next recipe is built on what is actually there. Both lists are optional; send whichever the sentence gave you.',
    {
      add: z
        .array(
          z.object({
            name: z.string().describe('The ingredient as someone would write it on a list — "Chicken thighs", not "some chicken".'),
            quantity_desc: z
              .string()
              .nullable()
              .default(null)
              .describe('Roughly how much, in their words — "a big bag", "2 tins". Null if they did not say.'),
            is_staple: z
              .boolean()
              .default(false)
              .describe('True only for things that are simply always there — salt, oil, flour. A staple never ages out and is never put on a shopping list.'),
          }),
        )
        .nullable()
        .default(null)
        .describe('Things they have, or have just bought. Null if they only used something up.'),
      remove: z
        .array(z.string())
        .nullable()
        .default(null)
        .describe('Names of things that are gone, exactly as get_pantry lists them. Null if nothing ran out.'),
    },
    async (args) => {
      const additions = args.add ?? [];
      const removals = args.remove ?? [];
      if (additions.length === 0 && removals.length === 0) {
        return fail('Nothing to add and nothing to remove. Say what changed.');
      }

      const before = await listPantry(tc.userId);
      const byName = new Map(before.map((item) => [item.name.toLowerCase(), item]));

      const removed: string[] = [];
      const notFound: string[] = [];
      for (const name of removals) {
        const item = byName.get(name.trim().toLowerCase());
        if (item && (await deletePantryItem(tc.userId, item.id))) removed.push(item.name);
        else notFound.push(name);
      }

      let added: string[] = [];
      let refreshed: string[] = [];
      if (additions.length > 0) {
        const profile = await getUser(tc.userId);
        try {
          await addPantryItems(
            tc.userId,
            profile.plan,
            additions.map((item) => ({
              name: item.name,
              quantity_desc: item.quantity_desc,
              is_staple: item.is_staple,
              source: 'typed' as const,
            })),
          );
        } catch (error) {
          if (error instanceof PantryFullError) return fail(error.message);
          throw error;
        }
        // Split after the write rather than guessed before it, so the wording
        // matches what actually happened to a name that was already there.
        added = additions.filter((i) => !byName.has(i.name.trim().toLowerCase())).map((i) => i.name);
        refreshed = additions.filter((i) => byName.has(i.name.trim().toLowerCase())).map((i) => i.name);
      }

      return ok({
        added,
        refreshed,
        removed,
        ...(notFound.length > 0
          ? { not_in_the_list: notFound, note: 'These were not there to remove. Do not claim you took them off.' }
          : {}),
        pantry_size: (await listPantry(tc.userId)).length,
      });
    },
    { alwaysLoad: true },
  );

  /**
   * Recipes they already have, rather than recipes invented from scratch.
   *
   * `suggest_recipes` costs money and takes most of a minute, and half the time
   * it is asked for something already saved — the chilli from last week, one of
   * the hundred in the starter library. Searching first is both the cheaper
   * answer and the better one: these have been cooked before.
   */
  const findRecipes = tool(
    'find_recipes',
    'Search recipes they already have: their own saved and generated ones, and the app\'s built-in library of about a hundred. Try this before suggest_recipes when they name a dish ("do I still have that chilli?", "something with chickpeas") — it is instant and free, and suggest_recipes is neither. Their own recipes come back as cards they can cook in one tap.',
    {
      query: z
        .string()
        .nullable()
        .default(null)
        .describe('What to match against the title — a dish, an ingredient. Null lists the most recent.'),
      where: z
        .enum(['mine', 'library', 'both'])
        .default('both')
        .describe('"mine" = recipes they saved or you generated for them. "library" = the built-in set. "both" unless they clearly meant one.'),
      saved_only: z
        .boolean()
        .default(false)
        .describe('True when they mean the ones they deliberately kept, not everything ever suggested.'),
      limit: z.number().nullable().default(null).describe('Max per source. Null means 8.'),
    },
    async (args) => {
      const limit = Math.min(Math.max(args.limit ?? 8, 1), 20);
      const needle = args.query?.trim().toLowerCase() || null;

      const mine =
        args.where === 'library'
          ? []
          : (await listRecipes(tc.userId, { limit: 100, savedOnly: args.saved_only }))
              // Filtered here rather than in SQL: the list is capped per account
              // and this keeps the query the Cook tab uses untouched.
              .filter((r) => !needle || r.title.toLowerCase().includes(needle))
              .slice(0, limit);

      const library =
        args.where === 'mine'
          ? []
          : await listLibrary(tc.userId, tc.ctx, { q: needle, savedOnly: args.saved_only, limit }, tc.now);

      if (mine.length === 0 && library.length === 0) {
        return ok({
          found: 0,
          note: needle
            ? `Nothing of theirs or in the library matches "${needle}". suggest_recipes can invent one, if that is what they want.`
            : 'They have no recipes yet.',
        });
      }

      // Only their own go on screen: a library recipe has measured macros per
      // portion and no per-ingredient breakdown, so it cannot fill the card
      // without inventing the half that is missing.
      if (mine.length > 0) {
        tc.actions.push({
          kind: 'recipes_suggested',
          entry_id: null,
          summary: mine.map((r) => r.title).join(', '),
          card: { type: 'recipes', recipes: mine },
        });
      }

      return ok({
        theirs: mine.map((r) => ({
          recipe_id: r.id,
          title: r.title,
          kcal_per_portion: Math.round(r.kcal),
          protein_g_per_portion: Math.round(r.protein_g),
          minutes: r.minutes,
          portions: r.portions,
          saved: r.saved,
        })),
        library: library.map((r) => ({
          library_slug: r.slug,
          title: r.title,
          category: r.category,
          kcal_per_portion: Math.round(r.kcal),
          protein_g_per_portion: Math.round(r.protein_g),
          saved: r.saved,
        })),
        how_to_use_these: 'cook_recipe logs one, by recipe_id or library_slug. save_recipe keeps one for later.',
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const cookRecipeTool = tool(
    'cook_recipe',
    'Log a recipe they already have as eaten — one of theirs by recipe_id, or one from the library by library_slug. This is the best entry the app can make: the macros were settled when the recipe was written and nothing gets re-estimated. Use it instead of log_food whenever the food is a recipe they have, and get the id from find_recipes first.',
    {
      recipe_id: z.string().nullable().default(null).describe('One of their own recipes. Null if using a library one.'),
      library_slug: z.string().nullable().default(null).describe('A recipe from the built-in library. Null if using one of theirs.'),
      portions: z
        .number()
        .nullable()
        .default(null)
        .describe('How much of it they ate, in portions. Null means one. Half a portion is 0.5. This is what went on the plate, not how many the pot makes.'),
      meal: mealField.nullable().default(null).describe('Null to infer from the time.'),
      when: whenField,
    },
    async (args) => {
      if (!args.recipe_id === !args.library_slug) {
        return fail('Give exactly one of recipe_id or library_slug. find_recipes returns both kinds.');
      }

      const eatenAt = resolveWhen(args.when ?? undefined, tc.now, tc.ctx);
      const options = {
        portions: args.portions ?? undefined,
        meal: (args.meal as Meal | null) ?? undefined,
        eatenAt,
        ctx: tc.ctx,
      };
      const entry = args.recipe_id
        ? await cookRecipe(tc.userId, args.recipe_id, options)
        : await cookLibraryRecipe(tc.userId, args.library_slug!, options);

      if (!entry) return fail('No recipe with that id. Call find_recipes to list what they actually have.');

      const day = await buildDaySummary(tc.userId, entry.local_date);
      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry, day, tc.units),
      });

      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        logged: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
        protein_remaining: day.targets.protein_g - day.consumed.protein_g,
      });
    },
    { alwaysLoad: true },
  );

  /**
   * Reworking a library recipe so they can actually cook it tonight.
   *
   * The one kitchen job that is neither inventing nor transcribing: the recipe
   * already exists and somebody has already chosen it, and what is wrong with
   * it is this person — the diet it breaks, the ingredient they do not have,
   * the forty minutes they have not got. Costs the same as inventing one from
   * nothing, so it takes the same ceiling.
   */
  const adaptRecipeTool = tool(
    'adapt_recipe',
    'Rework one of the library recipes to fit them — their diet, what is in their kitchen, the time they have, what is left of the day. Use it when they are looking at a library recipe and it does not quite work: "can I make that without the cream?", "is there a vegetarian version?". Needs a library_slug from find_recipes. It is slow and it costs money, and it shares one daily budget with suggest_recipes, so call it once per turn at most.',
    {
      library_slug: z.string().describe('The library recipe to start from. From find_recipes.'),
      wants: z
        .string()
        .nullable()
        .default(null)
        .describe('What has to change, in their words — "without the cream", "half the time". Null to fit it to them generally.'),
      minutes: z.number().nullable().default(null).describe('Minutes they have, if they said.'),
      portions: z.number().nullable().default(null).describe('Servings to cook. Null means one.'),
    },
    async (args) => {
      const { suggestRecipes, RecipeBudgetError } = await import('./recipes.ts');

      let recipes, message;
      try {
        ({ recipes, message } = await suggestRecipes(tc.userId, {
          wants: args.wants,
          minutes: args.minutes,
          portions: args.portions,
          now: tc.now,
          job: { kind: 'adapt', slug: args.library_slug },
        }));
      } catch (error) {
        if (error instanceof RecipeBudgetError) {
          return fail(
            `They have used all ${error.allowed} recipe runs for today, so this cannot be reworked yet. Say so plainly, and tell them the original is still there to cook.`,
          );
        }
        // Thrown by the engine when the slug is not in the library at all.
        if ((error as Error).message.includes('No such recipe')) {
          return fail('No library recipe with that slug. Call find_recipes for the real ones.');
        }
        throw error;
      }

      const [adapted] = recipes;
      if (!adapted) return fail('That did not come back as a recipe. Say so, and leave the original alone.');

      tc.actions.push({
        kind: 'recipes_suggested',
        entry_id: null,
        summary: adapted.title,
        card: { type: 'recipes', recipes },
      });

      return ok({
        adapted: {
          title: adapted.title,
          kcal_per_portion: Math.round(adapted.kcal),
          protein_g_per_portion: Math.round(adapted.protein_g),
          minutes: adapted.minutes,
        },
        your_note_to_them: message,
      });
    },
    { alwaysLoad: true },
  );

  const saveRecipeTool = tool(
    'save_recipe',
    'Keep a recipe, or stop keeping it. Saved recipes are the ones that show under "For you" in Cook and survive being tidied away. Use it when they say they liked one, want it again, or are done with it.',
    {
      recipe_id: z.string().nullable().default(null),
      library_slug: z.string().nullable().default(null),
      saved: z.boolean().default(true).describe('False to un-keep it.'),
    },
    async (args) => {
      if (!args.recipe_id === !args.library_slug) {
        return fail('Give exactly one of recipe_id or library_slug.');
      }
      const done = args.recipe_id
        ? (await setRecipeSaved(tc.userId, args.recipe_id, args.saved)) !== null
        : await setLibrarySaved(tc.userId, args.library_slug!, args.saved);

      if (!done) return fail('No recipe with that id. Call find_recipes first.');
      return ok({ saved: args.saved, where_it_lives: 'Cook, under "For you".' });
    },
    { alwaysLoad: true },
  );

  // ---- The week ahead ------------------------------------------------------

  /**
   * The planner, from the conversation.
   *
   * The whole feature lived behind one tab: the journal could not read a plan
   * it had no part in making, could not say what was on tonight, and could not
   * log it when they cooked it. "What am I making tonight?" is about the most
   * ordinary thing anyone would ask a food app, and it was the one question the
   * chat box could not answer.
   */
  const planWeekTool = tool(
    'plan_week',
    "Plan their dinners for the rest of the week — a recipe a night, built around what is in their kitchen and what their targets are. Slow and expensive, and capped at a couple of plans a week, so call it only when they actually ask to plan the week. \"What should I cook tonight?\" is suggest_recipes, not this.",
    {
      wants: z
        .string()
        .nullable()
        .default(null)
        .describe('Anything they said about the week in their own words — "nothing fiddly on weeknights", "use up the freezer".'),
      minutes: z
        .number()
        .nullable()
        .default(null)
        .describe('The longest a single dinner may take, if they said. It caps every night in the week, not just the weeknights.'),
      servings: z
        .number()
        .nullable()
        .default(null)
        .describe('How many people each dinner feeds. Null means one.'),
      batch: z
        .boolean()
        .nullable()
        .default(null)
        .describe('Whether one cook may cover more than one night. Null leaves it on, which is usually what someone planning a week wants.'),
    },
    async (args) => {
      // Lazy for the same reason as suggest_recipes: `services/mealPlans.ts`
      // reaches back into `ai/plan.ts`, which builds its tools through here.
      const { generateMealPlan } = await import('./plan.ts');
      const { RecipeBudgetError } = await import('./recipes.ts');

      let plan, message;
      try {
        ({ plan, message } = await generateMealPlan(tc.userId, {
          brief: {
            ...(args.wants ? { wants: args.wants } : {}),
            minutes: args.minutes,
            servings: args.servings,
            ...(args.batch === null ? {} : { batch: args.batch }),
          },
          now: tc.now,
        }));
      } catch (error) {
        if (error instanceof RecipeBudgetError) {
          return fail(
            `They have used all ${error.allowed} meal plans for this week, so a new one cannot be made yet. Say so plainly, and offer suggest_recipes for tonight instead.`,
          );
        }
        throw error;
      }

      tc.actions.push({
        kind: 'plan_made',
        entry_id: null,
        summary: `${plan.slots.filter((s) => s.recipe).length} dinners from ${plan.week_start}`,
        card: planCard(plan),
      });

      // Terse, like the other card tools: the week is already on their screen.
      return ok({
        week_start: plan.week_start,
        nights_planned: plan.slots.filter((s) => s.recipe).length,
        where_it_lives: 'The Plan tab — and the shopping list is derived from it.',
        your_note_to_them: message,
      });
    },
    { alwaysLoad: true },
  );

  const getMealPlanTool = tool(
    'get_meal_plan',
    'Read the dinners they have planned, with the id of each night. This is how you answer "what am I making tonight?" and how you get the slot_id before changing or cooking a night. Defaults to this week.',
    {
      week_start: z
        .string()
        .nullable()
        .default(null)
        .describe('YYYY-MM-DD, any date in the week you want. Null for this week.'),
    },
    async (args) => {
      const { getMealPlan, planWeekFor } = await import('../services/mealPlans.ts');
      const weekStart = planWeekFor(args.week_start ?? localDateFor(tc.now, tc.ctx));
      const plan = await getMealPlan(tc.userId, weekStart);

      if (!plan) {
        return ok({
          week_start: weekStart,
          plan: null,
          note: 'Nothing planned for that week. plan_week will make one, but only if they ask for it.',
        });
      }

      tc.actions.push({
        kind: 'plan_shown',
        entry_id: null,
        summary: `Dinners from ${plan.week_start}`,
        card: planCard(plan),
      });

      return ok({
        week_start: plan.week_start,
        today: localDateFor(tc.now, tc.ctx),
        nights: plan.slots.map((slot) => ({
          slot_id: slot.id,
          date: slot.local_date,
          weekday: slot.weekday,
          title: slot.recipe?.title ?? null,
          kcal_per_portion: slot.recipe ? Math.round(slot.recipe.kcal) : null,
          portions: slot.portions,
          also_covers: slot.covers,
          cooked: slot.cooked_at !== null,
        })),
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  const updatePlanNight = tool(
    'update_plan_night',
    'Change one night of the plan — swap in a different recipe of theirs, clear the night because they are out, or change how many portions that cook makes. Never touches the rest of the week. Get slot_id from get_meal_plan.',
    {
      slot_id: z.string().describe('The night to change.'),
      recipe_id: z
        .string()
        .nullable()
        .default(null)
        .describe('One of their own recipes to put on that night — find_recipes gives the id. Null leaves the dish alone.'),
      clear: z
        .boolean()
        .default(false)
        .describe('True to empty the night entirely. Use this for "we are eating out on Thursday".'),
      portions: z
        .number()
        .nullable()
        .default(null)
        .describe('How many the cook makes. Null leaves it. More than one is a batch covering more than one night.'),
    },
    async (args) => {
      const { updateSlot } = await import('../services/mealPlans.ts');

      if (args.clear && args.recipe_id) {
        return fail('Clear the night or give it a recipe — not both.');
      }
      // A slot may only point at a recipe this account owns. The route checks
      // the same thing for the same reason: an id in a request body is
      // otherwise a way to read somebody else's recipe through your own plan.
      if (args.recipe_id && !(await getRecipe(tc.userId, args.recipe_id))) {
        return fail('That is not one of their recipes. Call find_recipes for the ids.');
      }

      const plan = await updateSlot(tc.userId, args.slot_id, {
        ...(args.clear ? { recipeId: null } : args.recipe_id ? { recipeId: args.recipe_id } : {}),
        ...(args.portions === null ? {} : { portions: args.portions }),
      });
      if (!plan) return fail('No night with that id. Call get_meal_plan to list them.');

      tc.actions.push({
        kind: 'plan_shown',
        entry_id: null,
        summary: `Dinners from ${plan.week_start}`,
        card: planCard(plan),
      });

      const slot = plan.slots.find((s) => s.id === args.slot_id);
      return ok({
        week_start: plan.week_start,
        night: slot
          ? { date: slot.local_date, weekday: slot.weekday, title: slot.recipe?.title ?? null, portions: slot.portions }
          : null,
        note: 'The shopping list is derived on every read, so it has already changed with this.',
      });
    },
    { alwaysLoad: true },
  );

  const cookPlannedNight = tool(
    'cook_planned_night',
    'Log a planned dinner as eaten, and mark that night cooked. Use it when they say they made what was planned — "had the traybake". One portion unless they say otherwise: a batch is what the pot makes, not what went on the plate.',
    {
      slot_id: z.string().describe('The night they cooked. From get_meal_plan.'),
      portions: z.number().nullable().default(null).describe('How much they ate. Null means one portion.'),
      when: whenField,
    },
    async (args) => {
      const { cookSlot } = await import('../services/mealPlans.ts');
      const entry = await cookSlot(tc.userId, args.slot_id, tc.ctx, {
        portions: args.portions ?? undefined,
        eatenAt: resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
      });
      if (!entry) {
        return fail('Nothing planned on that night, or no night with that id. Call get_meal_plan.');
      }

      const day = await buildDaySummary(tc.userId, entry.local_date);
      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry, day, tc.units),
      });

      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        logged: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
      });
    },
    { alwaysLoad: true },
  );

  const getShoppingList = tool(
    'get_shopping_list',
    'What they would need to buy for the planned week, with anything already in their kitchen taken off. Derived fresh every time, so it is never stale. Defaults to this week.',
    {
      week_start: z.string().nullable().default(null).describe('YYYY-MM-DD, any date in the week. Null for this week.'),
    },
    async (args) => {
      const { planWeekFor, shoppingListFor } = await import('../services/mealPlans.ts');
      const weekStart = planWeekFor(args.week_start ?? localDateFor(tc.now, tc.ctx));
      const list = await shoppingListFor(tc.userId, weekStart);
      // An empty list is an answer, not a failure. It used to be an error
      // because the list was nothing but a projection of the plan, so no plan
      // meant no such thing — now they can write on it, and "there is nothing
      // on it yet" is something the model should be able to say plainly and
      // then offer to fix.
      if (!list) {
        return ok({
          week_start: weekStart,
          to_buy: [],
          already_have: [],
          note: 'Nothing on the list: no week planned and nothing written on it. update_shopping_list writes a line; plan_week fills the ingredients in, but only if they ask.',
        });
      }

      return ok({
        week_start: list.week_start,
        to_buy: list.items.map((item) => ({
          name: item.name,
          quantity_g: item.quantity_g,
          quantity: item.quantity_descs,
          for_dates: item.for_dates,
          // Only said of the lines it is true of, so an ordinary week's list
          // reads as the list of ingredients it almost entirely is.
          ...(item.extra_id ? { they_wrote_this: true, ticked_off: item.bought } : {}),
        })),
        // Named rather than silently dropped: "you already have this" is a
        // claim about what they told us, not about what is in the fridge.
        already_have: list.have_already,
      });
    },
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );

  /**
   * Writing on the shopping list.
   *
   * The list is two halves and only one of them is writable. The ingredients
   * are derived from the planned week on every read, which is what makes them
   * trustworthy and also what makes them unarguable: a line is there because
   * Tuesday needs it, so the way to remove it is to change Tuesday. Everything
   * else — kitchen roll, nappies, the wine for Saturday — has no recipe behind
   * it and no other way onto the list, and this is that way.
   *
   * Names rather than ids, unlike every other tool that edits something. The
   * user says "got the kitchen roll", not a UUID, and a round trip through
   * get_shopping_list to convert one into the other is a turn spent on
   * bookkeeping — so the lookup happens here, and anything that does not match
   * comes back named so the model can say which line it could not find.
   */
  const updateShoppingList = tool(
    'update_shopping_list',
    'Write things on their shopping list that no recipe would produce — kitchen roll, nappies, the wine for Saturday — and tick off or take back off the ones already written. Use it for "add X to the shopping list", "we need more Y", "got the kitchen roll". It cannot touch the ingredients: those are derived from the planned week, so a line is on the list because a recipe needs it and update_plan_night is what removes it. If they say they bought an ingredient, that is update_pantry — putting it in the kitchen is what takes it off the list.',
    {
      add: z
        .array(
          z.object({
            name: z.string().describe('As they would write it on a list — "Kitchen roll", not "some kitchen roll".'),
            quantity_desc: z
              .string()
              .nullable()
              .default(null)
              .describe('How much, in their words — "2 rolls", "a big one". Null if they did not say.'),
          }),
        )
        .nullable()
        .default(null)
        .describe('Lines to write. Null if they are only ticking things off.'),
      bought: z
        .array(z.string())
        .nullable()
        .default(null)
        .describe('Names of written lines they have now got. Ticked off rather than deleted, so they can still see it in the trolley. Only works on lines they wrote.'),
      still_needed: z
        .array(z.string())
        .nullable()
        .default(null)
        .describe('Names to un-tick, for "actually I did not get the kitchen roll".'),
      remove: z
        .array(z.string())
        .nullable()
        .default(null)
        .describe('Names to take off the list entirely — they changed their mind. Not the same as bought.'),
    },
    async (args) => {
      const { planWeekFor, shoppingListFor } = await import('../services/mealPlans.ts');
      const weekStart = planWeekFor(localDateFor(tc.now, tc.ctx));

      const additions = args.add ?? [];
      const bought = args.bought ?? [];
      const stillNeeded = args.still_needed ?? [];
      const removals = args.remove ?? [];
      if (
        additions.length === 0 &&
        bought.length === 0 &&
        stillNeeded.length === 0 &&
        removals.length === 0
      ) {
        return fail('Nothing to write and nothing to tick off. Say what changed.');
      }

      const before = new Set(
        (await listExtras(tc.userId, weekStart)).map((extra) => extra.name.toLowerCase()),
      );

      let written: string[] = [];
      let refreshed: string[] = [];
      if (additions.length > 0) {
        try {
          await addExtras(
            tc.userId,
            weekStart,
            additions.map((item) => ({ name: item.name, quantity_desc: item.quantity_desc })),
          );
        } catch (error) {
          if (error instanceof ShoppingListFullError) return fail(error.message);
          throw error;
        }
        // Split after the write rather than guessed before it, so the wording
        // matches what actually happened to a name already on the list.
        written = additions.filter((i) => !before.has(i.name.trim().toLowerCase())).map((i) => i.name);
        refreshed = additions.filter((i) => before.has(i.name.trim().toLowerCase())).map((i) => i.name);
      }

      /*
       * Resolved against the list as it stands after the additions, so writing
       * a line and ticking it off in one call works — which is exactly what
       * "grab some kitchen roll, actually I already got it" is.
       */
      const byName = new Map(
        (await listExtras(tc.userId, weekStart)).map((extra) => [extra.name.toLowerCase(), extra]),
      );
      const missed: string[] = [];
      const settle = async (names: string[], apply: (id: string) => Promise<unknown>) => {
        const done: string[] = [];
        for (const name of names) {
          const extra = byName.get(name.trim().toLowerCase());
          if (!extra) {
            missed.push(name);
            continue;
          }
          await apply(extra.id);
          done.push(extra.name);
        }
        return done;
      };

      const tickedOff = await settle(bought, (id) => updateExtra(tc.userId, id, { bought: true }));
      const backOn = await settle(stillNeeded, (id) =>
        updateExtra(tc.userId, id, { bought: false }),
      );
      const removed = await settle(removals, (id) => deleteExtra(tc.userId, id));

      const list = await shoppingListFor(tc.userId, weekStart);
      return ok({
        week_start: weekStart,
        written,
        refreshed,
        ticked_off: tickedOff,
        back_on_the_list: backOn,
        removed,
        ...(missed.length > 0
          ? {
              not_written_by_them: missed,
              note: 'These are not lines they wrote, so nothing happened to them. If one is an ingredient the plan put on the list, say so — it comes off by going in the kitchen (update_pantry) or by changing the night that needs it. Do not claim you ticked it off.',
            }
          : {}),
        still_to_buy: list ? list.items.filter((item) => !item.bought).length : 0,
      });
    },
    { alwaysLoad: true },
  );

  // ---- The rest ------------------------------------------------------------

  /**
   * The same clone the repeat button makes.
   *
   * `search_food_history` plus `log_food` looks like it covers this and does
   * not: the search returns each item's calories and none of its macros, so a
   * re-log is a fresh estimate wearing an old meal's name. This copies the
   * entry, which is what "the same as yesterday" actually means.
   */
  const repeatMeal = tool(
    'repeat_meal',
    'Log a past meal again, exactly as it was priced the first time. Use it for "the same as yesterday", "my usual breakfast", or anything they have logged before — get the entry id from search_food_history or get_day. Better than logging it again from the description, which re-estimates every number.',
    {
      entry_id: z.string().describe('The past entry to copy. The copy is independent of it.'),
      meal: mealField.nullable().default(null).describe('Null to infer from the time.'),
      when: whenField,
    },
    async (args) => {
      const entry = await repeatFoodEntry(tc.userId, args.entry_id, tc.ctx, {
        meal: (args.meal as Meal | null) ?? undefined,
        eatenAt: resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
      });
      if (!entry) return fail('No entry with that id. Call search_food_history to find it.');

      const day = await buildDaySummary(tc.userId, entry.local_date);
      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry, day, tc.units),
      });

      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        logged: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
        protein_remaining: day.targets.protein_g - day.consumed.protein_g,
      });
    },
    { alwaysLoad: true },
  );

  /**
   * Writing the review early, on request.
   *
   * It publishes itself into the journal as its own message, which is why this
   * returns almost nothing: the review is already on their screen by the time
   * the tool result comes back, and repeating it would print it twice.
   */
  const runReviewTool = tool(
    'run_weekly_review',
    'Write this week\'s review now instead of waiting for Monday. Only when they ask for it — "how did my week go?", "can you do my review early?". It is slow and it costs money, and it also runs the adaptive pass, so their calorie target may change. It posts the review into this conversation itself: do not repeat it, and do not summarise it.',
    {},
    async () => {
      const { generateWeeklyReview } = await import('./review.ts');
      const review = await generateWeeklyReview(tc.userId);
      return ok({
        published: true,
        week: `${review.week_start} to ${review.week_end}`,
        note: 'It is already in the conversation as its own message. Say one short line at most — "that is your week" — or nothing at all. Never restate it.',
      });
    },
    { alwaysLoad: true },
  );

  /*
   * ---- Barcodes ------------------------------------------------------------
   *
   * Last of everything on purpose. The scanner's own card handles the common
   * case — a cereal box, one serving — with no model call and no waiting, and
   * this is the fallback for the portions a picker cannot express: "about half
   * this packet", "the rest of the jar", "two of these bars". Built first, it
   * would have put a paid turn in front of every scan of a cereal box.
   *
   * Two tools rather than one, which is not the shape a single "lookup" verb
   * suggests. The split is what keeps the arithmetic on this side of the wire:
   * the read tells the model what is in 100g and the write multiplies it, so
   * "half the packet" arrives as a number this code produced. A model doing
   * that multiplication itself would usually be right, and the times it was
   * not would look exactly like the times it was.
   */

  const lookupBarcodeTool = tool(
    'lookup_barcode',
    'Look up a product by the barcode on its packet. Returns what is in 100g of it, and the serving size if the label names one — never a logged meal, because a barcode says nothing about how much of it was eaten. Use it when the user gives you a barcode number, then work out the amount with them and call log_barcode. If nothing comes back, tell them to photograph the nutrition panel instead: plenty of supermarket own-brands have never been catalogued, and reading the label is something you can do.',
    {
      barcode: z.string().describe('The digits under the stripes, 8, 12 or 13 of them.'),
    },
    async (args) => {
      let product: Awaited<ReturnType<typeof lookupBarcode>>;
      try {
        product = await lookupBarcode(args.barcode);
      } catch (error) {
        if (error instanceof InvalidBarcodeError) return fail(error.message);
        // An outage is said as an outage. Reported as "not found", the model
        // would send someone to photograph a label for a product that is in
        // the catalogue and would be there again in a minute.
        return fail(`${(error as Error).message}. Ask them to try again shortly.`);
      }

      if (!product) {
        return fail(
          'Nobody has catalogued that barcode. Ask them to photograph the nutrition panel and read the figures off it instead — that works for own-brands, which is most of what is missing.',
        );
      }

      return ok({
        barcode: product.barcode,
        brand: product.brand,
        name: product.name,
        per_100g: {
          kcal: product.kcal_100g,
          protein_g: product.protein_100g,
          carbs_g: product.carbs_100g,
          fat_g: product.fat_100g,
        },
        serving_g: product.serving_g,
        serving_desc: product.serving_desc,
        source: product.source === 'off' ? 'Open Food Facts' : 'USDA FoodData Central',
        // Said on every read, because it is the premise the model is most
        // likely to skip past: it now knows the food and still does not know
        // the meal. A packet weight is not on the barcode either, so "half the
        // packet" needs asking about unless they said how big the packet is.
        what_this_is: 'What is in the product, not what they ate. Ask how much if you do not know, then call log_barcode with grams or servings — do not do the multiplication yourself.',
      });
    },
    { annotations: { readOnlyHint: true } },
  );

  const logBarcodeTool = tool(
    'log_barcode',
    'Log a scanned product as eaten, once you know the amount. Give either grams or servings, never both — servings only work if lookup_barcode came back with a serving size. The macros are worked out here from the label, so this is more accurate than describing the product to log_food.',
    {
      barcode: z.string().describe('The same barcode you looked up.'),
      grams: z
        .number()
        .nullable()
        .default(null)
        .describe('How many grams of it they ate. Null if you are giving servings instead.'),
      servings: z
        .number()
        .nullable()
        .default(null)
        .describe(
          "How many of the label's servings they ate. Fractions are expected — 0.5 for half a packet, 0.75 for three quarters of it. Null if you are giving grams.",
        ),
      meal: mealField.nullable().default(null).describe('Null to infer from the time it was eaten.'),
      when: whenField,
    },
    async (args) => {
      // `== null` rather than `=== null`: the schema defaults these to null for
      // a model, but a caller reaching the handler directly simply omits the
      // one it is not using, and "undefined" has to mean the same thing here.
      const grams = args.grams ?? undefined;
      const servings = args.servings ?? undefined;
      if ((grams === undefined) === (servings === undefined)) {
        return fail('Give exactly one of grams or servings.');
      }

      let entry: FoodEntry;
      try {
        const product = await lookupBarcode(args.barcode);
        if (!product) return fail('Nobody has catalogued that barcode — read the label instead.');

        entry = await logScannedProduct(tc.userId, product, {
          grams,
          servings,
          meal: (args.meal as Meal | null) ?? undefined,
          eatenAt: resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
          ctx: tc.ctx,
          units: tc.units,
        });
      } catch (error) {
        if (error instanceof InvalidPortionError || error instanceof InvalidBarcodeError) {
          return fail(error.message);
        }
        return fail((error as Error).message);
      }

      const day = await buildDaySummary(tc.userId, entry.local_date);
      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
        card: foodCard(entry, day, tc.units),
      });

      return ok({
        entry_id: entry.id,
        local_date: entry.local_date,
        logged: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
        protein_remaining: day.targets.protein_g - day.consumed.protein_g,
      });
    },
  );

  const reads = [getDay, searchHistory, getProgress];
  /**
   * Reads the journal gets and the read-only agents do not.
   *
   * `reads` above is the set the weekly review and the nudge are given, and a
   * review has no use for a shopping list — it would only be more prompt for
   * the model to wander into. The barcode lookup is here for the same reason
   * and one more: it is the only read in the file that leaves the building,
   * and a review agent has no business making an outbound request to anybody.
   */
  const kitchenReads = [
    getPantry,
    findRecipes,
    getMealPlanTool,
    getShoppingList,
    lookupBarcodeTool,
  ];
  const shows = [showChart, showDay];
  const writes = [
    logFood,
    updateFood,
    logExercise,
    logWorkout,
    askWorkout,
    defineExercise,
    logWeightTool,
    deleteEntry,
    setProfile,
    // Notes outlive the session, which is the whole reason they exist — so they
    // are writes, and the read-only review agent cannot touch them.
    remember,
    forget,
    // Writes in the sense that matters here: they spend money and they store
    // recipes. The read-only review agent must not be able to reach either.
    suggestRecipesTool,
    importRecipeTool,
    adaptRecipeTool,
    planWeekTool,
    // Logging tools that price nothing themselves — the numbers were settled
    // when the recipe or the original entry was written.
    cookRecipeTool,
    saveRecipeTool,
    cookPlannedNight,
    updatePlanNight,
    repeatMeal,
    logBarcodeTool,
    updatePantry,
    updateShoppingList,
    /*
     * A write for a reason that is easy to miss: it publishes a message into
     * the journal and moves their calorie target. A review agent able to call
     * it would review its own review, on a schedule.
     */
    runReviewTool,
  ];
  // The display tools stay out of the read-only set: the weekly review renders
  // as markdown on its own screen, where a chat card has nowhere to appear.
  const tools = options.readOnly ? reads : [...writes, ...reads, ...kitchenReads, ...shows];

  return {
    server: createSdkMcpServer({ name: SERVER_NAME, version: '1.0.0', tools }),
    /** Fully-qualified names, so every tool is pre-approved and never prompts. */
    toolNames: tools.map((t) => `mcp__${SERVER_NAME}__${t.name}`),
    /** The definitions themselves, so a handler can be called without an agent. */
    tools,
  };
}
