import type {
  AccountDeletion,
  Acknowledged,
  AdaptiveProposal,
  Calendar,
  AdminOverview,
  AdminUser,
  AuthStatus,
  CostReport,
  ChatRequest,
  ChatResponse,
  Credentials,
  DaySummary,
  ExerciseSummary,
  FoodEntry,
  Meal,
  MealTemplate,
  OnboardingState,
  Profile,
  ProfileUpdate,
  Progress,
  ChatMessage,
  RepeatRequest,
  ReviewStats,
  SignupRequest,
  TablePage,
  TableSummary,
  UsageTurn,
  WeeklyReview,
  WeightEntry,
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
