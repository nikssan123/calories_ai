import type { FastifyInstance } from 'fastify';
import { FunnelPing } from '@ct/shared';
import { recordFunnelStep } from '../services/funnel.ts';

/**
 * Fifteen steps is the most one install ever sends, so an hour's allowance of
 * sixty is several phones behind one address — a family on one router, a
 * carrier's NAT — and not much more. Past it a ping is simply dropped: a funnel
 * that undercounts a burst is fine, and one an unbounded script can inflate is
 * not.
 */
const FUNNEL_LIMIT = { max: 60, timeWindow: '1 hour' };

/**
 * The one write that arrives with no session and is not about an account.
 *
 * `/funnel` is on the public list in app.ts as a single route. It reads no
 * session and must never start to: the phone sends it without a token even
 * after sign-in (`apps/mobile/lib/funnel.ts`), and a route here that looked one
 * up would turn an anonymous count back into a record of a person.
 */
export async function registerFunnelRoutes(app: FastifyInstance) {
  app.post('/funnel', { config: { rateLimit: FUNNEL_LIMIT } }, async (request, reply) => {
    const parsed = FunnelPing.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid step' });
    await recordFunnelStep(parsed.data);
    return reply.status(204).send();
  });
}
