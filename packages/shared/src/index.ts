import { z } from 'zod';

/**
 * The wire contract between the API and any client (web today, React Native later).
 * Nothing in this file may import node-only modules.
 */

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const Meal = z.enum(MEALS);
export type Meal = z.infer<typeof Meal>;

/** How sure the AI was. Drives whether we show "~650" and how we weight adaptive targets. */
export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export const Confidence = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof Confidence>;

export const ENTRY_SOURCES = ['text', 'photo', 'quick', 'manual'] as const;
export const EntrySource = z.enum(ENTRY_SOURCES);
export type EntrySource = z.infer<typeof EntrySource>;

export const SEXES = ['male', 'female'] as const;
export const Sex = z.enum(SEXES);
export type Sex = z.infer<typeof Sex>;

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const ActivityLevel = z.enum(ACTIVITY_LEVELS);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const GOALS = ['lose', 'maintain', 'gain'] as const;
export const Goal = z.enum(GOALS);
export type Goal = z.infer<typeof Goal>;

/** Macros in grams + energy in kcal. Shared by items, entries and daily totals. */
export const Nutrition = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
export type Nutrition = z.infer<typeof Nutrition>;

export const FoodItem = z.object({
  id: z.string().uuid(),
  entry_id: z.string().uuid(),
  name: z.string(),
  /** Resolved quantity. Null when the food isn't sensibly weighed (e.g. "a coffee"). */
  quantity_g: z.number().nullable(),
  /** What the AI actually assumed, in words — "1 medium banana", "2 slices". */
  quantity_desc: z.string().nullable(),
  ...Nutrition.shape,
});
export type FoodItem = z.infer<typeof FoodItem>;

export const FoodEntry = z.object({
  id: z.string().uuid(),
  meal: Meal,
  /** Instant the food was eaten (not when it was logged). */
  eaten_at: z.string(),
  /** The day this entry counts toward, honouring the user's day_start_hour. */
  local_date: z.string(),
  description: z.string(),
  note: z.string().nullable(),
  confidence: Confidence,
  source: EntrySource,
  photo_id: z.string().uuid().nullable(),
  items: z.array(FoodItem),
  ...Nutrition.shape,
});
export type FoodEntry = z.infer<typeof FoodEntry>;

export const ExerciseEntry = z.object({
  id: z.string().uuid(),
  description: z.string(),
  performed_at: z.string(),
  local_date: z.string(),
  duration_min: z.number().nullable(),
  kcal_burned: z.number(),
  confidence: Confidence,
  source: EntrySource,
});
export type ExerciseEntry = z.infer<typeof ExerciseEntry>;

export const WeightEntry = z.object({
  id: z.string().uuid(),
  measured_at: z.string(),
  local_date: z.string(),
  weight_kg: z.number(),
});
export type WeightEntry = z.infer<typeof WeightEntry>;

export const Targets = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  /** True once the user (or adaptive targets) has overridden the calculated values. */
  is_custom: z.boolean(),
});
export type Targets = z.infer<typeof Targets>;

/**
 * §9: food and exercise are reported separately. `net` is derived for callers that
 * want it, but the UI leads with food vs target.
 */
export const DaySummary = z.object({
  local_date: z.string(),
  consumed: Nutrition,
  burned_kcal: z.number(),
  net_kcal: z.number(),
  targets: Targets,
  food_entries: z.array(FoodEntry),
  exercise_entries: z.array(ExerciseEntry),
  weight: WeightEntry.nullable(),
});
export type DaySummary = z.infer<typeof DaySummary>;

export const Profile = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  sex: Sex.nullable(),
  birth_date: z.string().nullable(),
  height_cm: z.number().nullable(),
  target_weight_kg: z.number().nullable(),
  activity_level: ActivityLevel.nullable(),
  goal: Goal.nullable(),
  timezone: z.string(),
  /** §"Day boundaries": 4 means 1am counts toward the previous day. */
  day_start_hour: z.number().int().min(0).max(12),
  is_setup_complete: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileUpdate = Profile.omit({
  id: true,
  email: true,
  is_setup_complete: true,
}).partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

// ---- Accounts --------------------------------------------------------------

export const Credentials = z.object({
  email: z.string().email().max(254),
  // Long enough to matter, short enough that scrypt stays fast.
  password: z.string().min(8).max(200),
});
export type Credentials = z.infer<typeof Credentials>;

export const SignupRequest = Credentials.extend({
  display_name: z.string().max(80).nullable().optional(),
  /** Sent by the browser so the very first day boundary is already correct. */
  timezone: z.string().max(60).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const AuthStatus = z.object({
  authenticated: z.boolean(),
  profile: Profile.nullable(),
  /** False once the deployment has been locked down to its existing accounts. */
  signup_allowed: z.boolean(),
  /** False on a brand-new server, so the form can open on "create account". */
  has_accounts: z.boolean(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

/**
 * What onboarding still needs before targets mean anything. The journal uses
 * this to decide whether to open in setup mode.
 */
export const OnboardingState = z.object({
  complete: z.boolean(),
  missing: z.array(z.string()),
});
export type OnboardingState = z.infer<typeof OnboardingState>;

export const ChatRole = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessage = z.object({
  id: z.string().uuid(),
  role: ChatRole,
  content: z.string(),
  photo_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

/** What the model actually did this turn, so the UI can render cards instead of prose. */
export const ChatAction = z.object({
  kind: z.enum(['food_logged', 'food_updated', 'food_deleted', 'exercise_logged', 'weight_logged']),
  entry_id: z.string().uuid().nullable(),
  summary: z.string(),
});
export type ChatAction = z.infer<typeof ChatAction>;

export const ChatResponse = z.object({
  message: ChatMessage,
  actions: z.array(ChatAction),
  /** Always echoed back so the dashboard updates without a second round trip. */
  day: DaySummary,
});
export type ChatResponse = z.infer<typeof ChatResponse>;

export const ChatRequest = z.object({
  text: z.string().min(1).max(4000),
  /** Data URL or base64 payload of a meal photo. */
  photo_base64: z.string().optional(),
  photo_media_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const TrendPoint = z.object({
  local_date: z.string(),
  value: z.number().nullable(),
  /** 7-day rolling mean; the number §12 says to lead with. */
  average: z.number().nullable(),
});
export type TrendPoint = z.infer<typeof TrendPoint>;

export const Progress = z.object({
  weight: z.object({
    current_kg: z.number().nullable(),
    average_7d_kg: z.number().nullable(),
    change_7d_kg: z.number().nullable(),
    change_since_start_kg: z.number().nullable(),
    to_target_kg: z.number().nullable(),
    series: z.array(TrendPoint),
  }),
  calories: z.object({
    average_kcal: z.number().nullable(),
    target_kcal: z.number(),
    series: z.array(TrendPoint),
  }),
  protein: z.object({
    average_g: z.number().nullable(),
    target_g: z.number(),
    days_target_hit: z.number(),
    days_logged: z.number(),
  }),
  exercise: z.object({ sessions: z.number(), total_kcal: z.number() }),
});
export type Progress = z.infer<typeof Progress>;

/** Rounds an estimate the way §5 asks for: useful, not falsely precise. */
export function roundEstimate(kcal: number): number {
  return kcal >= 100 ? Math.round(kcal / 10) * 10 : Math.round(kcal);
}

export function formatKcal(kcal: number, confidence: Confidence = 'medium'): string {
  const n = Math.round(kcal).toLocaleString('en-US');
  return confidence === 'high' ? `${n} kcal` : `~${n} kcal`;
}
