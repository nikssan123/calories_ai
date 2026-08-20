import type {
  AccountDeletion,
  Acknowledged,
  AdaptiveProposal,
  Calendar,
  AdminOverview,
  AdminUser,
  AuthStatus,
  CookRequest,
  CostReport,
  ChatRequest,
  ChatResponse,
  Credentials,
  DaySummary,
  ExerciseEntry,
  ExerciseSummary,
  ExerciseType,
  FoodEntry,
  Meal,
  MealTemplate,
  LibraryRecipe,
  OnboardingState,
  PantryItem,
  PantryItemInput,
  PantryScanProposal,
  PantryUpdate,
  PhotoMediaType,
  Profile,
  ProfileUpdate,
  Progress,
  ChatMessage,
  Recipe,
  RecipeBrief,
  RecipeImportRequest,
  RecipeSuggestRequest,
  MealPlan,
  MealPlanBrief,
  ShoppingList,
  RepeatRequest,
  ReviewStats,
  SignupRequest,
  SupportInbox,
  TablePage,
  TableSummary,
  UsageTurn,
  WeeklyReview,
  WeightEntry,
  WorkoutRequest,
} from '@ct/shared';
import { SESSION_TRANSPORT_HEADER } from '@ct/shared';

/**
 * Transport-only client. Uses nothing but `fetch`, so the same file works in
 * Next.js (server and browser) and in React Native.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /**
   * The session token, for clients that hold their own. A function is read on
   * every request, which is what a native app needs: the client is constructed
   * before anyone has signed in, and the token appears later.
   */
  token?: string | (() => string | null | undefined);
  /**
   * How this client carries its session. `cookie` (the default) suits the
   * browser, where the token is httpOnly and deliberately unreadable. `bearer`
   * asks the API to return the token on signup and login so the caller can
   * store it — for React Native, in the device keystore.
   */
  sessionTransport?: 'cookie' | 'bearer';
  fetchImpl?: typeof fetch;
}

export function createApiClient({
  baseUrl,
  token,
  sessionTransport = 'cookie',
  fetchImpl,
}: ApiClientOptions) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const root = baseUrl.replace(/\/$/, '');
  const currentToken = () => (typeof token === 'function' ? token() : token);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    // Only claim a JSON body when one is actually being sent. A bodyless POST
    // or DELETE labelled `application/json` is rejected by the API before it
    // reaches the route.
    if (init.body !== undefined) headers.set('content-type', 'application/json');

    const bearer = currentToken();
    if (bearer) headers.set('authorization', `Bearer ${bearer}`);
    // Sent on every request rather than only on the two that answer with a
    // token, so the server never has to care which endpoint is being called.
    if (sessionTransport === 'bearer') headers.set(SESSION_TRANSPORT_HEADER, 'bearer');

    const res = await doFetch(`${root}${path}`, {
      ...init,
      headers,
      // Harmless where there is no cookie jar, and required where there is: the
      // browser's session is an httpOnly cookie it will not send otherwise.
      credentials: 'include',
    });
    const text = await res.text();
    const body = text ? safeJson(text) : undefined;

    if (!res.ok) {
      throw new ApiError(errorMessage(body, res.status), res.status, body);
    }
    return body as T;
  }

  return {
    // ---- Accounts ----
    me: () => request<AuthStatus>('/auth/me'),

    signup: (payload: SignupRequest) =>
      request<AuthStatus>('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),

    login: (payload: Credentials) =>
      request<AuthStatus>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

    logout: () => request<AuthStatus>('/auth/logout', { method: 'POST' }),

    /**
     * Asks for a reset link. Resolves the same way whether or not the address
     * has an account — the API will not say, and neither will this.
     */
    forgotPassword: (email: string) =>
      request<Acknowledged>('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    /**
     * Spends the link. Signs every device out, including this one, and does not
     * sign the caller back in — send them to the login screen afterwards.
     */
    resetPassword: (token: string, password: string) =>
      request<Acknowledged>('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),

    /** Confirms an address from the emailed link. Needs no session. */
    verifyEmail: (token: string) =>
      request<Acknowledged>('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),

    /**
     * Confirms an address with the six-digit code. Needs the session, because a
     * short code is only meaningful against the account that was issued it.
     */
    verifyEmailCode: (code: string) =>
      request<Acknowledged>('/auth/verify', { method: 'POST', body: JSON.stringify({ code }) }),

    /** Another confirmation link, for the one that went to spam. */
    resendVerification: () => request<Acknowledged>('/auth/verify/resend', { method: 'POST' }),

    /**
     * Turns off the weekly review email from the link in its own footer. Takes
     * a signature rather than a session: whoever is clicking it is in their
     * mail client, not signed in here.
     */
    unsubscribe: (userId: string, signature: string) =>
      request<Acknowledged>(
        `/email/unsubscribe?u=${encodeURIComponent(userId)}&s=${encodeURIComponent(signature)}`,
        { method: 'POST' },
      ),

    /** Irreversible, and takes every other signed-in device with it. */
    deleteAccount: (password: string) =>
      request<AccountDeletion>('/account', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      }),

    onboarding: () => request<OnboardingState>('/onboarding'),

    /** The whole product loop lives behind this one call. */
    chat: (payload: ChatRequest) =>
      request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify(payload) }),

    history: (limit = 50) => request<{ messages: ChatMessage[] }>(`/chat/history?limit=${limit}`),

    day: (date?: string) => request<DaySummary>(`/day${date ? `?date=${date}` : ''}`),

    progress: (days = 30) => request<Progress>(`/progress?days=${days}`),

    exercise: (days = 30) => request<ExerciseSummary>(`/progress/exercise?days=${days}`),

    calendar: (from: string, to: string) =>
      request<Calendar>(`/calendar?from=${from}&to=${to}`),

    profile: () => request<Profile>('/profile'),

    updateProfile: (patch: ProfileUpdate) =>
      request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(patch) }),

    updateFoodEntry: (id: string, patch: Partial<Pick<FoodEntry, 'meal' | 'description' | 'eaten_at'>>) =>
      request<FoodEntry>(`/entries/food/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

    deleteFoodEntry: (id: string) =>
      request<{ ok: true }>(`/entries/food/${id}`, { method: 'DELETE' }),

    deleteExerciseEntry: (id: string) =>
      request<{ ok: true }>(`/entries/exercise/${id}`, { method: 'DELETE' }),

    logWeight: (weight_kg: number, measured_at?: string) =>
      request<WeightEntry>('/weight', {
        method: 'POST',
        body: JSON.stringify({ weight_kg, measured_at }),
      }),

    // ---- Repeat a meal ----

    /** The things this user actually eats, most-repeated first. */
    mealTemplates: (options: {
      query?: string;
      meal?: Meal;
      days?: number;
      limit?: number;
    } = {}) => {
      const params = new URLSearchParams();
      if (options.query) params.set('query', options.query);
      if (options.meal) params.set('meal', options.meal);
      if (options.days) params.set('days', String(options.days));
      if (options.limit) params.set('limit', String(options.limit));
      const qs = params.toString();
      return request<{ meals: MealTemplate[] }>(`/history/meals${qs ? `?${qs}` : ''}`);
    },

    /** Clones a past entry to now. The copy is independent of the original. */
    repeatFoodEntry: (entryId: string, payload: RepeatRequest = {}) =>
      request<FoodEntry>(`/entries/food/${entryId}/repeat`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // ---- Workouts ----

    /** Built-in exercises plus anything this account has invented. */
    exerciseTypes: (category?: string) =>
      request<{ types: ExerciseType[] }>(
        `/exercise/types${category ? `?category=${encodeURIComponent(category)}` : ''}`,
      ),

    /**
     * Logs a counted session in one request. No model call behind it — the card
     * collected everything, and this is arithmetic over what was typed.
     */
    logWorkout: (payload: WorkoutRequest) =>
      request<ExerciseEntry>('/exercise/workout', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // ---- The kitchen ----

    /** Everything the user says is in their kitchen, staples last. */
    pantry: () => request<{ items: PantryItem[] }>('/pantry'),

    /**
     * Adds or refreshes items. Matching is on the name, case-insensitively, so
     * sending something already there refreshes how recently it was seen rather
     * than duplicating it — which is what makes this the right endpoint for the
     * confirmed output of a scan.
     */
    addPantryItems: (items: PantryItemInput[]) =>
      request<{ items: PantryItem[] }>('/pantry', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),

    updatePantryItem: (id: string, patch: PantryUpdate) =>
      request<PantryItem>(`/pantry/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

    deletePantryItem: (id: string) => request<void>(`/pantry/${id}`, { method: 'DELETE' }),

    /**
     * Reads a fridge photo into a list to confirm. Writes nothing: post what
     * survives the user's editing to `addPantryItems`.
     */
    scanFridge: (photoBase64: string, mediaType?: PhotoMediaType) =>
      request<PantryScanProposal>('/pantry/scan', {
        method: 'POST',
        body: JSON.stringify({ photo_base64: photoBase64, photo_media_type: mediaType }),
      }),

    /**
     * Rework a library recipe into one this person can actually cook tonight.
     */
    adaptLibraryRecipe: (slug: string, payload: RecipeBrief = {}) =>
      request<{ recipes: Recipe[]; message: string }>(`/library/${slug}/adapt`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    /** Price a recipe the user brought and save it as theirs. */
    importRecipe: (payload: RecipeImportRequest) =>
      request<{ recipes: Recipe[]; message: string }>('/recipes/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    /** Ideas for what to cook, from the pantry and what is left of today. */
    suggestRecipes: (payload: RecipeSuggestRequest = {}) =>
      request<{ recipes: Recipe[]; message: string }>('/recipes/suggest', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    recipes: (options: { limit?: number; savedOnly?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (options.savedOnly) params.set('saved', 'true');
      const qs = params.toString();
      return request<{ recipes: Recipe[] }>(`/recipes${qs ? `?${qs}` : ''}`);
    },

    recipe: (id: string) => request<Recipe>(`/recipes/${id}`),

    saveRecipe: (id: string, saved: boolean) =>
      request<Recipe>(`/recipes/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) }),

    /** Logs a recipe as eaten. Answers with the entry, so the day updates at once. */
    cookRecipe: (id: string, payload: CookRequest = {}) =>
      request<FoodEntry>(`/recipes/${id}/cook`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // ---- The week ahead ----

    /** Generates a week of dinners. The most expensive call in the product. */
    planWeek: (payload: MealPlanBrief = {}) =>
      request<{ plan: MealPlan; message: string }>('/plan', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    /**
     * This week's plan. `plan` is null when there is not one — an ordinary
     * state of the screen rather than a missing resource.
     */
    mealPlan: (weekStart?: string) =>
      request<{ plan: MealPlan | null; week_start: string }>(
        `/plan${weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : ''}`,
      ),

    /** Swap a night for another recipe, or pass null to clear it. */
    updateSlot: (id: string, patch: { recipe_id?: string | null; portions?: number }) =>
      request<MealPlan>(`/plan/slots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    cookSlot: (id: string, payload: CookRequest = {}) =>
      request<FoodEntry>(`/plan/slots/${id}/cook`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    /** Derived on every read, so it can never be stale. */
    shoppingList: (weekStart?: string) =>
      request<ShoppingList>(
        `/plan/shopping-list${weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : ''}`,
      ),

    // ---- The starter library ----

    /**
     * A hundred real recipes, already ranked by what is in the kitchen and what
     * is left of today. No model call behind it — this is the answer when
     * someone opens Cook for the first time.
     */
    library: (options: { q?: string; category?: string; savedOnly?: boolean; limit?: number } = {}) => {
      const params = new URLSearchParams();
      if (options.q) params.set('q', options.q);
      if (options.category) params.set('category', options.category);
      if (options.savedOnly) params.set('saved', 'true');
      if (options.limit) params.set('limit', String(options.limit));
      const qs = params.toString();
      return request<{ recipes: LibraryRecipe[] }>(`/library${qs ? `?${qs}` : ''}`);
    },

    libraryRecipe: (slug: string) => request<LibraryRecipe>(`/library/${slug}`),

    saveLibraryRecipe: (slug: string, saved: boolean) =>
      request<void>(`/library/${slug}`, { method: 'PATCH', body: JSON.stringify({ saved }) }),

    cookLibraryRecipe: (slug: string, payload: CookRequest = {}) =>
      request<FoodEntry>(`/library/${slug}/cook`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    // ---- Adaptive targets & weekly reviews ----

    adaptiveTargets: () => request<AdaptiveProposal>('/targets/adaptive'),

    reviews: (limit = 12) => request<{ reviews: WeeklyReview[] }>(`/reviews?limit=${limit}`),

    latestReview: () => request<WeeklyReview>('/reviews/latest'),

    reviewPreview: () => request<ReviewStats>('/reviews/preview'),

    runReview: () => request<WeeklyReview>('/reviews/run', { method: 'POST' }),

    /**
     * Absolute URL for the signed `photo_url` on a ChatMessage. The server
     * returns a path because it does not know the host it is reached by, so
     * joining it to this client's own base is the last step.
     */
    photoUrl: (signedPath: string) => `${root}${signedPath}`,

    // ---- Admin ----
    //
    // Every one of these 404s for a non-admin, which is also what the panel
    // relies on: it never has to reason about a partially-permitted state.

    admin: {
      overview: () => request<AdminOverview>('/admin/overview'),

      migrations: () =>
        request<{ migrations: Array<{ name: string; applied_at: string }> }>('/admin/migrations'),

      tables: () => request<{ tables: TableSummary[] }>('/admin/tables'),

      table: (table: string, options: { limit?: number; offset?: number; userId?: string } = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', String(options.limit));
        if (options.offset) params.set('offset', String(options.offset));
        if (options.userId) params.set('user_id', options.userId);
        const qs = params.toString();
        return request<TablePage>(`/admin/tables/${table}${qs ? `?${qs}` : ''}`);
      },

      users: (limit = 100) => request<{ users: AdminUser[] }>(`/admin/users?limit=${limit}`),

      user: (id: string) => request<AdminUser>(`/admin/users/${id}`),

      /** What people have written in to the support address. */
      support: (limit = 50) => request<SupportInbox>(`/admin/support?limit=${limit}`),

      setSupportHandled: (id: string, handled: boolean) =>
        request<{ ok: true; handled: boolean }>(`/admin/support/${id}/handled`, {
          method: 'POST',
          body: JSON.stringify({ handled }),
        }),

      costs: (days = 30) => request<CostReport>(`/admin/costs?days=${days}`),

      turns: (options: { limit?: number; userId?: string } = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', String(options.limit));
        if (options.userId) params.set('user_id', options.userId);
        const qs = params.toString();
        return request<{ turns: UsageTurn[] }>(`/admin/costs/turns${qs ? `?${qs}` : ''}`);
      },

      signOutUser: (id: string) =>
        request<{ revoked: number }>(`/admin/users/${id}/sign-out`, { method: 'POST' }),

      resetPassword: (id: string, password: string) =>
        request<{ ok: true }>(`/admin/users/${id}/password`, {
          method: 'POST',
          body: JSON.stringify({ password }),
        }),

      setDisabled: (id: string, disabled: boolean) =>
        request<{ ok: true; disabled: boolean }>(`/admin/users/${id}/disabled`, {
          method: 'POST',
          body: JSON.stringify({ disabled }),
        }),

      /** Irreversible. `confirmEmail` must match the account's own address. */
      deleteUser: (id: string, confirmEmail: string) =>
        request<{ ok: true }>(`/admin/users/${id}`, {
          method: 'DELETE',
          body: JSON.stringify({ confirm_email: confirmEmail }),
        }),

      runReview: (id: string) =>
        request<WeeklyReview>(`/admin/users/${id}/review`, { method: 'POST' }),

      runAdaptive: (id: string) =>
        request<{ proposal: AdaptiveProposal; applied: boolean }>(
          `/admin/users/${id}/adaptive`,
          { method: 'POST' },
        ),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const value = (body as { error: unknown }).error;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return `Request failed with ${status}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
