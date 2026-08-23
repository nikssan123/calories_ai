import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { AuthStatus } from '@ct/shared';
import { api } from '@/lib/api';

/**
 * "Continue with Google", on a phone.
 *
 * The web does this with three full-page navigations and a cookie, none of
 * which an app has: there is no page to navigate, and the browser that shows
 * Google's consent screen is not this process and cannot hand a cookie to it.
 * So the shape is different even though the server-side handshake is the same
 * one. The app makes a secret, opens the system's auth browser at the API's
 * `start`, and gets back a one-time code through its own URL scheme — which it
 * then spends, from a request of its own, for the session token it keeps.
 *
 * The secret is why the code being visible in that redirect is survivable. It
 * is generated here, hashed, and only the hash is sent; on Android, where
 * another installed app can claim a custom scheme and receive the redirect,
 * what it would receive is half of a pair. This is PKCE, and it is doing the
 * same job for the app that PKCE does for this server against Google.
 */

/**
 * The API's `?error=` vocabulary, in sentences.
 *
 * The same table as `apps/web/app/login/page.tsx`, and it lives on the client
 * for the same reason it does there: the copy belongs with the copy. Here there
 * is a second reason — a message assembled on the server would be the one
 * string in the app that cannot be changed without a release to two stores.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  google: 'Google could not sign you in. Try again, or use your email and password.',
  google_unverified:
    'Google has not confirmed the address on that account, so it cannot be used to sign in here.',
  expired: 'That sign-in took too long. Start it again.',
  state: 'That sign-in could not be verified. Start it again.',
  closed: 'Sign-ups are closed on this server.',
  suspended: 'This account has been suspended.',
};

/**
 * 256 bits, hex.
 *
 * Hex rather than base64url only because there is nothing in React Native that
 * turns bytes into base64 without pulling in a library — and it costs nothing,
 * since the server never looks inside this. It hashes it and compares.
 */
function makeVerifier(): string {
  return Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/** SHA-256, base64url — what `challengeFor` computes on the other side. */
async function challengeFor(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  // `expo-crypto` has no base64url encoding, and the difference is three
  // characters. Getting it wrong would mean a challenge that never matches and
  // an exchange that always says "that sign-in expired".
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Runs the whole handshake. Resolves with the new session, or with null when
 * the person closed the browser without finishing.
 *
 * Cancelling is not an error and must not be reported as one: swiping the
 * consent screen away is a decision, and answering it with a red sentence about
 * something having gone wrong is the app arguing with a choice that was made on
 * purpose. Everything else throws with something worth reading.
 */
export async function signInWithGoogle(): Promise<AuthStatus | null> {
  const verifier = makeVerifier();
  /*
   * `createURL` rather than a hard-coded `daysofar://`, because under Expo Go
   * the app is not reachable at its own scheme at all — it is a screen inside
   * another app, addressed as `exp://<packager>/--/…`. The API keeps a list of
   * prefixes it will hand a code back to; the app scheme is always on it and
   * `exp://` is opt-in per deployment, which is what stops this being an open
   * redirect that hands out sign-ins.
   */
  const redirect = Linking.createURL('auth/google');

  const url = api.googleStartUrl({
    redirect,
    challenge: await challengeFor(verifier),
    // Sent for the reason the sign-up form sends one: if this turns out to be a
    // new account, its first day should already break in the right place rather
    // than at UTC midnight until somebody notices.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  /*
   * `openAuthSessionAsync`, not `openBrowserAsync`.
   *
   * It is the platform's own sign-in browser — ASWebAuthenticationSession on
   * iOS, a Custom Tab on Android — and the difference that matters is that the
   * OS returns the redirect to *this* app rather than merely navigating to it.
   * On iOS that is a guarantee no other app can intercept, which is most of why
   * a custom scheme is safe to end a sign-in on.
   */
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  if (result.type !== 'success') return null;

  const { queryParams } = Linking.parse(result.url);
  const failure = typeof queryParams?.error === 'string' ? queryParams.error : null;
  if (failure) {
    // `cancelled` comes back when someone pressed Cancel on Google's own
    // screen, which is the same decision as closing the browser and gets the
    // same silence.
    if (failure === 'cancelled') return null;
    throw new Error(SIGN_IN_ERRORS[failure] ?? SIGN_IN_ERRORS.google);
  }

  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) throw new Error(SIGN_IN_ERRORS.google);

  return api.exchangeGoogle({ code, verifier });
}
