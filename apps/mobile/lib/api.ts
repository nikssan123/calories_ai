import Constants from 'expo-constants';
import { createApiClient } from '@ct/api-client';
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
});
