import type { NativeIntent } from 'expo-router';

/**
 * What the router should do with a URL the OS hands this app.
 *
 * Exactly one arrives in normal use, and it is not a screen. The Google
 * handshake ends by redirecting to `auth/google`, and the thing waiting for it
 * is `lib/google.ts` — `openAuthSessionAsync` resolves with that URL on the
 * auth session's own channel and spends the code from there. The router is
 * handed the same URL a moment later, finds no route by that name, and renders
 * "Unmatched Route — page could not be found" over a sign-in that in fact
 * worked. There is no screen at that address and there should not be one: a
 * stub route would exist only to bounce off itself.
 *
 * So it is dropped. Returning null leaves the app exactly where it is, and the
 * sign-in is untouched — `expo-web-browser` listens for the redirect itself and
 * never sees this function.
 */

/**
 * `daysofar://auth/google?code=…` in a build. Under Expo Go it is a bare
 * `/auth/google?code=…`, the packager's `exp://…/--/` prefix already stripped,
 * which is why this matches the path rather than anchoring on a scheme.
 */
const GOOGLE_CALLBACK = /(^|\/)auth\/google(\?|$)/;

export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({ path }) => {
  /*
   * `initial` is not consulted, though it is the one case where dropping this
   * loses something: an app killed while the consent screen was open is
   * cold-started by the redirect, and the auth session that would have spent
   * the code died with the process. The code is unspendable either way. Landing
   * on the sign-in screen is the honest end to that, and one tap from another.
   */
  return GOOGLE_CALLBACK.test(path) ? null : path;
};
