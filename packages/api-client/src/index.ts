import type {
  AccountDeletion,
  Acknowledged,
  AdaptiveProposal,
  Allowance,
  BarcodeLogRequest,
  BarcodeLogResponse,
  BarcodeProduct,
  Calendar,
  AdminOverview,
  AdminUser,
  AuthStatus,
  CookRequest,
  CostReport,
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  Credentials,
  DaySummary,
  Entitlements,
  ExerciseEntry,
  ExerciseSummary,
  ExerciseType,
  FoodEntry,
  FoodItem,
  GoogleExchange,
  LastWorkout,
  LogFoodRequest,
  Meal,
  MealTemplate,
  LibraryRecipe,
  OnboardingState,
  PantryItem,
  PantryItemInput,
  PantryScanProposal,
  PantryUpdate,
  PhotoMediaType,
  PhotoUploadTicket,
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
  Routine,
  SaveRoutineRequest,
  SaveScheduleRequest,
  WeekSchedule,
  ReviewStats,
  SignupRequest,
  SupportInbox,
  TablePage,
  TableSummary,
  UsageTurn,
  WeeklyReview,
  WeightEntry,
  WorkoutRequest,
  ShoppingExtra,
  ShoppingExtraInput,
  ShoppingExtraUpdate,
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

  /**
   * The credentials and content type every call carries, built once so the
   * streaming path below cannot drift from the ordinary one.
   */
  function headersFor(init: RequestInit): Headers {
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
    return headers;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await doFetch(`${root}${path}`, {
      ...init,
      headers: headersFor(init),
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
     * Where a native Google sign-in starts: a URL to open in an auth session
     * browser, not a request to make.
     *
     * A URL rather than a call because the whole handshake is a chain of
     * full-page navigations — the same reason the web renders an `<a href>`
     * rather than a button with an onClick. `fetch` would be asked to follow a
     * cross-origin redirect to Google's consent screen, which it will not do,
     * and there would be nowhere to show the consent screen even if it did.
     *
     * `redirect` is where the browser hands control back — the app's own URL
     * scheme — and `challenge` is the SHA-256 of a verifier the caller keeps to
     * itself until `exchangeGoogle`.
     */
    googleStartUrl: ({
      redirect,
      challenge,
      timezone,
    }: {
      redirect: string;
      challenge: string;
      timezone?: string;
    }) => {
      const params = new URLSearchParams({ redirect, challenge });
      if (timezone) params.set('tz', timezone);
      return `${root}/auth/google/start?${params.toString()}`;
    },

    /** Spends the code that redirect came back with. Answers as login does. */
    exchangeGoogle: (payload: GoogleExchange) =>
      request<AuthStatus>('/auth/google/exchange', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

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

    /**
     * Put a photo in the bucket directly, and hand back the key to send with
     * the turn instead of the bytes.
     *
     * Two round trips rather than one, and still the cheaper shape: base64 is a
     * third larger than the file, and sending it as a JSON body means an API
     * worker holds all of it for as long as the uplink takes. This way the
     * bytes go phone-to-bucket and the API is told a string.
     *
     * **Null means send `photo_base64` instead** — the deployment stores photos
     * on local disk and has nowhere to upload to. That is an ordinary
     * configuration, not a failure, so callers must keep the old path working
     * rather than treating this as an error.
     */
    /**
     * The raw ticket, for a client that can upload without holding the bytes.
     *
     * React Native's answer is `expo-file-system`, which streams a file URI
     * straight to the URL — better than `uploadPhoto` below rather than worse,
     * since a phone never has to materialise several megabytes in JS to send a
     * photo it already has on disk.
     *
     * Null `url` means the deployment has no bucket: send `photo_base64`.
     */
    photoUploadTicket: (mediaType: PhotoMediaType) =>
      request<PhotoUploadTicket>('/photos/upload-url', {
        method: 'POST',
        body: JSON.stringify({ media_type: mediaType }),
      }),

    uploadPhoto: async (
      bytes: Blob | ArrayBuffer | Uint8Array,
      mediaType: PhotoMediaType,
    ): Promise<string | null> => {
      const ticket = await request<PhotoUploadTicket>('/photos/upload-url', {
        method: 'POST',
        body: JSON.stringify({ media_type: mediaType }),
      });
      if (!ticket.url || !ticket.key) return null;

      // Deliberately not through `request`: this goes to the bucket, and the
      // session cookie or bearer token has no business being sent there. The
      // content type has to match the one the URL was signed for.
      const response = await doFetch(ticket.url, {
        method: 'PUT',
        headers: { 'content-type': mediaType },
        // Cast because this file is deliberately DOM-lib-free — it runs in
        // Next.js and in React Native, and `BodyInit` is not a name both agree
        // on. Every value the parameter accepts is one `fetch` takes.
        body: bytes as RequestInit['body'],
      });
      if (!response.ok) {
        throw new ApiError(`Photo upload failed (${response.status})`, response.status);
      }
      return ticket.key;
    },

    /** The whole product loop lives behind this one call. */
    chat: (payload: ChatRequest) =>
      request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify(payload) }),

    /**
     * The same turn, narrated. Resolves with exactly what `chat` would have
     * returned; `onEvent` sees the reply being written on the way there.
     *
     * The resolved `ChatResponse` is the authority and the streamed text is a
     * preview of it — a caller that renders the final message on resolve is
     * correct even if it ignores every event. That is the property worth
     * keeping: `onEvent` is an improvement to the wait, never a source of
     * truth, so nothing downstream has to reason about a half-written reply.
     *
     * A failure raised after the stream opened arrives as an `error` frame
     * rather than a status code — the head is long gone by then — so it is
     * re-thrown here as an `ApiError`. 502 because that is what the same
     * failure would have been on `/chat`, and a caller telling the two paths
     * apart by the shape of their errors would be a caller with a bug in it.
     */
    chatStream: async (
      payload: ChatRequest,
      onEvent: (event: ChatStreamEvent) => void,
    ): Promise<ChatResponse> => {
      const init: RequestInit = { method: 'POST', body: JSON.stringify(payload) };
      const res = await doFetch(`${root}/chat/stream`, {
        ...init,
        headers: headersFor(init),
        credentials: 'include',
      });

      // Every pre-flight rejection — a bad body, no provider configured, a turn
      // already in flight — still arrives as an ordinary JSON error, because
      // the API defers the stream's head precisely so it can send these.
      if (!res.ok || !res.body) {
        const text = await res.text();
        const body = text ? safeJson(text) : undefined;
        throw new ApiError(errorMessage(body, res.status), res.status, body);
      }

      let response: ChatResponse | null = null;
      let failure: string | null = null;

      for await (const event of readEventStream(res.body)) {
        if (event.type === 'done') response = event.response;
        else if (event.type === 'error') failure = event.error;
        else onEvent(event);
      }

      if (failure) throw new ApiError(failure, 502);
      // A stream that ended without either terminal frame is a connection that
      // died mid-turn. Said plainly rather than resolved with nothing: the turn
      // may well have landed, and the caller's reconciliation is the right
      // thing to run next.
      if (!response) throw new ApiError('The connection dropped before the reply arrived.', 502);
      return response;
    },

    history: (limit = 50) => request<{ messages: ChatMessage[] }>(`/chat/history?limit=${limit}`),

    day: (date?: string) => request<DaySummary>(`/day${date ? `?date=${date}` : ''}`),

    progress: (days = 30) => request<Progress>(`/progress?days=${days}`),

    exercise: (days = 30) => request<ExerciseSummary>(`/progress/exercise?days=${days}`),

    calendar: (from: string, to: string) =>
      request<Calendar>(`/calendar?from=${from}&to=${to}`),

    profile: () => request<Profile>('/profile'),

    /**
     * The plan, every meter's remainder, and what the other tiers hold — the
     * one request behind every surface that talks about money.
     *
     * Not `/plan`: that is the meal plan, and has been since the kitchen
     * shipped.
     */
    entitlements: () => request<Entitlements>('/entitlements'),

    updateProfile: (patch: ProfileUpdate) =>
      request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(patch) }),

    /**
     * Logs a meal without asking the model anything.
     *
     * The one create path that needs neither a reachable model nor a remote
     * catalogue, which is what lets an offline client queue it. Send a
     * `client_id` and the call is safe to repeat: the server logs it once
     * however many times a retrying outbox asks. See OFFLINE.md.
     */
    logFoodEntry: (payload: LogFoodRequest) =>
      request<FoodEntry>('/entries/food', { method: 'POST', body: JSON.stringify(payload) }),

    /**
     * Corrects an entry that is already logged.
     *
     * `items` is the complete replacement list, not a diff — send every item
     * the meal should end up with, including the ones that did not change.
     * Omit it to leave the food alone and move only the label, the meal or the
     * time.
     */
    updateFoodEntry: (
      id: string,
      patch: Partial<Pick<FoodEntry, 'meal' | 'description' | 'eaten_at' | 'confidence' | 'note'>> & {
        items?: Omit<FoodItem, 'id' | 'entry_id'>[];
      },
    ) => request<FoodEntry>(`/entries/food/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

    /**
     * Tells the server where this phone can be reached.
     *
     * Called on every start the app has permission for rather than once, since
     * a token can change under a reinstall or a restore and a stale one fails
     * silently — the notification simply never arrives.
     */
    registerDevice: (token: string, platform: 'ios' | 'android') =>
      request<{ ok: true }>('/notifications/device', {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      }),

    /** Gives the address up, so the next person to sign in here is not buzzed. */
    forgetDevice: (token: string) =>
      request<{ ok: true }>('/notifications/device', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      }),

    /**
     * One entry, items and macros and all.
     *
     * Richer than the card the journal holds, which carries item *names* and
     * the meal's totals but not what each item is worth — so this is what an
     * edit form opens on. Fetched on demand rather than widening the card,
     * because every card in every turn would then carry a full nutrition table
     * that only the rare correction ever reads.
     */
    foodEntry: (id: string) => request<FoodEntry>(`/entries/food/${id}`),

    deleteFoodEntry: (id: string) =>
      request<{ ok: true }>(`/entries/food/${id}`, { method: 'DELETE' }),

    deleteExerciseEntry: (id: string) =>
      request<{ ok: true }>(`/entries/exercise/${id}`, { method: 'DELETE' }),

    /**
     * Records a weigh-in, or replaces the one already filed under that day.
     *
     * `local_date` is how a correction targets a past day. One weight per day
     * is the rule, so naming the day replaces that day's figure and keeps the
     * row's id — which is what lets the journal card that announced it be
     * redrawn rather than orphaned. Omit it and the weigh-in lands on today.
     */
    logWeight: (weight_kg: number, measured_at?: string, local_date?: string) =>
      request<WeightEntry>('/weight', {
        method: 'POST',
        body: JSON.stringify({ weight_kg, measured_at, local_date }),
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
     * The last session of a kind, so the card can offer it back rather than ask
     * for it again. Null when they have not done one.
     */
    lastWorkout: (category: string) =>
      request<{ workout: LastWorkout | null }>(
        `/exercise/last?category=${encodeURIComponent(category)}`,
      ),

    // ---- Routines ----

    /**
     * The workouts this account has saved, most recently used first, each
     * carrying the numbers from the last time its exercises were done.
     */
    routines: (category?: string) =>
      request<{ routines: Routine[] }>(
        `/routines${category ? `?category=${encodeURIComponent(category)}` : ''}`,
      ),

    /** Saves one, or replaces whichever already has this name. */
    saveRoutine: (payload: SaveRoutineRequest) =>
      request<Routine>('/routines', { method: 'POST', body: JSON.stringify(payload) }),

    deleteRoutine: (id: string) =>
      request<void>(`/routines/${id}`, { method: 'DELETE' }),

    /** The training week: declared days, with inferred ones filling the gaps. */
    schedule: () => request<{ week: WeekSchedule }>('/routines/schedule'),

    /** Sets the days they chose. A day mapped to null falls back to inference. */
    saveSchedule: (payload: SaveScheduleRequest) =>
      request<{ week: WeekSchedule }>('/routines/schedule', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    /**
     * Logs a counted session in one request. No model call behind it — the card
     * collected everything, and this is arithmetic over what was typed.
     */
    logWorkout: (payload: WorkoutRequest) =>
      request<ExerciseEntry>('/exercise/workout', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    /**
     * Rewrites a counted session in place, taking the body it was logged with.
     *
     * The whole session rather than a patch, because the card an edit reopens
     * is the card it was submitted from: what comes back is a complete answer,
     * and the sets have no ids for a diff to address anyway. The entry keeps
     * its id, so the journal card and the day's totals follow it.
     */
    updateWorkout: (id: string, payload: WorkoutRequest) =>
      request<ExerciseEntry>(`/entries/exercise/${id}`, {
        method: 'PATCH',
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
    scanFridge: (photo: string | { base64?: string; key?: string }, mediaType?: PhotoMediaType) =>
      request<PantryScanProposal>('/pantry/scan', {
        method: 'POST',
        body: JSON.stringify({
          // A bare string is the original call — the data URL itself. Kept
          // because an app already on somebody's phone makes it, and there is
          // no version of this worth a forced client update.
          ...(typeof photo === 'string'
            ? { photo_base64: photo }
            : { photo_base64: photo.base64, photo_key: photo.key }),
          photo_media_type: mediaType,
        }),
      }),

    // ---- Barcodes ----

    /**
     * What is in the packet, per 100g. Writes nothing.
     *
     * A 404 is an ordinary answer rather than an error — most of a real trolley
     * is own-brands nobody has catalogued — and the caller is expected to offer
     * the label photo instead of reporting a failure.
     */
    barcode: (code: string) => request<BarcodeProduct>(`/barcode/${encodeURIComponent(code)}`),

    /**
     * How much of it was eaten. Grams or servings, one or the other, and never
     * folded into the lookup above: the packet says what the food is and only a
     * person can say how much of it they had.
     *
     * Comes back with the journal message the scan was written into as well as
     * the entry, so the conversation can grow by the one row this caused
     * instead of re-reading its history to find it.
     */
    logBarcode: (code: string, portion: BarcodeLogRequest) =>
      request<BarcodeLogResponse>(`/barcode/${encodeURIComponent(code)}/log`, {
        method: 'POST',
        body: JSON.stringify(portion),
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
      request<{ recipes: Recipe[]; message: string; allowance: Allowance }>('/recipes/suggest', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    recipes: (options: { limit?: number; savedOnly?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (options.savedOnly) params.set('saved', 'true');
      const qs = params.toString();
      return request<{ recipes: Recipe[]; allowance: Allowance }>(`/recipes${qs ? `?${qs}` : ''}`);
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

    /**
     * The week's ingredients, plus whatever they wrote on the list themselves.
     *
     * The ingredient half is derived on every read, so it can never be stale.
     * An empty list is an ordinary answer — there is no 404 for a week nobody
     * has planned and nobody has written on.
     */
    shoppingList: (weekStart?: string) =>
      request<ShoppingList>(
        `/plan/shopping-list${weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : ''}`,
      ),

    /**
     * Writes lines no recipe would produce — kitchen roll, the wine for
     * Saturday. Answers with the whole list, because a written name can land on
     * a row the plan had already put there.
     */
    addShoppingItems: (items: ShoppingExtraInput[], weekStart?: string) =>
      request<ShoppingList>('/plan/shopping-list/extras', {
        method: 'POST',
        body: JSON.stringify({ items, ...(weekStart ? { week_start: weekStart } : {}) }),
      }),

    /** Tick a written line off, put it back, or correct what it says. */
    updateShoppingItem: (id: string, patch: ShoppingExtraUpdate) =>
      request<ShoppingExtra>(`/plan/shopping-list/extras/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

    /** Off the list entirely. Only written lines can go — the rest is derived. */
    deleteShoppingItem: (id: string) =>
      request<void>(`/plan/shopping-list/extras/${id}`, { method: 'DELETE' }),

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

      /**
       * One page of one table. `q` searches every visible column at once —
       * the server casts each to text — which is the search an admin actually
       * has: they know the id or the address, not which column carries it.
       */
      table: (
        table: string,
        options: {
          limit?: number;
          offset?: number;
          userId?: string;
          q?: string;
          sort?: string;
          dir?: 'asc' | 'desc';
        } = {},
      ) => {
        const params = new URLSearchParams();
        if (options.limit) params.set('limit', String(options.limit));
        if (options.offset) params.set('offset', String(options.offset));
        if (options.userId) params.set('user_id', options.userId);
        if (options.q) params.set('q', options.q);
        if (options.sort) params.set('sort', options.sort);
        if (options.dir) params.set('dir', options.dir);
        const qs = params.toString();
        return request<TablePage>(`/admin/tables/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`);
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

/**
 * The SSE frames on a response body, one parsed event at a time.
 *
 * Hand-rolled because `EventSource` cannot do this: it is GET-only, and a turn
 * is a POST carrying up to twenty-five megabytes of photo. What is left is
 * small — the protocol in use here is one `data:` line per frame, terminated by
 * a blank line — but two details are the ones people get wrong.
 *
 * A chunk boundary falls wherever TCP decides, not where a frame ends, so the
 * tail of a partial frame has to survive until the next read; a parser that
 * treats each chunk as a whole message works perfectly in development and
 * corrupts long replies in production. And `: keep-alive` comments have to be
 * skipped rather than parsed — they are how the stream survives an idle proxy.
 */
async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true`, so a multi-byte character split across two chunks is
      // held rather than turned into a replacement character.
      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf('\n\n');
      for (; split !== -1; split = buffer.indexOf('\n\n')) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }
  } finally {
    // Releases the lock whichever way this generator was left — including a
    // caller that stopped consuming it early.
    reader.cancel().catch(() => {});
  }
}

/** One frame to an event, or null for anything that is not one — comments included. */
function parseFrame(frame: string): ChatStreamEvent | null {
  const line = frame.split('\n').find((l) => l.startsWith('data:'));
  if (!line) return null;
  try {
    return JSON.parse(line.slice('data:'.length)) as ChatStreamEvent;
  } catch {
    return null;
  }
}
