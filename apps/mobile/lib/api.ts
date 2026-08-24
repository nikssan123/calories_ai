import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { ApiError, createApiClient } from '@ct/api-client';
import { Allowance } from '@ct/shared';
import { currentToken } from '@/lib/session';

/**
 * Where the API lives.
 *
 * A phone talks to the deployed API; only local development needs care. The
 * device is not the machine running the server, so `localhost` resolves to the
 * phone itself and every request fails with something that looks like the
 * server being down. `EXPO_PUBLIC_API_URL` is the override, and when it is
 * absent in development the packager's own host is a good guess — it is by
 * definition the machine you are running `expo start` on, reachable from the
 * device that just loaded the bundle from it.
 */
function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  if (!__DEV__) return 'https://api.daysofar.com';

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : 'http://localhost:4000';
}

export const API_BASE_URL = resolveBaseUrl();

/**
 * The same transport-only client the web uses, in its other configuration.
 *
 * `bearer` rather than `cookie`, so signup and login answer with the raw token
 * for this client to keep; and `token` as a *function*, because the client is
 * built at module load — long before anyone has signed in — and must pick up
 * whatever the keystore has by the time a request actually goes out.
 */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  sessionTransport: 'bearer',
  token: currentToken,
  /*
   * `expo/fetch`, not the global one, and the whole client rather than the one
   * call that needs it.
   *
   * React Native's built-in `fetch` is XMLHttpRequest underneath: it buffers
   * the entire response and hands back a `Response` whose `.body` is null. The
   * journal is a *streamed* reply — `chatStream` iterates `res.body` — so on
   * the stock implementation it does not degrade to arriving slowly, it throws
   * before the first word. Expo's WinterCG fetch is a real streaming client and
   * gives back a real `ReadableStream`.
   *
   * One client rather than two so there is a single transport to reason about;
   * the bearer token means nothing here depends on a cookie jar, which is the
   * usual reason to keep the platform one.
   */
  fetchImpl: expoFetch as unknown as typeof fetch,
});

/**
 * A refusal that is a price rather than a fault.
 *
 * The API answers **402** when a meter is spent and **429** when somebody is
 * simply going too fast, and the difference is the whole reason both statuses
 * exist: one is a paywall and the other is a retry. Collapsing them — which is
 * what a client that only reads `error.message` does — is how a plan limit ends
 * up looking like a bug in the app.
 *
 * The allowance rides along in the body on every 402 that has one, so the
 * screen can name the number without a second request. Parsed defensively: a
 * 402 from something that has not learned to send one is still a wall, and
 * falling back to the sentence the server wrote is a worse wall but a correct
 * one.
 */
export function planLimitOf(error: unknown): { allowance: Allowance | null; message: string } | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  const body = error.body as { allowance?: unknown } | undefined;
  const parsed = Allowance.safeParse(body?.allowance);
  return { allowance: parsed.success ? parsed.data : null, message: error.message };
}
