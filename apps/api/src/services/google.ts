import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
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
