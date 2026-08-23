import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { query, queryOne } from '../src/db.ts';
import { env } from '../src/env.ts';
import { anonymousApp, createUser } from './helpers/factories.ts';
import { mailbox } from './helpers/email.ts';

/**
 * Signing in with Google, from the redirect out to the session that comes back.
 *
 * Google itself is a stubbed `fetch`: the one call this server makes to it is a
 * server-to-server POST, so everything interesting — the claims, the refusals,
 * the outage — is expressible as a response object, and nothing here needs a
 * network or a real client registration.
 */

const GOOGLE = {
  clientId: 'client-id.apps.googleusercontent.com',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};

const SUBJECT = '110000000000000000001';

let app: FastifyInstance;

beforeEach(async () => {
  env.google = { ...GOOGLE };
  app = await anonymousApp();
});

afterEach(async () => {
  await app.close();
  env.google = null;
  env.allowSignup = true;
  vi.restoreAllMocks();
});

// ---- Fixtures ---------------------------------------------------------------

function setCookie(response: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.find((c): c is string => typeof c === 'string' && c.startsWith(`${name}=`));
}

/** Just the `name=value` pair, ready to be sent back as a request header. */
function cookiePair(response: { headers: Record<string, unknown> }, name: string): string {
  const cookie = setCookie(response, name);
  if (!cookie) throw new Error(`No ${name} cookie was set`);
  return cookie.split(';')[0]!;
}

interface Handshake {
  state: string;
  nonce: string;
  verifier: string;
  timezone: string;
}

/** The first leg: what the browser is told to do, and what it is given to hold. */
async function begin(search = ''): Promise<{ cookie: string; handshake: Handshake; location: string }> {
  const response = await app.inject({ method: 'GET', url: `/auth/google/start${search}` });
  expect(response.statusCode).toBe(302);

  const pair = cookiePair(response, 'ct_oauth');
  const encoded = pair.slice('ct_oauth='.length);
  return {
    cookie: pair,
    handshake: JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    location: response.headers.location as string,
  };
}

/** An unsigned JWT. The server reads the claims and never checks a signature. */
function idToken(claims: Record<string, unknown>): string {
  const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${segment({ alg: 'RS256', typ: 'JWT' })}.${segment(claims)}.not-a-signature`;
}

function claimsFor(handshake: Handshake, overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: GOOGLE.clientId,
    sub: SUBJECT,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: handshake.nonce,
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada Lovelace',
    ...overrides,
  };
}

/** Google's token endpoint, for one call. */
function googleAnswers(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

/** The second leg, with whatever Google is pretending to have said. */
async function complete(
  handshake: Handshake,
  cookie: string,
  options: { code?: string; state?: string; error?: string; headers?: InjectOptions['headers'] } = {},
) {
  const params = new URLSearchParams();
  if (options.error) params.set('error', options.error);
  else params.set('code', options.code ?? 'auth-code');
  params.set('state', options.state ?? handshake.state);

  return app.inject({
    method: 'GET',
    url: `/auth/google/callback?${params.toString()}`,
    headers: { cookie, ...options.headers },
  });
}

/** The whole handshake, ending in whatever the callback replied. */
async function signIn(overrides: Record<string, unknown> = {}, startQuery = '') {
  const { handshake, cookie } = await begin(startQuery);
  googleAnswers({ id_token: idToken(claimsFor(handshake, overrides)) });
  return complete(handshake, cookie);
}

function redirectedTo(response: { statusCode: number; headers: Record<string, unknown> }): string {
  expect(response.statusCode).toBe(302);
  return String(response.headers.location);
}

// ---- Leaving -----------------------------------------------------------------

describe('GET /auth/google/start', () => {
  it('sends the browser to Google with everything the callback will check', async () => {
    const { handshake, location } = await begin();
    const url = new URL(location);

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(GOOGLE.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(GOOGLE.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    // Whichever account, deliberately asked for every time.
    expect(url.searchParams.get('prompt')).toBe('select_account');
    // The two secrets the browser carries back are the two it was sent with.
    expect(url.searchParams.get('state')).toBe(handshake.state);
    expect(url.searchParams.get('nonce')).toBe(handshake.nonce);
  });

  it('sends the PKCE challenge and keeps the verifier to itself', async () => {
    const { handshake, location } = await begin();
    const url = new URL(location);
    const { createHash } = await import('node:crypto');

    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(handshake.verifier).digest('base64url'),
    );
    expect(location).not.toContain(handshake.verifier);
  });

  it('parks the handshake in an httpOnly cookie that expires on its own', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/google/start' });
    const cookie = setCookie(response, 'ct_oauth')!;

    expect(cookie).toContain('HttpOnly');
    // Lax and not Strict: Google's callback is a cross-site navigation, and a
    // Strict cookie would be withheld on the one request that needs it.
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=600');
  });

  it('remembers the browser’s timezone for an account that does not exist yet', async () => {
    const { handshake } = await begin('?tz=America%2FLos_Angeles');
    expect(handshake.timezone).toBe('America/Los_Angeles');
  });

  it('is not there at all when the server has no Google client', async () => {
    env.google = null;
    const response = await app.inject({ method: 'GET', url: '/auth/google/start' });
    expect(response.statusCode).toBe(404);
  });
});

// ---- Coming back -------------------------------------------------------------

describe('GET /auth/google/callback', () => {
  it('creates an account, signs it in, and drops the visitor at the app', async () => {
    const response = await signIn({}, '?tz=America/Los_Angeles');

    expect(redirectedTo(response)).toBe(`${env.appUrl}/`);
    expect(setCookie(response, 'ct_session')).toContain('HttpOnly');

    const user = await queryOne<any>('SELECT * FROM users');
    expect(user).toMatchObject({
      email: 'ada@example.com',
      display_name: 'Ada Lovelace',
      timezone: 'America/Los_Angeles',
    });
    // No password at all, rather than an unguessable one: there is no door
    // here to try, which is the point of signing in with somebody else.
    expect(user.password_hash).toBeNull();
    // Google has already done what the six-digit code exists to do.
    expect(user.email_verified_at).not.toBeNull();
  });

  it('records the identity against the provider’s id, not the address', async () => {
    await signIn();
    const identity = await queryOne<any>('SELECT * FROM oauth_identities');
    expect(identity).toMatchObject({
      provider: 'google',
      subject: SUBJECT,
      email: 'ada@example.com',
    });
  });

  it('signs the same person back in without inventing a second account', async () => {
    await signIn();
    // The address on the Google account has changed in the meantime, which is
    // exactly the case keying on `sub` is there to survive.
    await signIn({ email: 'ada@newdomain.example', name: 'Ada L.' });

    expect(await countUsers()).toBe(1);
    const identity = await queryOne<any>('SELECT * FROM oauth_identities');
    // The email is followed along, but nothing was ever looked up by it.
    expect(identity.email).toBe('ada@newdomain.example');
    expect(identity.subject).toBe(SUBJECT);
  });

  it('links to an account that already proved the same address, password intact', async () => {
    const existing = await createUser({ email: 'ada@example.com' });
    const before = await passwordHashOf(existing.id);

    const response = await signIn();
    expect(redirectedTo(response)).toBe(`${env.appUrl}/`);
    expect(await countUsers()).toBe(1);

    const identity = await queryOne<{ user_id: string }>('SELECT user_id FROM oauth_identities');
    expect(identity!.user_id).toBe(existing.id);
    // Both ways in still work. Nobody asked to give up their password.
    expect(await passwordHashOf(existing.id)).toBe(before);
  });

  it('takes the password off an account that never proved the address', async () => {
    /*
     * The pre-hijack case: somebody registered with an address they do not own
     * and waited. Google's word beats an unanswered confirmation email, and the
     * password chosen by whoever was waiting has to stop working.
     */
    const squatter = await createUser({ email: 'ada@example.com', email_verified_at: null });
    const { createSession } = await import('../src/services/auth.ts');
    await createSession(squatter.id);

    const response = await signIn();

    expect(redirectedTo(response)).toBe(`${env.appUrl}/`);
    expect(await countUsers()).toBe(1);
    expect(await passwordHashOf(squatter.id)).toBeNull();
    // And the session they were sitting on is gone, or the reset was theatre.
    const sessions = await query('SELECT id FROM auth_sessions WHERE user_id = $1', [squatter.id]);
    expect(sessions).toHaveLength(1); // only the one just created for the visitor
  });

  it('refuses a state that does not match the cookie', async () => {
    const { handshake, cookie } = await begin();
    const fetchSpy = googleAnswers({ id_token: idToken(claimsFor(handshake)) });

    const response = await complete(handshake, cookie, { state: 'somebody-elses-state' });

    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=state`);
    expect(setCookie(response, 'ct_session')).toBeUndefined();
    // Refused before a single byte went to Google.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a callback with no handshake behind it', async () => {
    const { handshake } = await begin();
    const response = await complete(handshake, 'unrelated=1');
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=expired`);
  });

  it('treats an unreadable handshake cookie as no handshake at all', async () => {
    const { handshake } = await begin();
    const response = await complete(handshake, 'ct_oauth=not-base64-json');
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=expired`);
  });

  it('spends the handshake cookie whether or not it worked', async () => {
    const { handshake, cookie } = await begin();
    googleAnswers({ id_token: idToken(claimsFor(handshake)) });

    const response = await complete(handshake, cookie);
    expect(setCookie(response, 'ct_oauth')).toContain('Max-Age=0');
  });

  it('says nothing about someone pressing cancel', async () => {
    const { handshake, cookie } = await begin();
    const response = await complete(handshake, cookie, { error: 'access_denied' });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=cancelled`);
  });

  it('reports Google’s other refusals as a failure', async () => {
    const { handshake, cookie } = await begin();
    const response = await complete(handshake, cookie, { error: 'server_error' });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('refuses a callback carrying no code', async () => {
    const { handshake, cookie } = await begin();
    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?state=${encodeURIComponent(handshake.state)}`,
      headers: { cookie },
    });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is not there at all when the server has no Google client', async () => {
    env.google = null;
    const response = await app.inject({ method: 'GET', url: '/auth/google/callback?code=x&state=y' });
    expect(response.statusCode).toBe(404);
  });
});

// ---- What Google said --------------------------------------------------------

describe('the identity token', () => {
  it('is refused when it was issued for somebody else’s client', async () => {
    // The claim that stops a token minted for an application the attacker
    // registered five minutes ago being accepted as proof of anything here.
    const response = await signIn({ aud: 'someone-elses-client.apps.googleusercontent.com' });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
    expect(await countUsers()).toBe(0);
  });

  it('is refused when it belongs to a different sign-in', async () => {
    const response = await signIn({ nonce: 'a-nonce-from-another-attempt' });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when it has expired', async () => {
    const response = await signIn({ exp: Math.floor(Date.now() / 1000) - 1 });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when the issuer is not Google', async () => {
    const response = await signIn({ iss: 'https://accounts.example.com' });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when it names nobody', async () => {
    const response = await signIn({ sub: '' });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when it carries no address', async () => {
    const response = await signIn({ email: undefined });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused, and said so, when Google has not confirmed the address', async () => {
    // A distinct reason because it is the one the person can do something
    // about, and doing nothing about it still leaves the password form.
    const response = await signIn({ email_verified: false });
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=google_unverified`);
    expect(await countUsers()).toBe(0);
  });

  it('is refused when it is not a JWT', async () => {
    const { handshake, cookie } = await begin();
    googleAnswers({ id_token: 'not-a-jwt' });
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when its payload is not JSON', async () => {
    const { handshake, cookie } = await begin();
    googleAnswers({ id_token: 'header.bm90LWpzb24.signature' });
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when its payload is not an object', async () => {
    const { handshake, cookie } = await begin();
    const segment = Buffer.from(JSON.stringify('a string')).toString('base64url');
    googleAnswers({ id_token: `header.${segment}.signature` });
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });

  it('is refused when Google returns none', async () => {
    const { handshake, cookie } = await begin();
    googleAnswers({ access_token: 'no-id-token-here' });
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });
});

describe('the token exchange', () => {
  it('sends the code, the secret and the PKCE verifier', async () => {
    const { handshake, cookie } = await begin();
    const fetchSpy = googleAnswers({ id_token: idToken(claimsFor(handshake)) });

    await complete(handshake, cookie, { code: 'the-code' });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const sent = new URLSearchParams(String(init!.body));
    expect(Object.fromEntries(sent)).toEqual({
      code: 'the-code',
      client_id: GOOGLE.clientId,
      client_secret: GOOGLE.clientSecret,
      redirect_uri: GOOGLE.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: handshake.verifier,
    });
  });

  it('sends the visitor back with a reason when Google refuses the code', async () => {
    const { handshake, cookie } = await begin();
    googleAnswers({ error: 'invalid_grant' }, 400);
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });

  it('sends the visitor back with a reason when Google cannot be reached', async () => {
    const { handshake, cookie } = await begin();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });

  it('sends the visitor back with a reason when the reply is not JSON', async () => {
    const { handshake, cookie } = await begin();
    googleAnswers('<html>proxy error</html>');
    expect(redirectedTo(await complete(handshake, cookie))).toBe(`${env.appUrl}/login?error=google`);
  });
});

// ---- The same door policy as the password form -------------------------------

describe('who is let in', () => {
  it('will not open a new account on a server that has closed sign-ups', async () => {
    await createUser({ email: 'someone@example.com' });
    env.allowSignup = false;

    const response = await signIn();

    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=closed`);
    expect(await countUsers()).toBe(1);
  });

  it('still lets the very first account in on a closed server, or it is unusable', async () => {
    env.allowSignup = false;
    const response = await signIn();
    expect(redirectedTo(response)).toBe(`${env.appUrl}/`);
  });

  it('turns a suspended account away without a session', async () => {
    const existing = await createUser({ email: 'ada@example.com' });
    await query('UPDATE users SET disabled_at = now() WHERE id = $1', [existing.id]);

    const response = await signIn();

    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=suspended`);
    expect(setCookie(response, 'ct_session')).toBeUndefined();
  });
});

// ---- The same handshake, ending in an app -----------------------------------

/**
 * The native flow, which differs from the browser one at exactly two points:
 * there is no cookie (the handshake rides in a signed `state`, because the two
 * legs land on two different origins) and there is no session at the end (an
 * app gets a one-time code to spend from a request of its own).
 *
 * Everything in between — the claims, the account resolution, the linking — is
 * the same code, so it is not retested here.
 */
describe('the native flow', () => {
  const REDIRECT = 'daysofar://auth/google';
  const VERIFIER = 'a'.repeat(64);

  /** The app's half: SHA-256 of a secret it does not send. */
  async function challenge(verifier = VERIFIER): Promise<string> {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(verifier).digest('base64url');
  }

  async function beginNative(
    overrides: { redirect?: string; challenge?: string } = {},
  ): Promise<{ state: string; nonce: string; verifier: string; response: any }> {
    const params = new URLSearchParams({
      redirect: overrides.redirect ?? REDIRECT,
      challenge: overrides.challenge ?? (await challenge()),
    });
    const response = await app.inject({ method: 'GET', url: `/auth/google/start?${params}` });
    if (response.statusCode !== 302) return { state: '', nonce: '', verifier: '', response };

    const url = new URL(String(response.headers.location));
    const state = url.searchParams.get('state')!;
    const payload = JSON.parse(
      Buffer.from(state.split('.')[0]!, 'base64url').toString('utf8'),
    );
    return { state, nonce: payload.nonce, verifier: payload.verifier, response };
  }

  /** The whole thing, up to the code in the app's redirect. */
  async function codeFromSignIn(overrides: Record<string, unknown> = {}): Promise<string> {
    const { state, nonce, verifier } = await beginNative();
    googleAnswers({
      id_token: idToken(claimsFor({ state, nonce, verifier, timezone: '' }, overrides)),
    });
    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    });
    const back = new URL(redirectedTo(response));
    return back.searchParams.get('code')!;
  }

  it('carries the handshake in a signed state instead of a cookie', async () => {
    const { state, response } = await beginNative();

    // No cookie, because the callback arrives at the *web* origin in every
    // deployment with a proxy in front and would never be sent one set here.
    expect(setCookie(response, 'ct_oauth')).toBeUndefined();
    expect(state).toContain('.');
    expect(String(response.headers.location)).toContain('accounts.google.com');
  });

  it('refuses to hand a sign-in back to a web address', async () => {
    /*
     * The attack this closes: a start URL naming the attacker's own challenge
     * and their own https redirect, walked through by a signed-in victim, ends
     * with a code the attacker can spend. `redirect` is the one field here
     * somebody else would most like to write.
     */
    const { response } = await beginNative({ redirect: 'https://evil.example/callback' });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a scheme this deployment has not allowed', async () => {
    const { response } = await beginNative({ redirect: 'someotherapp://auth/google' });
    expect(response.statusCode).toBe(400);
  });

  it('refuses half a native sign-in, rather than quietly running a browser one', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/start?redirect=${encodeURIComponent(REDIRECT)}`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('ends at the app with a code, and hands out no session on the way', async () => {
    const { state, nonce, verifier } = await beginNative();
    googleAnswers({ id_token: idToken(claimsFor({ state, nonce, verifier, timezone: '' })) });

    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    });

    const back = new URL(redirectedTo(response));
    expect(`${back.protocol}//${back.host}${back.pathname}`).toBe(REDIRECT);
    expect(back.searchParams.get('code')).toBeTruthy();
    // The browser that ran the handshake is not the client that will hold the
    // session, so it is given nothing.
    expect(setCookie(response, 'ct_session')).toBeUndefined();
  });

  it('tells the app when the handshake failed, in the app’s own vocabulary', async () => {
    const { state } = await beginNative();
    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    });

    const back = new URL(redirectedTo(response));
    expect(`${back.protocol}//${back.host}${back.pathname}`).toBe(REDIRECT);
    expect(back.searchParams.get('error')).toBe('cancelled');
  });

  it('treats a tampered state as a callback nobody started', async () => {
    const { state } = await beginNative();
    // One byte of the payload, with the signature left alone.
    const [payload, signature] = state.split('.');
    const forged = `${payload!.slice(0, -1)}A.${signature}`;

    const response = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=auth-code&state=${encodeURIComponent(forged)}`,
    });

    // Back to the *web* login, not to an app: an unreadable state names no
    // redirect, so there is nowhere else this could go.
    expect(redirectedTo(response)).toBe(`${env.appUrl}/login?error=expired`);
  });

  it('spends the code for a session, and only for a client that carries one', async () => {
    const code = await codeFromSignIn();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      headers: { 'x-session-transport': 'bearer' },
      payload: { code, verifier: VERIFIER },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.authenticated).toBe(true);
    expect(body.profile.email).toBe('ada@example.com');
    expect(body.token).toBeTruthy();

    // And the token is a real session, not a value echoed back.
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(me.json().authenticated).toBe(true);
  });

  it('will not spend the same code twice', async () => {
    const code = await codeFromSignIn();
    const spend = () =>
      app.inject({
        method: 'POST',
        url: '/auth/google/exchange',
        headers: { 'x-session-transport': 'bearer' },
        payload: { code, verifier: VERIFIER },
      });

    expect((await spend()).statusCode).toBe(200);
    expect((await spend()).statusCode).toBe(401);
  });

  it('is useless to whoever intercepted only the code', async () => {
    /*
     * The whole reason the redirect is safe to end a sign-in on. Another app
     * that has claimed the scheme on Android receives this code — and cannot
     * do anything with it, because the verifier never left the device that
     * started the handshake.
     */
    const code = await codeFromSignIn();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      headers: { 'x-session-transport': 'bearer' },
      payload: { code, verifier: 'b'.repeat(64) },
    });

    expect(response.statusCode).toBe(401);
  });

  it('withholds the raw token from a caller that did not ask to carry one', async () => {
    const code = await codeFromSignIn();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      payload: { code, verifier: VERIFIER },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().token).toBeUndefined();
    // It got a cookie instead, like every other browser client here.
    expect(setCookie(response, 'ct_session')).toContain('HttpOnly');
  });

  it('turns a suspended account away at the exchange, not only at the callback', async () => {
    const code = await codeFromSignIn();
    await query("UPDATE users SET disabled_at = now() WHERE email = 'ada@example.com'");

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google/exchange',
      headers: { 'x-session-transport': 'bearer' },
      payload: { code, verifier: VERIFIER },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('the sign-in alert', () => {
  it('is not sent to somebody whose account was created a moment ago', async () => {
    await signIn();
    expect(mailbox()).toHaveLength(0);
  });

  it('is sent when a known account is reached from a client it has not seen', async () => {
    await signIn();
    await signIn({}, '');

    const { handshake, cookie } = await begin();
    googleAnswers({ id_token: idToken(claimsFor(handshake)) });
    await complete(handshake, cookie, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' } });

    expect(mailbox()).toHaveLength(1);
    expect(mailbox()[0]!.to).toBe('ada@example.com');
  });
});

describe('GET /auth/me', () => {
  it('says whether the button should be offered at all', async () => {
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).json().google_enabled).toBe(true);

    env.google = null;
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).json().google_enabled).toBe(false);
  });
});

// ---- Helpers ----------------------------------------------------------------

async function countUsers(): Promise<number> {
  const row = await queryOne<{ n: string }>('SELECT count(*) AS n FROM users');
  return Number(row!.n);
}

async function passwordHashOf(userId: string): Promise<string | null> {
  const row = await queryOne<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  return row!.password_hash;
}
