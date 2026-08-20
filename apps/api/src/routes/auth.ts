import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  Credentials,
  EmailVerification,
  PasswordReset,
  PasswordResetRequest,
  SESSION_TRANSPORT_HEADER,
  SignupRequest,
} from '@ct/shared';
import { env } from '../env.ts';
import {
  sendNewSignInEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../email/notify.ts';
import {
  bearerToken,
  createSession,
  destroyAllSessions,
  destroySession,
  SESSION_COOKIE,
} from '../services/auth.ts';
import { rememberDevice } from '../services/devices.ts';
import {
  authorizeUrl,
  beginHandshake,
  exchangeCode,
  GOOGLE_PROVIDER,
  GoogleAuthError,
  sameSecret,
  type Handshake,
} from '../services/google.ts';
import { signInWithProvider } from '../services/identities.ts';
import { consumeCode, consumeToken } from '../services/tokens.ts';
import {
  authenticate,
  countAccounts,
  createAccount,
  emailInUse,
  getUser,
  markEmailVerified,
  setPassword,
} from '../services/user.ts';
import { isAdmin, isDisabled } from '../services/admin.ts';

/**
 * Password endpoints are the one place an anonymous caller can burn CPU on this
 * server (scrypt, deliberately) and the one place guessing pays. Both are keyed
 * by IP, since by definition there is no session yet.
 */
const LOGIN_LIMIT = { max: 10, timeWindow: '15 minutes' };
const SIGNUP_LIMIT = { max: 5, timeWindow: '1 hour' };

/**
 * Anything that puts a link in somebody else's mailbox.
 *
 * The ceiling is lower than login's, and it is protecting a different thing:
 * not this server, but the address on the other end. Without it, `/auth/password/forgot`
 * is a machine for mailing a stranger fifty reset links over someone else's
 * sending domain — which costs them the domain's reputation and costs us
 * nothing, the definition of an abusable endpoint.
 */
const EMAIL_LIMIT = { max: 5, timeWindow: '1 hour' };

/**
 * Spending a token is not free either: it is a database write keyed on a value
 * the caller supplies, and the whole security property is that guessing does
 * not pay. 256 bits is not brute-forceable, but there is no reason to let
 * anyone try at speed.
 */
const TOKEN_LIMIT = { max: 20, timeWindow: '1 hour' };

/**
 * The Google handshake. Both ends of it are anonymous GETs that a browser walks
 * into by following a redirect, so the ceiling is generous — a person who
 * changes their mind twice and starts again should never meet it — but the
 * callback spends a request against Google's token endpoint, and an endpoint
 * that makes an outbound call on an anonymous caller's say-so needs a lid.
 */
const OAUTH_LIMIT = { max: 30, timeWindow: '15 minutes' };

/**
 * Signup is open by default so the first account can be created, and can be
 * closed with ALLOW_SIGNUP=false once you've made yours.
 */
async function signupAllowed(): Promise<boolean> {
  if (env.allowSignup) return true;
  // Always permit the very first account, or the deployment is unusable.
  return (await countAccounts()) === 0;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.secureCookies,
    path: '/',
    expires: expiresAt,
  });
}

/**
 * The raw token, but only for a client that asked to carry it itself. A browser
 * gets `undefined` and keeps using the httpOnly cookie set alongside it, which
 * is the whole point: a token this endpoint returned in JSON is a token the
 * page's own scripts — and anything injected into them — can read.
 */
function tokenForBody(request: FastifyRequest, token: string): string | undefined {
  return request.headers[SESSION_TRANSPORT_HEADER] === 'bearer' ? token : undefined;
}

/** The session this request is authenticating with, whichever way it arrived. */
function requestToken(request: FastifyRequest): string | undefined {
  return bearerToken(request.headers.authorization) ?? request.cookies[SESSION_COOKIE];
}

const NO_GOOGLE = 'Google sign-in is not configured on this server.';

/**
 * The half-finished handshake, parked in the browser between the two halves of
 * the flow.
 *
 * A cookie rather than a row, because the whole of it is worthless the moment
 * the browser loses it: there is nothing to clean up, nothing to expire on a
 * schedule, and an abandoned sign-in leaves no trace in the database. httpOnly,
 * so the page's own scripts cannot read the state they would need to forge a
 * callback.
 */
const OAUTH_COOKIE = 'ct_oauth';

/**
 * Ten minutes. Long enough to find the right Google account, type a password
 * and answer a second factor; short enough that a laptop left open in a café
 * does not still hold a live half-handshake at closing time.
 */
const HANDSHAKE_MINUTES = 10;

interface StoredHandshake extends Handshake {
  /** The browser's timezone, if it sent one. Empty means "we never asked". */
  timezone: string;
}

function packHandshake(value: StoredHandshake): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Anything unreadable is treated as absent rather than as an error. A truncated
 * cookie, one left over from an older version of this format, or one somebody
 * typed in by hand all mean the same thing to the caller — start again — and
 * distinguishing them would only produce a message nobody can act on.
 */
function readHandshake(request: FastifyRequest): StoredHandshake | null {
  const raw = request.cookies[OAUTH_COOKIE];
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const { state, verifier, nonce, timezone } = (parsed ?? {}) as Record<string, unknown>;
    if (typeof state !== 'string' || typeof verifier !== 'string' || typeof nonce !== 'string') {
      return null;
    }
    return { state, verifier, nonce, timezone: typeof timezone === 'string' ? timezone : '' };
  } catch {
    return null;
  }
}

/**
 * Back to the sign-in screen with a word for what happened, which the page
 * turns into a sentence. A code rather than the sentence itself: the copy
 * belongs with the rest of the copy, and a message assembled here would be the
 * one string in the product that cannot be changed without a deploy of the API.
 */
function backToLogin(reply: FastifyReply, reason: string) {
  return reply.redirect(`${env.appUrl}/login?error=${encodeURIComponent(reason)}`);
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/auth/me', async (request) => {
    const userId = request.userId;
    return {
      authenticated: userId !== null,
      profile: userId ? await getUser(userId) : null,
      signup_allowed: await signupAllowed(),
      has_accounts: (await countAccounts()) > 0,
      // Carried on the session status so the app can decide whether to render
      // the admin link without a second round trip on every page.
      is_admin: userId ? await isAdmin(userId) : false,
      google_enabled: env.google !== null,
    };
  });

  app.post('/auth/signup', { config: { rateLimit: SIGNUP_LIMIT } }, async (request, reply) => {
    const parsed = SignupRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Invalid details' });
    }
    if (!(await signupAllowed())) {
      return reply.status(403).send({ error: 'Sign-ups are closed on this server.' });
    }
    if (await emailInUse(parsed.data.email)) {
      return reply.status(409).send({ error: 'That email is already registered.' });
    }

    const userId = await createAccount(
      parsed.data.email,
      parsed.data.password,
      parsed.data.display_name ?? null,
      parsed.data.timezone ?? '',
    );
    const { token, expiresAt } = await createSession(userId);
    setSessionCookie(reply, token, expiresAt);

    // Recorded, but not reported: the device someone signs up on is by
    // definition the first one, and "we noticed you signing in" as the opening
    // message of a new account is absurd. It is remembered here so the *second*
    // device is the one that raises an alert.
    await rememberDevice(userId, request.headers['user-agent'], request.ip);
    // Awaited rather than fired off, so a provider outage shows up in the log
    // beside the signup that caused it. `sendVerificationEmail` cannot throw.
    await sendVerificationEmail(userId, request.log);

    return {
      authenticated: true,
      profile: await getUser(userId),
      signup_allowed: false,
      has_accounts: true,
      is_admin: await isAdmin(userId),
      google_enabled: env.google !== null,
      token: tokenForBody(request, token),
    };
  });

  app.post('/auth/login', { config: { rateLimit: LOGIN_LIMIT } }, async (request, reply) => {
    const parsed = Credentials.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Enter an email and password.' });
    }

    const userId = await authenticate(parsed.data.email, parsed.data.password);
    // Deliberately identical for unknown email and wrong password.
    if (!userId) return reply.status(401).send({ error: 'Incorrect email or password.' });

    // Checked after the password, so this reveals nothing to someone guessing.
    // Without it a suspended user would sign in successfully and then get a 401
    // on every subsequent request, which looks like a broken server.
    if (await isDisabled(userId)) {
      return reply.status(403).send({ error: 'This account has been suspended.' });
    }

    const { token, expiresAt } = await createSession(userId);
    setSessionCookie(reply, token, expiresAt);

    /*
     * The one email nobody asked for, and the one worth sending.
     *
     * A stolen password is silent by design — the whole point is that the owner
     * carries on as normal — and this is the only moment at which the product
     * knows something they do not. It fires only for a client this account has
     * not been seen using before, which is what keeps it meaningful.
     */
    const device = await rememberDevice(userId, request.headers['user-agent'], request.ip);
    if (device.isNew) {
      await sendNewSignInEmail(
        userId,
        { device: device.label, ip: request.ip, at: new Date() },
        request.log,
      );
    }

    return {
      authenticated: true,
      profile: await getUser(userId),
      signup_allowed: false,
      has_accounts: true,
      is_admin: await isAdmin(userId),
      google_enabled: env.google !== null,
      token: tokenForBody(request, token),
    };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = requestToken(request);
    if (token) await destroySession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return {
      authenticated: false,
      profile: null,
      signup_allowed: await signupAllowed(),
      has_accounts: (await countAccounts()) > 0,
      is_admin: false,
      google_enabled: env.google !== null,
    };
  });

  // ---- Forgotten passwords -------------------------------------------------

  /**
   * Asking for a reset link.
   *
   * Answers the same thing to everyone: the same message, the same status, for
   * a registered address and for one that has never been seen. That is not
   * politeness. A form that says "no account with that email" is a form that
   * will be fed a list of addresses to find out which of them use this product,
   * and for a health-adjacent app the membership list is itself the sensitive
   * thing.
   *
   * What this does *not* claim is constant time. A registered address costs a
   * token write and a call to Resend; an unknown one costs a single SELECT, and
   * the difference is measurable. Closing that would mean queueing the send
   * behind the response, and the honest trade is to leave it: the rate limit
   * above is what makes enumeration impractical at five attempts an hour, and a
   * comment claiming a property the code does not have is worse than the gap.
   */
  app.post(
    '/auth/password/forgot',
    { config: { rateLimit: EMAIL_LIMIT } },
    async (request, reply) => {
      const parsed = PasswordResetRequest.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Enter the email address on your account.' });
      }

      await sendPasswordResetEmail(parsed.data.email, request.log);

      return {
        ok: true as const,
        message: 'If that address has an account, a reset link is on its way.',
      };
    },
  );

  /**
   * Spending the link.
   *
   * Every other session is destroyed on the way through, and that is the point
   * of the endpoint as much as the new password is: someone resetting a
   * password they did not choose to change is telling you they think somebody
   * else is in their account. Leaving that person's session alive would make
   * the reset theatre.
   *
   * It deliberately does not sign the caller in. They have just proved they can
   * read the mailbox, not that they know the password they invented ten seconds
   * ago — and typing it once, at the sign-in screen, is what makes it stick.
   */
  app.post('/auth/password/reset', { config: { rateLimit: TOKEN_LIMIT } }, async (request, reply) => {
    const parsed = PasswordReset.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Choose a password of at least 8 characters.' });
    }

    const claim = await consumeToken(parsed.data.token, 'password_reset');
    if (!claim) {
      return reply
        .status(400)
        .send({ error: 'That link has expired or has already been used. Ask for a new one.' });
    }

    await setPassword(claim.userId, parsed.data.password);
    await destroyAllSessions(claim.userId);
    // Reading the reset link proves the address as surely as the confirmation
    // link does, and asking someone to click two links to prove one mailbox is
    // a chore with no security in it.
    await markEmailVerified(claim.userId, claim.email);
    // The last line of defence: if this reset was not theirs, this is the
    // message that tells them, at the one moment they can still act on it.
    await sendPasswordChangedEmail(claim.userId, new Date(), request.log);

    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true as const, message: 'Your password has been changed. Sign in with it.' };
  });

  // ---- Proving the address -------------------------------------------------

  /**
   * Public, because the whole point is that it works from a link in a mailbox —
   * possibly in a browser that has never had a session here. The token is the
   * credential.
   */
  app.post('/auth/verify', { config: { rateLimit: TOKEN_LIMIT } }, async (request, reply) => {
    const parsed = EmailVerification.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Enter the six digits from the email.' });
    }

    /*
     * The code path. Scoped to the session, and it has to be: six digits are not
     * unique across accounts the way a 256-bit token is, so a code can only be
     * checked against the one account already claiming to hold it.
     */
    if ('code' in parsed.data) {
      if (request.userId === null) {
        return reply
          .status(401)
          .send({ error: 'Sign in first, then enter the code from the email.' });
      }

      const result = await consumeCode(request.userId, parsed.data.code);
      if (!result.ok) {
        // How many tries are left is told plainly rather than hidden. Whoever is
        // typing already knows whether they are guessing, and someone copying a
        // code across from a phone deserves to know the field is about to burn.
        return reply.status(400).send(
          result.reason === 'wrong'
            ? {
                error: `That code is not right. ${result.remaining} ${
                  result.remaining === 1 ? 'try' : 'tries'
                } left.`,
              }
            : { error: 'That code has expired or been used up. Ask for a new one.' },
        );
      }

      await markEmailVerified(request.userId, result.email);
      return { ok: true as const, message: 'Your email address is confirmed.' };
    }

    // The link path, which needs no session — it is opened wherever it is opened.
    const claim = await consumeToken(parsed.data.token, 'email_verification');
    if (!claim) {
      return reply
        .status(400)
        .send({ error: 'That link has expired or has already been used. Ask for a new one.' });
    }

    await markEmailVerified(claim.userId, claim.email);
    return { ok: true as const, message: 'Your email address is confirmed.' };
  });

  /**
   * Another link, for the one that went to spam.
   *
   * Needs a session, unlike everything else in this section: the address is
   * already known from the account, so there is nothing for a caller to supply
   * — and an anonymous version would be a way to make this server mail anyone
   * on demand.
   */
  app.post('/auth/verify/resend', { config: { rateLimit: EMAIL_LIMIT } }, async (request, reply) => {
    if (request.userId === null) return reply.status(401).send({ error: 'Not signed in.' });

    const result = await sendVerificationEmail(request.userId, request.log);

    /*
     * The one place a delivery failure is worth reporting.
     *
     * Everywhere else this server sends mail, failing quietly is right — the
     * user was doing something else and the email was incidental. Here it is
     * the entire point: someone is sitting behind a gate waiting for a code,
     * and answering "check your inbox" when we know nothing was sent leaves
     * them clicking the button forever. The provider's own words are kept out
     * of it; what they need to know is that it did not work and why it might be.
     */
    if (result.status === 'failed') {
      return reply.status(502).send({
        error: 'We could not send the code. Check the address is right, or try again shortly.',
      });
    }

    return { ok: true as const, message: 'Check your inbox for the confirmation code.' };
  });

  // ---- Signing in with Google ---------------------------------------------

  /**
   * Sends the browser to Google.
   *
   * A plain GET that answers with a redirect, rather than JSON the page then
   * acts on, because this has to survive being a link: a full navigation from
   * an `<a href>` is what lets the browser accept the state cookie set here and
   * hand it back on the way in, and it is what makes the button work with
   * scripts still loading.
   *
   * `tz` is the browser's own timezone, carried along for the same reason the
   * password sign-up form sends one — if this turns out to be a new account,
   * its first day boundary should already be right rather than guessed at UTC
   * and corrected the next morning.
   */
  app.get('/auth/google/start', { config: { rateLimit: OAUTH_LIMIT } }, async (request, reply) => {
    const google = env.google;
    if (!google) return reply.status(404).send({ error: NO_GOOGLE });

    const handshake = beginHandshake();
    const query = request.query as Record<string, unknown>;
    const timezone = typeof query.tz === 'string' ? query.tz.slice(0, 60) : '';

    reply.setCookie(OAUTH_COOKIE, packHandshake({ ...handshake, timezone }), {
      httpOnly: true,
      /**
       * Lax, and it has to be exactly that. The callback is a cross-site
       * top-level navigation from Google's servers: `strict` would withhold the
       * cookie on precisely that request and every sign-in would fail its own
       * state check, while `none` would offer it to any site that can make the
       * browser issue a request.
       */
      sameSite: 'lax',
      secure: env.secureCookies,
      path: '/',
      maxAge: HANDSHAKE_MINUTES * 60,
    });

    return reply.redirect(authorizeUrl(google, handshake));
  });

  /**
   * Where Google sends them back.
   *
   * Every exit from here is a redirect to a page, never a JSON error, because
   * the caller is a browser mid-navigation with nothing to render a status code
   * — whoever is at the keyboard should end up either signed in or back at the
   * sign-in screen being told what went wrong, and never looking at a stack of
   * curly braces.
   */
  app.get(
    '/auth/google/callback',
    { config: { rateLimit: OAUTH_LIMIT } },
    async (request, reply) => {
      const google = env.google;
      if (!google) return reply.status(404).send({ error: NO_GOOGLE });

      const handshake = readHandshake(request);
      // Spent either way: it is good for one attempt, and leaving it behind on
      // a failure is what turns a stale tab into a replay.
      reply.clearCookie(OAUTH_COOKIE, { path: '/' });

      const query = request.query as Record<string, unknown>;
      /*
       * Google reports a refusal in the query string rather than by failing the
       * request, and `access_denied` is not an error at all — it is somebody
       * pressing Cancel, which deserves a quiet return to the sign-in screen
       * rather than a red message about something having gone wrong.
       */
      if (typeof query.error === 'string') {
        return backToLogin(reply, query.error === 'access_denied' ? 'cancelled' : 'google');
      }
      // No cookie means the handshake expired, or the browser threw it away, or
      // this is a callback nobody here started.
      if (!handshake) return backToLogin(reply, 'expired');
      if (typeof query.state !== 'string' || !sameSecret(query.state, handshake.state)) {
        return backToLogin(reply, 'state');
      }
      if (typeof query.code !== 'string' || !query.code) return backToLogin(reply, 'google');

      let identity;
      try {
        identity = await exchangeCode(google, query.code, handshake);
      } catch (error) {
        // The detail is for the log — it is about our client registration or
        // Google's mood, and there is nothing in it a person can act on.
        request.log.warn({ err: error }, 'Google sign-in did not complete');
        const unverified = error instanceof GoogleAuthError && error.code === 'unverified_email';
        return backToLogin(reply, unverified ? 'google_unverified' : 'google');
      }

      const result = await signInWithProvider(GOOGLE_PROVIDER, identity, {
        allowSignup: await signupAllowed(),
        timezone: handshake.timezone,
      });
      if (!result.ok) return backToLogin(reply, 'closed');

      // After the account is resolved rather than before, for the reason the
      // password path checks it after the password: it is the same answer
      // either way, and this ordering tells an outsider nothing.
      if (await isDisabled(result.userId)) return backToLogin(reply, 'suspended');

      const { token, expiresAt } = await createSession(result.userId);
      setSessionCookie(reply, token, expiresAt);

      const device = await rememberDevice(result.userId, request.headers['user-agent'], request.ip);
      // The same alert the password path sends, and suppressed on a brand-new
      // account for the same reason: the first device is not news.
      if (device.isNew && result.outcome !== 'created') {
        await sendNewSignInEmail(
          result.userId,
          { device: device.label, ip: request.ip, at: new Date() },
          request.log,
        );
      }

      /*
       * Home, not `/login`. The redirect goes to the *app*, which is a
       * different origin from this API in every deployment that has a proxy in
       * front — and the session cookie just set travels back through that same
       * proxy, which is why `redirectUri` points there in the first place.
       */
      return reply.redirect(`${env.appUrl}/`);
    },
  );
}
