import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AcceptInviteRequest,
  CoachAccountUpdate,
  CoachCheckoutRequest,
  CoachCommentRequest,
  CoachInviteRequest,
  CoachScope,
  CoachTargetsRequest,
} from '@ct/shared';
import {
  acceptInvite,
  addComment,
  buildDigest,
  clientLinkFor,
  clientStatus,
  clientWeek,
  coachOf,
  createInvite,
  deleteInvite,
  ensureCoachAccount,
  getCoachAccount,
  getNotes,
  isCoach,
  listComments,
  listDigests,
  listInvites,
  previewInvite,
  revokeLink,
  roster,
  setClientTargets,
  setNotes,
  updateCoachAccount,
  updateScope,
} from '../services/coach.ts';
import {
  applyStripeEvent,
  createCheckoutSession,
  createPortalSession,
  verifyStripeSignature,
} from '../services/stripe.ts';
import { env } from '../env.ts';

/**
 * The coach seat's HTTP surface. See COACH.md §5.
 *
 * Two halves, deliberately in one file so the whole of what crosses between
 * two accounts is readable in one place:
 *
 * - `/coach/*` is the coach's side, behind one guard that answers 404 to
 *   anybody without a `coach_accounts` row — the same shape as `admin.ts`,
 *   for the same reason: an ordinary account has no business learning the
 *   surface is mounted. Every per-client route asks `clientLinkFor` before it
 *   reads anything, and a missing link is the same 404.
 * - `/me/coach` is the client's side, under the ordinary session: who is
 *   coaching me, accept a code, change what they see, stop.
 */

const ScopePatch = CoachScope.partial();
const NotesBody = z.object({ body: z.string().max(10_000) });

export async function registerCoachRoutes(app: FastifyInstance) {
  /**
   * One guard for the whole prefix. The one exception is becoming a coach,
   * which by definition is asked by somebody who is not one yet.
   */
  async function requireCoach(request: FastifyRequest, reply: FastifyReply) {
    if (!request.url.startsWith('/coach')) return;
    if (request.method === 'POST' && request.url.split('?')[0] === '/coach/account') return;
    if (!request.userId || !(await isCoach(request.userId))) {
      return reply.status(404).send({ error: 'Not found' });
    }
  }
  app.addHook('onRequest', requireCoach);

  // ---- The account ----------------------------------------------------------

  /** Become a coach. Idempotent: a coach who asks again gets their account back. */
  app.post('/coach/account', async (request) => ensureCoachAccount(request.userId!));

  app.get('/coach/me', async (request) => getCoachAccount(request.userId!));

  app.patch('/coach/me', async (request, reply) => {
    const parsed = CoachAccountUpdate.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid details.' });
    return updateCoachAccount(request.userId!, parsed.data);
  });

  // ---- The roster ----------------------------------------------------------

  app.get('/coach/roster', async (request) => roster(request.userId!));

  // ---- Billing -------------------------------------------------------------

  /**
   * A Stripe Checkout page for `seats` seats. Answers with the URL rather than
   * redirecting: the caller is a fetch from the dashboard, and a 302 to another
   * origin is a thing a fetch cannot follow into a full-page navigation.
   */
  app.post('/coach/billing/checkout', async (request, reply) => {
    if (!env.stripe) return reply.status(503).send({ error: 'This server is not taking cards yet.' });
    const parsed = CoachCheckoutRequest.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Send a whole number of seats.' });
    try {
      return await createCheckoutSession(request.userId!, parsed.data.seats);
    } catch (error) {
      request.log.error({ err: error }, 'stripe checkout failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /** Stripe's own page for the card, the invoices and the seat count. */
  app.post('/coach/billing/portal', async (request, reply) => {
    if (!env.stripe) return reply.status(503).send({ error: 'This server is not taking cards yet.' });
    try {
      const session = await createPortalSession(request.userId!);
      if (!session) return reply.status(404).send({ error: 'Nothing to manage yet — no card on file.' });
      return session;
    } catch (error) {
      request.log.error({ err: error }, 'stripe portal failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  // ---- The Monday digest ---------------------------------------------------

  /** This week's digest as it would be sent, computed now and written nowhere. */
  app.get('/coach/digest/preview', async (request) => buildDigest(request.userId!));

  /** The Mondays that were sent, newest first. */
  app.get('/coach/digests', async (request) => ({ digests: await listDigests(request.userId!) }));

  // ---- Invites -------------------------------------------------------------

  app.get('/coach/invites', async (request) => ({ invites: await listInvites(request.userId!) }));

  app.post('/coach/invites', async (request, reply) => {
    const parsed = CoachInviteRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Enter a valid email, or none.' });
    return createInvite(request.userId!, parsed.data.email ?? null);
  });

  app.delete('/coach/invites/:id', async (request, reply) => {
    const ok = await deleteInvite(request.userId!, (request.params as any).id);
    if (!ok) return reply.status(404).send({ error: 'Invite not found' });
    return { ok: true };
  });

  // ---- One client ----------------------------------------------------------

  /** The same 404 for "no such client" and "not your client". */
  async function requireLink(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    const clientId = (request.params as any).id as string;
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
      reply.status(404).send({ error: 'Client not found' });
      return null;
    }
    const link = await clientLinkFor(request.userId!, clientId);
    if (!link) {
      reply.status(404).send({ error: 'Client not found' });
      return null;
    }
    return clientId;
  }

  app.get('/coach/clients/:id/week', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    const end = (request.query as any)?.end as string | undefined;
    return clientWeek(request.userId!, clientId, end);
  });

  app.put('/coach/clients/:id/targets', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    const parsed = CoachTargetsRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Send kcal, protein_g, carbs_g and fat_g as whole numbers.' });
    }
    await setClientTargets(request.userId!, clientId, parsed.data);
    return { ok: true, targets: { ...parsed.data, is_custom: true, source: 'coach' } };
  });

  app.get('/coach/clients/:id/comments', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    return { comments: await listComments(request.userId!, clientId) };
  });

  app.post('/coach/clients/:id/comments', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    const parsed = CoachCommentRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'A comment needs a date and up to 1,000 characters.' });
    }
    const comment = await addComment(request.userId!, clientId, parsed.data, request.log);
    if (!comment) return reply.status(404).send({ error: 'Client not found' });
    return comment;
  });

  app.get('/coach/clients/:id/notes', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    return { body: await getNotes(request.userId!, clientId) };
  });

  app.put('/coach/clients/:id/notes', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    const parsed = NotesBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Notes are text, up to 10,000 characters.' });
    await setNotes(request.userId!, clientId, parsed.data.body);
    return { ok: true };
  });

  /** The coach ends it. The client keeps every comment already in their journal. */
  app.delete('/coach/clients/:id', async (request, reply) => {
    const clientId = await requireLink(request, reply);
    if (!clientId) return;
    await revokeLink(request.userId!, clientId, 'coach');
    return { ok: true };
  });

  // ---- The client's side ---------------------------------------------------

  app.get('/me/coach', async (request) => clientStatus(request.userId!));

  /** Who is behind a code, for the accept screen. Reveals a name, never a link. */
  app.get('/me/coach/invite/:code', async (request) =>
    previewInvite(String((request.params as any).code ?? '')),
  );

  /**
   * Accepting a code. Every refusal is a 4xx with a `reason` the phone turns
   * into a sentence; the outcomes are the client's to hear, not to guess.
   */
  app.post('/me/coach/accept', async (request, reply) => {
    const parsed = AcceptInviteRequest.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Enter the eight-character code.', reason: 'invalid' });

    const outcome = await acceptInvite(request.userId!, parsed.data.code);
    if (outcome.ok) return outcome.status;

    const status = outcome.reason === 'seats_full' ? 409 : outcome.reason === 'already_linked' ? 409 : 400;
    const sentence: Record<typeof outcome.reason, string> = {
      invalid: 'That code is not one we recognise.',
      expired: 'That code has expired. Ask your coach for a new one.',
      used: 'That code has already been used.',
      self: 'That is your own code.',
      already_linked: 'You already share your log with a coach. Stop sharing first.',
      seats_full: "Your coach's roster is full. They have been told.",
    };
    return reply.status(status).send({ error: sentence[outcome.reason], reason: outcome.reason });
  });

  app.patch('/me/coach/scope', async (request, reply) => {
    const parsed = ScopePatch.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Send the toggles as booleans.' });
    return updateScope(request.userId!, parsed.data);
  });

  /** The client ends it. Instant; the coach sees nothing new from the next entry. */
  app.delete('/me/coach', async (request) => {
    const coachId = await coachOf(request.userId!);
    if (coachId) await revokeLink(coachId, request.userId!, 'client');
    return clientStatus(request.userId!);
  });

  // ---- Stripe's webhook ----------------------------------------------------

  /*
   * Its own plugin scope, for one reason: the signature is over the bytes
   * Stripe sent, and Fastify's default JSON parser has already turned them
   * into an object by the time a handler runs. A content-type parser is
   * encapsulated per scope, so declaring a string parser here changes this
   * route and nothing else on the server.
   *
   * Public in `app.ts` as the full route, not a prefix, for the reason the
   * RevenueCat entry is: a store's webhook has to arrive without a session,
   * and nothing else under `/billing` should.
   */
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
      done(null, body);
    });

    scope.post('/billing/stripe', async (request, reply) => {
      const stripe = env.stripe;
      if (!stripe) {
        request.log.warn('stripe webhook received but Stripe is not configured');
        return reply.status(503).send({ error: 'Billing is not configured.' });
      }
      const raw = typeof request.body === 'string' ? request.body : '';
      const signature = request.headers['stripe-signature'];
      if (!verifyStripeSignature(raw, typeof signature === 'string' ? signature : undefined, stripe.webhookSecret)) {
        request.log.warn({ ip: request.ip }, 'stripe webhook failed signature check');
        return reply.status(400).send({ error: 'Bad signature.' });
      }

      let event: { id?: string; type?: string; data?: { object?: unknown } };
      try {
        event = JSON.parse(raw);
      } catch {
        return reply.status(400).send({ error: 'Malformed event.' });
      }
      if (!event.id || !event.type || !event.data?.object) {
        return reply.status(400).send({ error: 'Malformed event.' });
      }

      try {
        const result = await applyStripeEvent(event as never);
        request.log.info({ eventId: event.id, type: event.type, ...result }, 'stripe event processed');
        return { ok: true, ...result };
      } catch (error) {
        request.log.error({ err: error, eventId: event.id }, 'stripe event failed');
        return reply.status(500).send({ error: 'Could not record that event.' });
      }
    });
  });
}
