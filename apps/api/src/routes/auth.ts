import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Credentials, SESSION_TRANSPORT_HEADER, SignupRequest } from '@ct/shared';
import { env } from '../env.ts';
import {
  bearerToken,
  createSession,
  destroySession,
  SESSION_COOKIE,
} from '../services/auth.ts';
import {
  authenticate,
  countAccounts,
  createAccount,
  emailInUse,
  getUser,
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

    return {
      authenticated: true,
      profile: await getUser(userId),
      signup_allowed: false,
      has_accounts: true,
      is_admin: await isAdmin(userId),
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

    return {
      authenticated: true,
      profile: await getUser(userId),
      signup_allowed: false,
      has_accounts: true,
      is_admin: await isAdmin(userId),
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
    };
  });
}
