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
  distance_km: z.number().nullable(),
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

/** Which pass produced a target row: the profile formula, the weekly adaptive
 * pass, or the user typing a number. */
export const TARGET_SOURCES = ['calculated', 'adaptive', 'manual'] as const;
export const TargetSource = z.enum(TARGET_SOURCES);
export type TargetSource = z.infer<typeof TargetSource>;

export const Targets = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  /** True once the user has overridden the calculated values. */
  is_custom: z.boolean(),
  source: TargetSource.default('calculated'),
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

/**
 * Sent as `x-session-transport: bearer` by a client that holds its own session
 * token rather than relying on the cookie — which in practice means the native
 * app, since a phone has no cookie jar worth trusting a 60-day session to.
 *
 * It is opt-in rather than the default because the browser must never receive
 * the raw token. The session cookie is httpOnly precisely so that script on the
 * page cannot read it, and returning the same value in a JSON body would hand
 * an XSS the session it was written to protect.
 */
export const SESSION_TRANSPORT_HEADER = 'x-session-transport';

export const AuthStatus = z.object({
  authenticated: z.boolean(),
  profile: Profile.nullable(),
  /** False once the deployment has been locked down to its existing accounts. */
  signup_allowed: z.boolean(),
  /** False on a brand-new server, so the form can open on "create account". */
  has_accounts: z.boolean(),
  /** Whether this account may open /admin. Decided by ADMIN_EMAILS on the API. */
  is_admin: z.boolean(),
  /**
   * The raw session token, returned by signup and login only to a client that
   * asked for it with SESSION_TRANSPORT_HEADER. Absent everywhere else — the
   * browser's copy stays in the httpOnly cookie and is never readable here.
   */
  token: z.string().optional(),
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

/** Declared here rather than with Progress: the chat cards below build on it. */
export const TrendPoint = z.object({
  local_date: z.string(),
  value: z.number().nullable(),
  /** 7-day rolling mean; the number §12 says to lead with. */
  average: z.number().nullable(),
});
export type TrendPoint = z.infer<typeof TrendPoint>;

export const ChatRole = z.enum(['user', 'assistant']);
export type ChatRole = z.infer<typeof ChatRole>;

/**
 * The visual half of a turn.
 *
 * Every number a card displays is put there by the server from the database —
 * the model chooses *what* to show and never *what it says*. A model that could
 * fill in the points of its own chart could draw a weight loss that did not
 * happen, and a chart is believed far more readily than a sentence.
 */
export const ChatCard = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('food'),
    entry_id: z.string().uuid(),
    meal: Meal,
    description: z.string(),
    confidence: Confidence,
    items: z.array(z.object({ name: z.string(), quantity: z.string().nullable() })),
    ...Nutrition.shape,
  }),
  z.object({
    type: z.literal('exercise'),
    entry_id: z.string().uuid(),
    description: z.string(),
    confidence: Confidence,
    kcal_burned: z.number(),
    duration_min: z.number().nullable(),
    distance_km: z.number().nullable(),
  }),
  z.object({
    type: z.literal('weight'),
    weight_kg: z.number(),
    change_7d_kg: z.number().nullable(),
    series: z.array(TrendPoint),
  }),
  /** Requested by the model via `show_chart`; the series is read from Postgres. */
  z.object({
    type: z.literal('trend'),
    metric: z.enum(['calories', 'protein', 'weight', 'exercise']),
    title: z.string(),
    caption: z.string().nullable(),
    unit: z.string(),
    /** Reference line — the target for the metric, where it has one. */
    target: z.number().nullable(),
    average: z.number().nullable(),
    series: z.array(TrendPoint),
  }),
  /** Requested by the model via `show_day`. A day at a glance, mid-conversation. */
  z.object({
    type: z.literal('day'),
    local_date: z.string(),
    caption: z.string().nullable(),
    consumed: Nutrition,
    targets: Targets,
    burned_kcal: z.number(),
  }),
]);
export type ChatCard = z.infer<typeof ChatCard>;

/** What the model actually did this turn, so the UI can render cards instead of prose. */
export const ChatAction = z.object({
  kind: z.enum([
    'food_logged',
    'food_updated',
    'food_deleted',
    'exercise_logged',
    'weight_logged',
    'card_shown',
  ]),
  entry_id: z.string().uuid().nullable(),
  summary: z.string(),
  /** Absent for actions with nothing to draw — a deletion is a line of text. */
  card: ChatCard.nullable().default(null),
});
export type ChatAction = z.infer<typeof ChatAction>;

export const ChatMessage = z.object({
  id: z.string().uuid(),
  role: ChatRole,
  content: z.string(),
  photo_id: z.string().uuid().nullable(),
  /**
   * A signed, time-limited path to the photo — join it to the client's own API
   * base and it can go straight into an `<img>` or `<Image>`.
   *
   * Minted per response rather than stored, because an image element fetches on
   * its own and cannot be given an Authorization header. Without this the photo
   * route is reachable from the browser (which attaches its cookie unbidden)
   * and from nowhere else.
   */
  photo_url: z.string().nullable().default(null),
  created_at: z.string(),
  /**
   * Stored with the message rather than returned only live, so reopening the app
   * does not silently downgrade a conversation full of cards into plain text.
   */
  actions: z.array(ChatAction).default([]),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatResponse = z.object({
  message: ChatMessage,
  /** The same array as `message.actions`, kept for callers holding the response. */
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
    series: z.array(TrendPoint),
  }),
  exercise: z.object({
    sessions: z.number(),
    total_kcal: z.number(),
    /** Per-day burn. A rest day is 0 here, not null — it is data, not a gap. */
    series: z.array(TrendPoint),
  }),
});
export type Progress = z.infer<typeof Progress>;

// ---- Calendar --------------------------------------------------------------

/**
 * One cell of the History grid. `target_kcal` travels per day because targets
 * are effective-from rows — colouring a March day against today's target would
 * misreport every day before the last adaptive change.
 */
export const CalendarDay = z.object({
  local_date: z.string(),
  kcal: z.number(),
  protein_g: z.number(),
  target_kcal: z.number(),
  burned_kcal: z.number(),
  weight_kg: z.number().nullable(),
  /** Distinguishes a day at zero from a day nobody logged. */
  logged: z.boolean(),
});
export type CalendarDay = z.infer<typeof CalendarDay>;

export const Calendar = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(CalendarDay),
});
export type Calendar = z.infer<typeof Calendar>;

// ---- Exercise --------------------------------------------------------------

export const ExerciseSummary = z.object({
  days: z.number(),
  sessions: z.number(),
  total_kcal: z.number(),
  /** Null rather than 0 when nothing in the window covered ground. */
  total_distance_km: z.number().nullable(),
  total_duration_min: z.number().nullable(),
  active_days: z.number(),
  /** Per-day burn, so the chart can show the shape of a training week. */
  series: z.array(TrendPoint),
  entries: z.array(ExerciseEntry),
});
export type ExerciseSummary = z.infer<typeof ExerciseSummary>;

/** Rounds an estimate the way §5 asks for: useful, not falsely precise. */
export function roundEstimate(kcal: number): number {
  return kcal >= 100 ? Math.round(kcal / 10) * 10 : Math.round(kcal);
}

export function formatKcal(kcal: number, confidence: Confidence = 'medium'): string {
  const n = Math.round(kcal).toLocaleString('en-US');
  return confidence === 'high' ? `${n} kcal` : `~${n} kcal`;
}

// ---- Adaptive targets ------------------------------------------------------

/**
 * What the last N days of logging plus the weight trend say the user's real
 * maintenance is. Mifflin-St Jeor predicts a population; this measures a person.
 *
 * It calibrates against *logged* intake, not true intake, so a consistent
 * under-logger converges on a target that works for the way they log. That is a
 * feature: the number that matters is the one that produces the intended weight
 * trend.
 */
export const TdeeEstimate = z.object({
  /** kcal/day the data implies, before the goal delta is applied. */
  observed_tdee_kcal: z.number(),
  /** What the profile formula predicts, for comparison. */
  predicted_tdee_kcal: z.number(),
  /** Confidence-weighted mean of logged intake over the window. */
  mean_intake_kcal: z.number(),
  /** Regression slope of bodyweight over the window. Negative is loss. */
  weight_change_kg_per_week: z.number(),
  window_days: z.number(),
  days_logged: z.number(),
  weigh_ins: z.number(),
  /** 0-1. Drives how far the target is allowed to move this week. */
  quality: z.number(),
});
export type TdeeEstimate = z.infer<typeof TdeeEstimate>;

export const ADAPTIVE_BLOCKERS = [
  'not_enough_logged_days',
  'not_enough_weigh_ins',
  'weigh_in_span_too_short',
  'custom_targets',
  'estimate_out_of_range',
  'change_too_small',
] as const;
export const AdaptiveBlocker = z.enum(ADAPTIVE_BLOCKERS);
export type AdaptiveBlocker = z.infer<typeof AdaptiveBlocker>;

/** The result of the adaptive pass, whether or not it can act. */
export const AdaptiveProposal = z.object({
  eligible: z.boolean(),
  /** Populated when `eligible` is false. */
  blocked_by: AdaptiveBlocker.nullable(),
  /** Null when there was not enough data to estimate at all. */
  estimate: TdeeEstimate.nullable(),
  current: Targets,
  /** The targets that would be written. Equal to `current` when not eligible. */
  proposed: Targets,
  /** Signed kcal difference, proposed minus current. */
  delta_kcal: z.number(),
  /** One sentence, suitable for the `reason` column and for the UI. */
  explanation: z.string(),
});
export type AdaptiveProposal = z.infer<typeof AdaptiveProposal>;

// ---- Weekly review ---------------------------------------------------------

/** The deterministic half of a review: computed in SQL, never by the model. */
export const ReviewStats = z.object({
  week_start: z.string(),
  week_end: z.string(),
  days_logged: z.number(),
  mean_kcal: z.number().nullable(),
  mean_protein_g: z.number().nullable(),
  target_kcal: z.number(),
  target_protein_g: z.number(),
  /** Days within ±10% of the calorie target. */
  days_on_target: z.number(),
  days_protein_hit: z.number(),
  /** Same fields for the week before, so the review can say "up from". */
  previous_mean_kcal: z.number().nullable(),
  previous_days_logged: z.number(),
  weight_start_kg: z.number().nullable(),
  weight_end_kg: z.number().nullable(),
  weight_change_kg: z.number().nullable(),
  exercise_sessions: z.number(),
  exercise_kcal: z.number(),
  /** Most-logged foods this week, by number of entries they appear in. */
  top_foods: z.array(z.object({ name: z.string(), times: z.number(), kcal: z.number() })),
  /** Highest and lowest calorie days, for "the weekend is where it goes". */
  highest_day: z.object({ local_date: z.string(), kcal: z.number() }).nullable(),
  lowest_day: z.object({ local_date: z.string(), kcal: z.number() }).nullable(),
  adaptive: AdaptiveProposal.nullable(),
});
export type ReviewStats = z.infer<typeof ReviewStats>;

export const WeeklyReview = z.object({
  id: z.string().uuid(),
  week_start: z.string(),
  week_end: z.string(),
  content: z.string(),
  stats: ReviewStats,
  message_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type WeeklyReview = z.infer<typeof WeeklyReview>;

// ---- Repeat a meal ---------------------------------------------------------

/**
 * A meal the user has eaten before, collapsed across repeats. `times` is what
 * makes the list useful: the point is to surface the eight things someone
 * actually eats, not their last eight entries.
 */
export const MealTemplate = z.object({
  /** The most recent entry with this description — the one that gets cloned. */
  entry_id: z.string().uuid(),
  description: z.string(),
  meal: Meal,
  times: z.number(),
  last_eaten: z.string(),
  ...Nutrition.shape,
  items: z.array(z.object({
    name: z.string(),
    quantity_g: z.number().nullable(),
    quantity_desc: z.string().nullable(),
    kcal: z.number(),
  })),
});
export type MealTemplate = z.infer<typeof MealTemplate>;

export const RepeatRequest = z.object({
  /** Defaults to the meal slot inferred from the time it is being logged. */
  meal: Meal.optional(),
  /** ISO timestamp. Defaults to now. */
  eaten_at: z.string().optional(),
});
export type RepeatRequest = z.infer<typeof RepeatRequest>;

// ---- Admin -----------------------------------------------------------------

/**
 * The admin panel's contract. It lives here for the same reason everything else
 * does — the panel is a client of the API like any other, and putting its types
 * anywhere else would let the two drift.
 */

export const AdminOverview = z.object({
  users: z.object({
    total: z.number(),
    onboarded: z.number(),
    disabled: z.number(),
    active_7d: z.number(),
  }),
  data: z.object({
    food_entries: z.number(),
    exercise_entries: z.number(),
    weight_entries: z.number(),
    chat_messages: z.number(),
    photos: z.number(),
    reviews: z.number(),
  }),
  storage: z.object({
    database_bytes: z.number(),
    uploads_bytes: z.number(),
    photo_count: z.number(),
  }),
  config: z.object({
    provider: z.string(),
    auth: z.string(),
    signup_allowed: z.boolean(),
    secure_cookies: z.boolean(),
    admin_source: z.enum(['env', 'first-account']),
    openai_rate: z.object({ input: z.number(), output: z.number() }).nullable(),
  }),
});
export type AdminOverview = z.infer<typeof AdminOverview>;

export const AdminUser = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  timezone: z.string(),
  is_setup_complete: z.boolean(),
  /** ISO timestamp when the account was suspended, or null. */
  disabled_at: z.string().nullable(),
  created_at: z.string(),
  last_seen_at: z.string().nullable(),
  food_entries: z.number(),
  chat_messages: z.number(),
  last_entry_at: z.string().nullable(),
  ai_turns: z.number(),
  ai_cost_usd: z.number(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const TableSummary = z.object({
  name: z.string(),
  rows: z.number(),
  bytes: z.number(),
});
export type TableSummary = z.infer<typeof TableSummary>;

export const TablePage = z.object({
  table: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  /** Columns deliberately withheld — password hashes, session tokens. */
  redacted: z.array(z.string()),
});
export type TablePage = z.infer<typeof TablePage>;

/** How much to trust a cost figure. See `ai_usage.cost_source`. */
export const COST_SOURCES = ['reported', 'estimated', 'unknown'] as const;
export const CostSource = z.enum(COST_SOURCES);
export type CostSource = z.infer<typeof CostSource>;

export const CostTotals = z.object({
  turns: z.number(),
  failed_turns: z.number(),
  cost_usd: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_write_tokens: z.number(),
  avg_cost_usd: z.number(),
  p95_duration_ms: z.number().nullable(),
  active_users: z.number(),
});
export type CostTotals = z.infer<typeof CostTotals>;

export const CostByKind = CostTotals.extend({
  kind: z.string(),
  model: z.string(),
});
export type CostByKind = z.infer<typeof CostByKind>;

export const CostDay = z.object({
  date: z.string(),
  turns: z.number(),
  cost_usd: z.number(),
  active_users: z.number(),
});
export type CostDay = z.infer<typeof CostDay>;

export const CostByUser = z.object({
  user_id: z.string().nullable(),
  email: z.string().nullable(),
  turns: z.number(),
  cost_usd: z.number(),
  last_turn_at: z.string().nullable(),
});
export type CostByUser = z.infer<typeof CostByUser>;

/**
 * The viability numbers. `cost_per_user_month_usd` is the headline; the
 * projection is that figure multiplied out, which is only as good as the
 * window it was measured over — hence `window_days` travelling with it.
 */
export const Economics = z.object({
  window_days: z.number(),
  active_users: z.number(),
  cost_usd: z.number(),
  turns: z.number(),
  cost_per_turn_usd: z.number(),
  cost_per_user_month_usd: z.number(),
  heaviest_user_month_usd: z.number(),
  turns_per_user_day: z.number(),
  projection: z.array(z.object({ users: z.number(), monthly_usd: z.number() })),
  /** 0–1. Anything above zero means the headline is an undercount. */
  unpriced_share: z.number(),
});
export type Economics = z.infer<typeof Economics>;

export const UsageTurn = z.object({
  id: z.string().uuid(),
  user_id: z.string().nullable(),
  email: z.string().nullable(),
  occurred_at: z.string(),
  provider: z.string(),
  kind: z.string(),
  model: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_tokens: z.number(),
  cache_write_tokens: z.number(),
  cost_usd: z.number(),
  cost_source: CostSource,
  duration_ms: z.number().nullable(),
  num_turns: z.number(),
  ok: z.boolean(),
  error: z.string().nullable(),
});
export type UsageTurn = z.infer<typeof UsageTurn>;

export const CostReport = z.object({
  days: z.number(),
  totals: CostTotals,
  by_kind: z.array(CostByKind),
  by_day: z.array(CostDay),
  by_user: z.array(CostByUser),
  economics: Economics,
});
export type CostReport = z.infer<typeof CostReport>;
