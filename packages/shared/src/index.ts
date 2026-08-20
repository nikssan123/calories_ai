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

/**
 * What an account is entitled to.
 *
 * There is no billing behind this yet, and that is the point: the routes that
 * cost money read their ceilings from the plan from the first commit, so
 * gating a feature later is setting a number rather than auditing every route.
 * `free` is deliberately generous — the daily journal is the habit the product
 * lives on and must never be the thing someone hits a wall in.
 */
/**
 * A dietary pattern. Four, because these are the ones that change what an
 * ingredient list may contain and that a recipe writer can actually honour.
 * Anything narrower — an allergy, a dislike, half a religious observance —
 * belongs in `avoids`, where it can be said in the user's own words.
 */
export const DIETS = ['none', 'vegetarian', 'vegan', 'pescatarian'] as const;
export const Diet = z.enum(DIETS);
export type Diet = z.infer<typeof Diet>;

export const PLANS = ['free', 'pro'] as const;
export const PlanName = z.enum(PLANS);
export type PlanName = z.infer<typeof PlanName>;

/** Macros in grams + energy in kcal. Shared by items, entries and daily totals. */
export const Nutrition = z.object({
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});
export type Nutrition = z.infer<typeof Nutrition>;

/**
 * The four figures that say something about the quality of food rather than its
 * quantity. Estimated per item, exactly where the macros are.
 *
 * Every one of them is nullable, and null is a real answer rather than a gap to
 * be filled with a zero: it means nobody ever estimated this, which is true of
 * every item logged before these fields existed and of anything the model
 * genuinely cannot judge. A zero is a claim — "this has no fiber" — and a plate
 * of pasta reported as zero-fiber is a worse day total than one reported as
 * partly unknown.
 *
 * Deliberately not folded into `Nutrition`. That shape is also a day's totals
 * and the shape `Targets` is built around, so widening it would force four more
 * fields into every literal that adds up a day, for nothing: a target has no
 * business carrying a nullable sodium figure.
 */
export const DietQuality = z.object({
  fiber_g: z.number().nullable(),
  sodium_mg: z.number().nullable(),
  sat_fat_g: z.number().nullable(),
  sugar_g: z.number().nullable(),
});
export type DietQuality = z.infer<typeof DietQuality>;

export const FoodItem = z.object({
  id: z.string().uuid(),
  entry_id: z.string().uuid(),
  name: z.string(),
  /** Resolved quantity. Null when the food isn't sensibly weighed (e.g. "a coffee"). */
  quantity_g: z.number().nullable(),
  /** What the AI actually assumed, in words — "1 medium banana", "2 slices". */
  quantity_desc: z.string().nullable(),
  ...Nutrition.shape,
  ...DietQuality.shape,
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
  /** Summed over the items that carry them; null when none of them did. */
  ...DietQuality.shape,
});
export type FoodEntry = z.infer<typeof FoodEntry>;

/**
 * What kind of session it was. Five, because these are the distinctions that
 * change what the app should ask you next: a strength session wants sets and a
 * load, a run wants a distance, and a yoga class wants neither.
 */
export const EXERCISE_CATEGORIES = ['strength', 'cardio', 'class', 'sport', 'flexibility'] as const;
export const ExerciseCategory = z.enum(EXERCISE_CATEGORIES);
export type ExerciseCategory = z.infer<typeof ExerciseCategory>;

/** What one set of an exercise is measured in — and so which fields to draw. */
export const EXERCISE_TRACKS = ['reps', 'duration', 'distance'] as const;
export const ExerciseTracks = z.enum(EXERCISE_TRACKS);
export type ExerciseTracks = z.infer<typeof ExerciseTracks>;

/**
 * An exercise the app knows about. Built in, or invented for one account the
 * moment they mentioned something the catalogue had never heard of — nobody
 * should have to pick "Other" because their gym does an exercise this app has
 * not been told about.
 */
export const ExerciseType = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: ExerciseCategory,
  emoji: z.string(),
  tracks: ExerciseTracks,
  /** True when this account invented it rather than it shipping with the app. */
  custom: z.boolean(),
});
export type ExerciseType = z.infer<typeof ExerciseType>;

/**
 * One set. "3×8 at 80kg" is three of these, not one saying three — the last set
 * is where the reps drop, and a count throws away the only record of that.
 */
export const ExerciseSet = z.object({
  name: z.string(),
  position: z.number().int(),
  set_number: z.number().int(),
  reps: z.number().int().nullable(),
  weight_kg: z.number().nullable(),
  duration_sec: z.number().int().nullable(),
  distance_m: z.number().int().nullable(),
});
export type ExerciseSet = z.infer<typeof ExerciseSet>;

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
  category: ExerciseCategory.nullable(),
  /**
   * Whether the numbers were read off a sentence or filled in by a person.
   * `counted` means the burn is arithmetic over the sets below rather than a
   * guess about them, which is worth saying out loud on the card.
   */
  detail: z.enum(['estimated', 'counted']),
  sets: z.array(ExerciseSet).default([]),
});
export type ExerciseEntry = z.infer<typeof ExerciseEntry>;

/** One exercise within a session, as the card submits it. */
export const WorkoutExercise = z.object({
  name: z.string().min(1).max(80),
  type_id: z.string().uuid().nullable().optional(),
  sets: z
    .array(
      z.object({
        reps: z.number().int().min(1).max(1000).nullable().optional(),
        weight_kg: z.number().min(0).max(500).nullable().optional(),
        duration_sec: z.number().int().min(1).max(86400).nullable().optional(),
        distance_m: z.number().int().min(1).max(500000).nullable().optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type WorkoutExercise = z.infer<typeof WorkoutExercise>;

/**
 * A finished session, submitted in one go.
 *
 * Deliberately one request rather than a conversation. Asking "which exercise?
 * how many sets? how heavy?" as three chat turns would be three model calls and
 * the better part of a minute to log something the user already knows; the card
 * collects it all and posts once, and the model is not involved at all.
 */
export const WorkoutRequest = z.object({
  category: ExerciseCategory,
  exercises: z.array(WorkoutExercise).min(1).max(20),
  /** Total session time, if they know it. Otherwise estimated from the sets. */
  duration_min: z.number().min(1).max(600).nullable().optional(),
  /** ISO instant. Defaults to now; the card carries the one the agent meant. */
  performed_at: z.string().optional(),
  /**
   * The chat message whose question this answers. Given it, the server rewrites
   * that message's card into a receipt — otherwise reopening the app shows a
   * question that was answered days ago.
   */
  message_id: z.string().uuid().optional(),
});
export type WorkoutRequest = z.infer<typeof WorkoutRequest>;

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
 * Which way a quality target points.
 *
 * Stated rather than left implicit, because the four are not all the same kind
 * of number and a screen that treats them alike is actively misleading: more
 * fiber is better and more sodium is not. Nothing should ever throw confetti
 * for reaching a sodium target the way `MacroBars` does for protein.
 */
export const QUALITY_DIRECTIONS = ['floor', 'ceiling'] as const;
export const QualityDirection = z.enum(QUALITY_DIRECTIONS);
export type QualityDirection = z.infer<typeof QualityDirection>;

export const QualityTarget = z.object({
  value: z.number(),
  direction: QualityDirection,
});
export type QualityTarget = z.infer<typeof QualityTarget>;

/**
 * Derived from the calorie target rather than stored against the user. There is
 * nothing personal in them to version — they are the same function of the same
 * number for everybody — so a `targets` row would only be a copy that could go
 * stale the day the arithmetic changed.
 */
export const QualityTargets = z.object({
  fiber_g: QualityTarget,
  sodium_mg: QualityTarget,
  sat_fat_g: QualityTarget,
  sugar_g: QualityTarget,
});
export type QualityTargets = z.infer<typeof QualityTargets>;

/**
 * A day's diet quality, and how much of the day it actually speaks for.
 *
 * `coverage` is the share of the day's calories that came from items carrying
 * the figures. It travels with the sums rather than being worked out by each
 * screen, because a total without it is a lie by omission: 12g of fiber across
 * a day where only breakfast was ever estimated is not a 12g day, and no amount
 * of care in the UI can recover that once the number has been handed over bare.
 *
 * Below roughly 0.6 the honest thing to print is "partly measured", not a
 * total — the same posture as weighting an adaptive target by how much data
 * stands behind it.
 */
/**
 * Below this, a day's quality figures are a fragment rather than a total, and
 * every surface says "partly measured" instead of printing a number.
 *
 * 0.6 is a judgement, not a derivation: roughly "two of the three meals are
 * accounted for", which is where a fiber total starts being worth reading. Here
 * rather than in the API so the web, the agent and the nudge triggers cannot
 * each quietly pick their own threshold.
 */
export const QUALITY_COVERAGE_FLOOR = 0.6;

export const DayQuality = z.object({
  /** Null where nothing logged that day carried the figure at all. */
  ...DietQuality.shape,
  /** 0-1. */
  coverage: z.number(),
  targets: QualityTargets,
});
export type DayQuality = z.infer<typeof DayQuality>;

/**
 * §9: food and exercise are reported separately. `net` is derived for callers that
 * want it, but the UI leads with food vs target.
 */
export const DaySummary = z.object({
  local_date: z.string(),
  consumed: Nutrition,
  quality: DayQuality,
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
  /**
   * Whether the address has been proved. Nothing is gated on it — the app works
   * either way — but a password reset can only ever reach a mailbox someone can
   * actually open, so the setup screen offers to send the link again.
   */
  email_verified: z.boolean(),
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
  /** Read-only here — a plan changes by paying, never by PATCHing a profile. */
  plan: PlanName,
  /**
   * What the kitchen must never suggest. Held on the profile rather than as a
   * standing note because it is true of every meal this person will ever eat,
   * and a fact that permanent should not depend on having mentioned it in a
   * chat once.
   */
  diet: Diet,
  avoids: z.array(z.string()),
  /**
   * Monday's review, in the inbox. The only notification this server sends that
   * is a matter of taste — everything else is about the account itself and is
   * not something to have an opinion about receiving.
   */
  notify_weekly_review: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileUpdate = Profile.omit({
  id: true,
  email: true,
  // Proved by clicking a link, never by asking to be believed.
  email_verified: true,
  is_setup_complete: true,
  // Granted by a payment, never by the client claiming it.
  plan: true,
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
   * Whether this deployment has a Google client configured. The sign-in screen
   * asks before it offers the button: a self-hosted install that has not set
   * one up should show an email form and nothing else, rather than a second
   * option that fails the moment it is pressed.
   */
  google_enabled: z.boolean(),
  /**
   * The raw session token, returned by signup and login only to a client that
   * asked for it with SESSION_TRANSPORT_HEADER. Absent everywhere else — the
   * browser's copy stays in the httpOnly cookie and is never readable here.
   */
  token: z.string().optional(),
});
export type AuthStatus = z.infer<typeof AuthStatus>;

/**
 * Closing your own account. The password is asked for again rather than taken
 * from the session, because the session is exactly what an unlocked phone or a
 * lifted token already has, and this is the one request in the product where
 * that should not be enough.
 */
export const DeleteAccountRequest = z.object({
  password: z.string().min(1).max(200),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/**
 * Asking for a reset link.
 *
 * The response is the same whether or not the address has an account, which is
 * why this schema is so thin: anything richer would be a way to ask the server
 * who has registered.
 */
export const PasswordResetRequest = z.object({
  email: z.string().email().max(254),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

/** Spending the link. The token is the proof, so no session is involved. */
export const PasswordReset = z.object({
  token: z.string().min(1).max(400),
  password: z.string().min(8).max(200),
});
export type PasswordReset = z.infer<typeof PasswordReset>;

/**
 * Proving an address — by the code, or by the link.
 *
 * Two ways into the same token row, and exactly one of them per request. The
 * code is for reading mail on a phone while signed in on a laptop; the link is
 * for the reverse. Spending either spends both.
 */
export const EmailVerification = z.union([
  z.object({ code: z.string().regex(/^\s*\d{6}\s*$/, 'Enter the six digits from the email.') }),
  z.object({ token: z.string().min(1).max(400) }),
]);
export type EmailVerification = z.infer<typeof EmailVerification>;

/**
 * What a 403 says when the session is fine but the address is not proved.
 *
 * A string the client matches on, rather than a status code it has to guess at:
 * an unverified account must be sent to the confirmation screen, not signed out
 * and dropped at the login form, and only a distinguishable error tells it which
 * of the two a 403 means.
 */
export const EMAIL_UNVERIFIED = 'email_unverified';

/**
 * What an endpoint that must not reveal anything says. Both password reset and
 * "send me another confirmation link" answer with this and nothing else — the
 * message is written for someone who is looking at the screen, and says the
 * same thing to someone probing for registered addresses.
 */
export const Acknowledged = z.object({
  ok: z.literal(true),
  message: z.string(),
});
export type Acknowledged = z.infer<typeof Acknowledged>;

/** What was destroyed, so the confirmation can say it rather than imply it. */
export const AccountDeletion = z.object({
  food_entries: z.number(),
  chat_messages: z.number(),
  photos: z.number(),
});
export type AccountDeletion = z.infer<typeof AccountDeletion>;

/**
 * What onboarding still needs before targets mean anything. The journal uses
 * this to decide whether to open in setup mode.
 */
export const OnboardingState = z.object({
  complete: z.boolean(),
  missing: z.array(z.string()),
});
export type OnboardingState = z.infer<typeof OnboardingState>;

// ---- Kitchen ---------------------------------------------------------------

/**
 * The kitchen: what you have, and what you could cook with it.
 *
 * The premise is the intersection nothing else can reach — a recipe site knows
 * good recipes, but it does not know that there is chicken in your fridge, that
 * you have 74g of protein left today, and that you cook the same eight things.
 */

/**
 * One thing in the kitchen.
 *
 * `last_seen_at` is carried all the way to the client rather than being cleaned
 * up on the server, because the screen has to be able to say "three weeks ago"
 * out loud. A pantry that presents stale items as current is worse than no
 * pantry: it builds a meal on an ingredient that was thrown out.
 */
export const PantryItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** The amount in the user's own words. Never a tracked count. */
  quantity_desc: z.string().nullable(),
  /** Assumed always present, and exempt from ageing. */
  is_staple: z.boolean(),
  last_seen_at: z.string(),
  source: z.enum(['typed', 'photo']),
});
export type PantryItem = z.infer<typeof PantryItem>;

/** Adding or refreshing an item. Matching is on the name, case-insensitively. */
export const PantryItemInput = z.object({
  name: z.string().min(1).max(80),
  quantity_desc: z.string().max(120).nullable().optional(),
  is_staple: z.boolean().optional(),
  source: z.enum(['typed', 'photo']).optional(),
});
export type PantryItemInput = z.infer<typeof PantryItemInput>;

export const PantryAddRequest = z.object({
  items: z.array(PantryItemInput).min(1).max(60),
});
export type PantryAddRequest = z.infer<typeof PantryAddRequest>;

export const PantryUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  quantity_desc: z.string().max(120).nullable().optional(),
  is_staple: z.boolean().optional(),
  /** Bump `last_seen_at` to now — "yes, still there". */
  seen: z.boolean().optional(),
});
export type PantryUpdate = z.infer<typeof PantryUpdate>;

/**
 * What the model thinks it saw in a fridge photo.
 *
 * Deliberately not a `PantryItem`: nothing is written until the user says so.
 * A photo shows the front row of one shelf, and the difference between "the
 * model read this" and "the user owns this" is the whole reason the scan
 * proposes instead of saving.
 */
export const PantryFind = z.object({
  name: z.string(),
  quantity_desc: z.string().nullable(),
  /** How sure the model is it identified this correctly. */
  confidence: Confidence,
});
export type PantryFind = z.infer<typeof PantryFind>;

export const PantryScanProposal = z.object({
  found: z.array(PantryFind),
  /** One line on what the photo showed, including what it could not make out. */
  note: z.string().nullable(),
  /** Names already in the pantry, so the screen can show what is merely a refresh. */
  already_known: z.array(z.string()),
});
export type PantryScanProposal = z.infer<typeof PantryScanProposal>;

/**
 * An ingredient with its macros already settled.
 *
 * The same shape as a logged `FoodItem` minus its database identity, which is
 * what makes "I cooked this" a single hand-off: the array goes straight into a
 * food entry with nothing re-estimated on the way.
 */
export const RecipeIngredient = z.object({
  name: z.string(),
  quantity_g: z.number().nullable(),
  quantity_desc: z.string().nullable(),
  /** True when this is not in the pantry and has to be bought. */
  missing: z.boolean().default(false),
  ...Nutrition.shape,
  ...DietQuality.shape,
});
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

/** Where a generated recipe came from, which is how much to trust its numbers. */
export const RECIPE_ORIGINS = ['invented', 'adapted', 'imported'] as const;
export const RecipeOrigin = z.enum(RECIPE_ORIGINS);
export type RecipeOrigin = z.infer<typeof RecipeOrigin>;

/** The budget a recipe was written against, so it can explain itself later. */
export const RecipeContext = z.object({
  local_date: z.string(),
  kcal_remaining: z.number(),
  protein_remaining: z.number(),
});
export type RecipeContext = z.infer<typeof RecipeContext>;

export const Recipe = z.object({
  id: z.string().uuid(),
  title: z.string(),
  /** One line on why this, right now. */
  summary: z.string().nullable(),
  portions: z.number().int(),
  minutes: z.number().int().nullable(),
  steps: z.array(z.string()),
  ingredients: z.array(RecipeIngredient),
  /** Per portion — the figure the card prints, and what cooking one logs. */
  ...Nutrition.shape,
  ...DietQuality.shape,
  confidence: Confidence,
  generated_for: RecipeContext.nullable(),
  origin: RecipeOrigin,
  /** The library recipe an adaptation started from, if it was one. */
  adapted_from: z.string().nullable(),
  saved: z.boolean(),
  cooked_at: z.string().nullable(),
  created_at: z.string(),
});
export type Recipe = z.infer<typeof Recipe>;

/**
 * What you need from the kitchen this time.
 *
 * The persistent half of "fit me" lives on the profile — `diet` and `avoids`
 * are true of every meal. This is the half that changes: how long you have
 * tonight, what you are trying to hit, how many portions you want to end up
 * with. All of it optional, because the useful default is still "just tell me
 * what I could cook".
 */
export const RecipeBrief = z.object({
  /**
   * Anything not covered by a field — "something one-pan", "use up the
   * spinach". Free text, because the interesting constraints never were an
   * enum anyone could write.
   */
  wants: z.string().max(300).optional(),
  /** Which meal it is for. Null infers from the time of day. */
  meal: Meal.nullable().optional(),
  /** Minutes available, start to plate. */
  minutes: z.number().int().min(5).max(240).nullable().optional(),
  /**
   * How many servings to cook. More than one is batch prep: the ingredient
   * quantities scale and the macros stay per portion, so cooking four and
   * eating one logs the same figure it always did.
   */
  portions: z.number().int().min(1).max(12).nullable().optional(),
  /** A floor on protein per portion, for a day that needs it. */
  protein_min: z.number().min(0).max(300).nullable().optional(),
  /**
   * A ceiling on calories per portion. Overrides the day's remaining budget,
   * which is otherwise what the kitchen aims at.
   */
  kcal_max: z.number().min(50).max(3000).nullable().optional(),
});
export type RecipeBrief = z.infer<typeof RecipeBrief>;

/** The original ask: invent something from the kitchen. */
export const RecipeSuggestRequest = RecipeBrief;
export type RecipeSuggestRequest = z.infer<typeof RecipeSuggestRequest>;

/**
 * Bring your own recipe and have it priced.
 *
 * Text rather than a URL, deliberately. Someone pasting the thing they already
 * cook is using their own recipe; a server that fetched and stored arbitrary
 * pages would be doing something else entirely.
 */
export const RecipeImportRequest = RecipeBrief.extend({
  text: z.string().min(20).max(6000),
});
export type RecipeImportRequest = z.infer<typeof RecipeImportRequest>;


/** Logging a recipe as eaten. Portions defaults to one — the card's figure. */
export const CookRequest = z.object({
  portions: z.number().positive().max(20).optional(),
  meal: Meal.optional(),
  eaten_at: z.string().optional(),
});
export type CookRequest = z.infer<typeof CookRequest>;

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
    category: ExerciseCategory.nullable().default(null),
    /** The sets, when there were any. A strength card is a table, not a total. */
    sets: z.array(ExerciseSet).default([]),
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
  /**
   * Recipes the model asked the kitchen for, mid-conversation.
   *
   * The whole `Recipe` rather than a summary, because the card in the journal
   * is the same card as on the Cook tab — servings stepper, cook button and
   * all. Answering "what can I make tonight?" with a teaser that sends someone
   * to another screen to act on it would be a worse answer than the sentence.
   */
  z.object({
    type: z.literal('recipes'),
    recipes: z.array(Recipe),
  }),
  /**
   * The one card that asks instead of reporting.
   *
   * Every other card here is a receipt — a picture of something that already
   * happened. This one is a question with the answer still missing, because
   * "went to the gym" is not a loggable fact and the three things needed to
   * make it one are things the user knows and the model would only guess at.
   *
   * Asking them in chat would be three more model calls and most of a minute.
   * The card collects the lot and posts once to `/exercise/workout`, so the
   * conversation carries the question and the arithmetic stays out of it.
   */
  z.object({
    type: z.literal('workout_prompt'),
    /** Where the agent thinks it should open, from what they already said. */
    suggested_category: ExerciseCategory.nullable(),
    /** The instant to log against, so a session mentioned late still lands right. */
    performed_at: z.string(),
    /** What the agent understood, echoed so the question does not feel blind. */
    heard: z.string().nullable(),
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
    'recipes_suggested',
    'workout_asked',
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

/**
 * What the API will accept as an image. Named because two routes take a photo —
 * a meal for the journal, a fridge for the kitchen — and the day they disagree
 * about which formats are allowed is a bug nobody would look for.
 */
export const PHOTO_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const PhotoMediaType = z.enum(PHOTO_MEDIA_TYPES);
export type PhotoMediaType = z.infer<typeof PhotoMediaType>;

export const ChatRequest = z.object({
  text: z.string().min(1).max(4000),
  /** Data URL or base64 payload of a meal photo. */
  photo_base64: z.string().optional(),
  photo_media_type: PhotoMediaType.optional(),
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
  /**
   * Diet quality over the window. Daily means rather than totals, because a
   * fortnight of fiber is not a number anybody has an intuition for.
   *
   * One series and it is fiber's, not four: fiber is the floor and the one
   * whose shape over time is worth looking at. Sodium, saturated fat and sugar
   * are ceilings, and a ceiling is a question about a week rather than a line
   * to watch day by day — four lines here would be a dashboard nobody reads.
   */
  quality: z.object({
    average: DietQuality,
    targets: QualityTargets,
    /** 0-1 across the whole window; the averages mean little when it is low. */
    coverage: z.number(),
    /** Days in the window whose panel was estimated at all. */
    days_measured: z.number(),
    fiber_series: z.array(TrendPoint),
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

// ---- The recipe library ----------------------------------------------------

/**
 * A recipe somebody else wrote, shipped with the app.
 *
 * The cold start for Cook. A generated recipe needs a stocked kitchen and a
 * model call; this needs neither, so there is something real on the screen the
 * first time anyone opens the tab — and the ranking still answers the app's
 * question rather than a recipe site's, because it is ordered by what you have
 * and what is left of your day.
 *
 * Source: USDA MyPlate Kitchen, a work of the US government and therefore in
 * the public domain. `source_url` travels with every recipe so the attribution
 * is in the data and not only in a comment.
 */

/** One line of the ingredient list, as a cook reads it. */
export const LibraryIngredient = z.object({
  text: z.string(),
  note: z.string().nullable(),
});
export type LibraryIngredient = z.infer<typeof LibraryIngredient>;

export const LibraryRecipe = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  category: z.string(),
  portions: z.number().int(),
  /** What one portion is, in the source's words — "1/8 of recipe". */
  serving_size: z.string().nullable(),
  ingredients: z.array(LibraryIngredient),
  steps: z.array(z.string()),
  /**
   * Per portion, as published. Unlike a generated recipe these are measured for
   * the finished dish rather than summed from priced ingredients, so there is
   * no per-ingredient breakdown to show — and inventing one to sit beside
   * measured numbers would be worse than not having it.
   */
  ...Nutrition.shape,
  image_path: z.string().nullable(),
  source: z.string(),
  source_url: z.string().nullable(),
  rating: z.number().nullable(),
  saved: z.boolean(),
  /**
   * Why this one is being shown, resolved per request against the kitchen and
   * the day. `have` names the pantry items it would use, which is the sentence
   * the card actually wants to say.
   */
  have: z.array(z.string()),
  missing: z.number().int(),
  /** Whether one portion fits inside what is left of today. */
  fits_today: z.boolean(),
});
export type LibraryRecipe = z.infer<typeof LibraryRecipe>;

export const LibraryQuery = z.object({
  q: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  saved: z.boolean().optional(),
  limit: z.number().int().min(1).max(60).optional(),
});
export type LibraryQuery = z.infer<typeof LibraryQuery>;

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

/**
 * A message somebody sent to the support address.
 *
 * Admin-only, and shaped as a record rather than a conversation: there is no
 * reply field, because replying is what a mail client is for. `user_id` is the
 * account matched at the moment it arrived — the question support is actually
 * asking is who this was when they wrote in, not who owns that address today.
 */
export const SupportEmail = z.object({
  id: z.string().uuid(),
  from_email: z.string(),
  /** The display name the sender chose. Only the address beside it is a fact. */
  from_name: z.string().nullable(),
  to_email: z.string(),
  subject: z.string().nullable(),
  text_body: z.string().nullable(),
  html_body: z.string().nullable(),
  /** Why the body is missing, when it is. The webhook carries metadata only. */
  body_error: z.string().nullable(),
  user_id: z.string().uuid().nullable(),
  user_name: z.string().nullable(),
  attachments: z.number(),
  received_at: z.string(),
  handled_at: z.string().nullable(),
});
export type SupportEmail = z.infer<typeof SupportEmail>;

export const SupportInbox = z.object({
  emails: z.array(SupportEmail),
  unhandled: z.number(),
});
export type SupportInbox = z.infer<typeof SupportInbox>;

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
