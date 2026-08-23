import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleEnv } from '../env.ts';

/**
 * The Google half of "continue with Google": building the URL a person is sent
 * to, and turning the code they come back with into a name and an address.
 *
 * Everything here is transport. Deciding *which account* the answer belongs to
 * is `services/identities.ts`, and the split is worth keeping: this file is the
 * one that would be copied to add Apple or GitHub, and that one is the one that
 * must not be.
 *
 * The flow is the authorization code flow with PKCE. PKCE is not strictly
 * required for a server-side client that holds a secret, but it costs one hash
 * and closes the case where the code is intercepted in the redirect — a query
 * string that passes through a browser, its history, and possibly a referrer.
 */

export const GOOGLE_PROVIDER = 'google';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/**
 * `openid email profile` and nothing else.
 *
 * This is a sign-in button, not an integration: the product wants to know who
 * someone is and what to call them, and asking for a scope beyond that would
 * put a consent screen full of alarming sentences in front of a person who
 * only wanted to avoid inventing another password.
 */
const SCOPE = 'openid email profile';

/** Why a handshake could not be completed, in a form a redirect can carry. */
export type GoogleFailure = 'exchange_failed' | 'bad_token' | 'unverified_email';

export class GoogleAuthError extends Error {
  constructor(
    readonly code: GoogleFailure,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/**
 * The three secrets a single sign-in attempt is built on, minted before the
 * browser leaves and checked when it comes back.
 *
 * `state` proves the callback belongs to a handshake this server started, which
 * is what stops a stranger's authorization code being fed to a signed-out
 * visitor's browser. `verifier` is PKCE. `nonce` binds the identity token to
 * this same attempt, so a token minted for some other session cannot be
 * replayed into this one.
 */
export interface Handshake {
  state: string;
  verifier: string;
  nonce: string;
}

export function beginHandshake(): Handshake {
  return {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
  };
}

/** Constant time, because `state` is a secret being compared against a guess. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Lengths must match before timingSafeEqual, which throws otherwise. The
  // length itself is not a secret — the value is.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeUrl(google: GoogleEnv, handshake: Handshake): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state: handshake.state,
    nonce: handshake.nonce,
    code_challenge: challengeFor(handshake.verifier),
    code_challenge_method: 'S256',
    /**
     * Always ask which account, rather than silently reusing whichever one the
     * browser is already signed into. Households share laptops, and a sign-in
     * button that quietly picks a Google account is one that quietly picks the
     * wrong person's food diary.
     */
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/**
 * PKCE's S256 transform, and the app's too.
 *
 * Exported because the native flow runs the same trick one layer up: the phone
 * makes a verifier, sends only this, and proves itself later by producing the
 * original. One implementation, so the two can never disagree about the
 * encoding — and base64url rather than hex is not a detail, it is what every
 * PKCE client on the other side of this will compute.
 */
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ---- The native handshake --------------------------------------------------

/**
 * The same half-finished handshake the browser parks in a cookie, carried in
 * `state` instead.
 *
 * A cookie cannot do this job for an app. The handshake is set by a request to
 * *this* API and read by a request to the callback, which is the web app's
 * origin in every deployment with a proxy in front — `api.daysofar.com` sets it
 * and `daysofar.com` is asked for it back, so the browser correctly declines
 * and every sign-in fails its own state check. `state` has no such problem:
 * Google hands it back verbatim to whoever it redirects to.
 *
 * Which means it is a secret travelling through somebody else's servers and
 * back through a URL bar, so it is signed. Without that, `redirect` would be a
 * field an attacker could write — craft a start URL naming their own challenge
 * and their own redirect, get a victim to walk through it, and collect a code
 * they can spend. The signature is what makes this blob something only
 * `/auth/google/start` can have minted, which is the whole reason that route
 * validates the redirect before signing.
 */
export interface NativeHandshake {
  verifier: string;
  nonce: string;
  /** The device's timezone, so a new account's first day starts in the right place. */
  timezone: string;
  /** SHA-256 of the verifier the app kept. Binds the handoff code to that app. */
  challenge: string;
  /** The app's own URL scheme, validated at `start` and trusted here. */
  redirect: string;
  /** Milliseconds since the epoch. Ten minutes, as the cookie has. */
  expires: number;
}

/**
 * Keyed on the client secret rather than on a key of its own.
 *
 * It is a server-held secret with exactly the right lifetime — this flow does
 * not exist without it, and rotating it invalidates half-finished sign-ins,
 * which is correct — and adding a second one would mean a deployment that
 * configured Google but forgot the new variable, where the failure is a signing
 * key that is the empty string.
 */
function sign(google: GoogleEnv, payload: string): string {
  return createHmac('sha256', google.clientSecret).update(payload).digest('base64url');
}

export function packNativeState(google: GoogleEnv, value: NativeHandshake): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${payload}.${sign(google, payload)}`;
}

/**
 * Unpacks a `state`, or returns null.
 *
 * Null for a browser's random state as much as for a forged one: the callback
 * serves both flows and tells them apart by asking this first, so "not a native
 * handshake" has to be an ordinary answer rather than an error.
 */
export function readNativeState(google: GoogleEnv, raw: string): NativeHandshake | null {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  // Constant time, because the comparison is against a guess at a MAC.
  if (!sameSecret(signature, sign(google, payload))) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const { verifier, nonce, timezone, challenge, redirect, expires } = (parsed ??
      {}) as Record<string, unknown>;
    if (
      typeof verifier !== 'string' ||
      typeof nonce !== 'string' ||
      typeof challenge !== 'string' ||
      typeof redirect !== 'string' ||
      typeof expires !== 'number'
    ) {
      return null;
    }
    // Checked after the signature, so an expired handshake and a forged one are
    // the same answer to anyone probing.
    if (expires <= Date.now()) return null;
    return {
      verifier,
      nonce,
      timezone: typeof timezone === 'string' ? timezone : '',
      challenge,
      redirect,
      expires,
    };
  } catch {
    return null;
  }
}

/** Who Google says this is. */
export interface GoogleProfile {
  /** Google's immutable id for the account. The thing worth storing. */
  subject: string;
  email: string;
  name: string | null;
}

/**
 * Spends the authorization code and returns the person behind it.
 *
 * The identity token's signature is deliberately not verified, and that is not
 * a shortcut so much as the one case where verification adds nothing: this is a
 * direct, server-to-server TLS call to Google's own token endpoint, so the
 * channel already establishes who sent the token. Google document exactly this.
 * The *claims* still have to be checked — a valid token issued to somebody
 * else's client is a real attack, and `aud` is what closes it.
 */
export async function exchangeCode(
  google: GoogleEnv,
  code: string,
  handshake: Pick<Handshake, 'verifier' | 'nonce'>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<GoogleProfile> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: google.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: handshake.verifier,
      }).toString(),
    });
  } catch (error) {
    throw new GoogleAuthError('exchange_failed', `Could not reach Google: ${String(error)}`);
  }

  if (!response.ok) {
    // The body carries Google's own `error_description`, which is worth having
    // in the log and worth keeping out of the browser: it describes our client
    // registration, not anything the person at the keyboard can act on.
    throw new GoogleAuthError(
      'exchange_failed',
      `Google refused the code (${response.status}): ${(await response.text()).slice(0, 500)}`,
    );
  }

  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (typeof body?.id_token !== 'string') {
    throw new GoogleAuthError('bad_token', 'Google returned no identity token.');
  }

  return profileFrom(claimsFrom(body.id_token), google, handshake.nonce);
}

interface Claims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

/** The middle segment of the JWT, decoded. See `exchangeCode` on the signature. */
function claimsFrom(idToken: string): Claims {
  const payload = idToken.split('.')[1];
  if (!payload) throw new GoogleAuthError('bad_token', 'Identity token is not a JWT.');

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object') throw new Error('not an object');
    return claims as Claims;
  } catch {
    throw new GoogleAuthError('bad_token', 'Identity token payload is not readable JSON.');
  }
}

function profileFrom(claims: Claims, google: GoogleEnv, nonce: string): GoogleProfile {
  if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) {
    throw new GoogleAuthError('bad_token', `Identity token from an unexpected issuer.`);
  }
  /**
   * The claim that matters most. Without it, a token Google minted for any
   * other application — one the attacker registered themselves, five minutes
   * ago — would be accepted here as proof of whoever signed into it.
   */
  if (claims.aud !== google.clientId) {
    throw new GoogleAuthError('bad_token', 'Identity token was issued for another client.');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw new GoogleAuthError('bad_token', 'Identity token has expired.');
  }
  if (typeof claims.nonce !== 'string' || !sameSecret(claims.nonce, nonce)) {
    throw new GoogleAuthError('bad_token', 'Identity token belongs to a different sign-in.');
  }
  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new GoogleAuthError('bad_token', 'Identity token names no subject.');
  }
  if (typeof claims.email !== 'string' || !claims.email) {
    throw new GoogleAuthError('bad_token', 'Identity token carries no email address.');
  }
  /**
   * An unproved address is refused rather than accepted-and-flagged, because
   * the address is precisely what an existing account is matched on further
   * down. A Workspace domain can be configured to leave this false; the cost of
   * refusing is that a handful of such accounts sign in with a password
   * instead, and the cost of trusting it is somebody else's food diary.
   */
  if (claims.email_verified !== true) {
    throw new GoogleAuthError(
      'unverified_email',
      'Google has not confirmed that address belongs to this account.',
    );
  }

  return {
    subject: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : null,
  };
}
