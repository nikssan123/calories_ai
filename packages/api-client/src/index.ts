import type {
  AdaptiveProposal,
  AdminOverview,
  AdminUser,
  AuthStatus,
  CostReport,
  ChatRequest,
  ChatResponse,
  Credentials,
  DaySummary,
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

/**
 * Transport-only client. Uses nothing but `fetch`, so the same file works in
 * Next.js (server and browser) and in React Native later.
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
  token?: string;
  fetchImpl?: typeof fetch;
}

export function createApiClient({ baseUrl, token, fetchImpl }: ApiClientOptions) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const root = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);

    const res = await doFetch(`${root}${path}`, {
      ...init,
      headers,
      // The session lives in an httpOnly cookie. React Native will pass a token
      // via the `token` option instead, which is why both paths are supported.
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

    onboarding: () => request<OnboardingState>('/onboarding'),

    /** The whole product loop lives behind this one call. */
    chat: (payload: ChatRequest) =>
      request<ChatResponse>('/chat', { method: 'POST', body: JSON.stringify(payload) }),

    history: (limit = 50) => request<{ messages: ChatMessage[] }>(`/chat/history?limit=${limit}`),

    day: (date?: string) => request<DaySummary>(`/day${date ? `?date=${date}` : ''}`),

    progress: (days = 30) => request<Progress>(`/progress?days=${days}`),

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

    photoUrl: (photoId: string) => `${root}/photos/${photoId}`,

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
