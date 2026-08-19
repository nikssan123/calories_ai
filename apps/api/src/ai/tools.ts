import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ChatAction, Confidence, EntrySource, Meal } from '@ct/shared';
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
import { calculateTargets, setTargets, targetsForDate } from '../services/targets.ts';
import { latestWeight } from '../services/log.ts';

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
  /** Set when the turn included a photo, so logged entries link back to it. */
  photoId: string | null;
  /** Collected during the turn and returned to the client for rendering. */
  actions: ChatAction[];
}

const itemShape = {
  name: z.string().describe('The food, as the user would say it. "Chicken breast", not "Poultry, broilers".'),
  quantity_g: z
    .number()
    .nullable()
    .default(null)
    .describe('Estimated weight in grams. Null for things not sensibly weighed, like a black coffee.'),
  quantity_desc: z
    .string()
    .nullable()
    .default(null)
    .describe('The assumption in plain words — "1 medium banana", "2 slices", "a large handful".'),
  kcal: z.number().describe('Estimated calories for this item at this quantity.'),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
};

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

export function buildNutritionServer(tc: ToolContext) {
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

      tc.actions.push({
        kind: 'food_logged',
        entry_id: entry.id,
        summary: `${entry.meal}: ${entry.description} — ${Math.round(entry.kcal)} kcal`,
      });

      const day = await buildDaySummary(tc.userId, entry.local_date);
      return ok({
        entry_id: entry.id,
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
      const entry = await updateFoodEntry(tc.userId, args.entry_id, {
        meal: (args.meal as Meal | null) ?? undefined,
        description: args.description ?? undefined,
        confidence: (args.confidence as Confidence | null) ?? undefined,
        eatenAt: args.when ? resolveWhen(args.when, tc.now, tc.ctx) : undefined,
        items: args.items ? toItems(args.items) : undefined,
        ctx: tc.ctx,
      });

      if (!entry) return fail('No entry with that id. Call get_day to list the ids for a date.');

      tc.actions.push({
        kind: 'food_updated',
        entry_id: entry.id,
        summary: `Updated ${entry.description} — now ${Math.round(entry.kcal)} kcal`,
      });

      const day = await buildDaySummary(tc.userId, entry.local_date);
      return ok({
        entry_id: entry.id,
        updated: pickTotals(entry),
        day_totals: day.consumed,
        kcal_remaining: day.targets.kcal - day.consumed.kcal,
      });
    },
    { alwaysLoad: true },
  );

  const logExercise = tool(
    'log_exercise',
    'Record an activity and its estimated burn. Exercise burn is inherently uncertain — prefer conservative estimates and set confidence to "low" unless the user gave real data from a device.',
    {
      description: z.string().describe('e.g. "5km run", "45 min weight training".'),
      duration_min: z.number().nullable().default(null),
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
        kcalBurned: args.kcal_burned,
        confidence: args.confidence as Confidence,
        source: 'text',
        ctx: tc.ctx,
      });

      tc.actions.push({
        kind: 'exercise_logged',
        entry_id: entry.id,
        summary: `${entry.description} — ~${Math.round(entry.kcal_burned)} kcal`,
      });
      return ok({ entry_id: entry.id, kcal_burned: entry.kcal_burned });
    },
    { alwaysLoad: true },
  );

  const logWeightTool = tool(
    'log_weight',
    'Record a bodyweight measurement. One per day — logging again for the same day replaces the earlier value.',
    {
      weight_kg: z.number(),
      when: whenField,
    },
    async (args) => {
      const entry = await logWeight(
        tc.userId,
        args.weight_kg,
        resolveWhen(args.when ?? undefined, tc.now, tc.ctx),
        tc.ctx,
      );
      tc.actions.push({
        kind: 'weight_logged',
        entry_id: entry.id,
        summary: `Weight ${entry.weight_kg} kg on ${entry.local_date}`,
      });
      return ok(entry);
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
      });
      return ok({ deleted: true });
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
    'Save what you have learned about the user during setup: sex, date of birth, height, activity level, goal, target weight. Call it as soon as you learn a value — do not wait until you have them all. Targets are recalculated automatically each time. To record their current weight use log_weight instead; that is a measurement, not a profile field.',
    {
      sex: z.enum(['male', 'female']).nullable().default(null),
      birth_date: z.string().nullable().default(null).describe('YYYY-MM-DD. If they give only an age, convert it to an approximate birth date.'),
      height_cm: z.number().nullable().default(null).describe('Height in centimetres. Convert from feet/inches if needed.'),
      target_weight_kg: z.number().nullable().default(null).describe('Goal weight in kilograms.'),
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

  const tools = [
    logFood,
    updateFood,
    logExercise,
    logWeightTool,
    deleteEntry,
    setProfile,
    getDay,
    searchHistory,
    getProgress,
  ];

  return {
    server: createSdkMcpServer({ name: SERVER_NAME, version: '1.0.0', tools }),
    /** Fully-qualified names, so every tool is pre-approved and never prompts. */
    toolNames: tools.map((t) => `mcp__${SERVER_NAME}__${t.name}`),
  };
}
