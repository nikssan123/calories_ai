import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { generateWeeklyReview } from '../ai/review.ts';
import {
  sendAccountDeletedEmail,
  sendAccountStatusEmail,
  sendPasswordChangedEmail,
} from '../email/notify.ts';
import { applyAdaptiveTargets } from '../services/adaptive.ts';
import {
  appliedMigrations,
  buildOverview,
  deleteAccount,
  getAdminUser,
  isAdmin,
  listTables,
  listUsers,
  readTable,
  resetPassword,
  setDisabled,
  signOutEverywhere,
} from '../services/admin.ts';
import { listSupportEmails, setHandled, unhandledCount } from '../services/support.ts';
import { getUserContext } from '../services/user.ts';
import {
  costByDay,
  costByKind,
  costByUser,
  costTotals,
  economics,
  recentUsage,
} from '../services/usage.ts';

/**
 * The admin panel's HTTP surface.
 *
 * Every route here is behind one guard rather than a per-route check, because
 * the failure mode of forgetting one is that an ordinary account can read the
 * whole database. Reads are GET, actions are POST/DELETE, and there is no
 * route that takes SQL.
 */

/** Windows the cost views accept, so a stray `?days=100000` cannot scan forever. */
function clampDays(raw: unknown, fallback = 30): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(365, Math.max(1, Math.trunc(value)));
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export async function registerAdminRoutes(app: FastifyInstance) {
  /**
   * One guard for the whole prefix. It runs after the session hook in `app.ts`,
   * so `request.userId` is already resolved and a signed-out caller has been
   * turned away — this only has to answer "and are they an admin?".
   */
  async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.url.startsWith('/admin')) return;
    if (!request.userId || !(await isAdmin(request.userId))) {
      // Deliberately 404 rather than 403: an ordinary account has no business
      // learning that an admin panel is even mounted here.
      return reply.status(404).send({ error: 'Not found' });
    }
  }
  app.addHook('onRequest', requireAdmin);

  /** Cheap enough for the web app to call on every page load to decide on a nav link. */
  app.get('/admin/me', async () => ({ admin: true }));

  // ---- Read-only: the instance ---------------------------------------------

  app.get('/admin/overview', async () => buildOverview());

  app.get('/admin/migrations', async () => ({ migrations: await appliedMigrations() }));

  // ---- The support inbox ----------------------------------------------------

  /**
   * What people have written in. Admin-only for the obvious reason: these are
   * other people's messages, sent to a support address in confidence.
   */
  app.get('/admin/support', async (request) => {
    const raw = (request.query as Record<string, string | undefined>).limit;
    return {
      emails: await listSupportEmails(clampInt(raw, 50, 1, 200)),
      unhandled: await unhandledCount(),
    };
  });

  const HandledBody = z.object({ handled: z.boolean() });

  /** Marking one dealt with. Not a delete — an inbox that forgets is a liability. */
  app.post('/admin/support/:id/handled', async (request, reply) => {
    const parsed = HandledBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Send { handled: boolean }.' });

    const ok = await setHandled((request.params as any).id, parsed.data.handled);
    if (!ok) return reply.status(404).send({ error: 'Message not found' });
    return { ok: true, handled: parsed.data.handled };
  });

  // ---- Read-only: the database ---------------------------------------------

  app.get('/admin/tables', async () => ({ tables: await listTables() }));

  app.get('/admin/tables/:table', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = await readTable((request.params as any).table, {
      limit: clampInt(query.limit, 50, 1, 500),
      offset: clampInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
      userId: query.user_id ?? null,
      // Both are checked against the table's own live column list downstream,
      // so an unknown sort column falls back to the default order rather than
      // reaching SQL or erroring.
      q: query.q?.slice(0, 200) ?? null,
      sort: query.sort ?? null,
      dir: query.dir === 'asc' ? 'asc' : 'desc',
    });
    if (!page) return reply.status(404).send({ error: 'No such table, or it is not browsable.' });
    return page;
  });

  // ---- Read-only: accounts --------------------------------------------------

  app.get('/admin/users', async (request) => {
    const limit = clampInt((request.query as any)?.limit, 100, 1, 500);
    return { users: await listUsers(limit) };
  });

  app.get('/admin/users/:id', async (request, reply) => {
    const user = await getAdminUser((request.params as any).id);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return user;
  });

  // ---- Read-only: cost ------------------------------------------------------

  /**
   * Everything needed to answer "is this viable as a product?" in one response.
   * It is one round trip because the answer is a comparison — cost per turn
   * against turns per user against the projection — and paginating that into
   * four requests would just invite reading one number in isolation.
   */
  app.get('/admin/costs', async (request) => {
    const days = clampDays((request.query as any)?.days);
    const [totals, byKind, byDay, byUser, unitEconomics] = await Promise.all([
      costTotals(days),
      costByKind(days),
      costByDay(days),
      costByUser(days),
      economics(days),
    ]);
    return { days, totals, by_kind: byKind, by_day: byDay, by_user: byUser, economics: unitEconomics };
  });

  /** The raw turn log, for when an average looks wrong and you want the rows. */
  app.get('/admin/costs/turns', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return {
      turns: await recentUsage(clampInt(query.limit, 100, 1, 500), query.user_id ?? null),
    };
  });

  // ---- Actions --------------------------------------------------------------

  app.post('/admin/users/:id/sign-out', async (request, reply) => {
    const id = (request.params as any).id as string;
    if (!(await getAdminUser(id))) return reply.status(404).send({ error: 'User not found' });
    return { revoked: await signOutEverywhere(id) };
  });

  const PasswordBody = z.object({ password: z.string().min(8).max(200) });

  app.post('/admin/users/:id/password', async (request, reply) => {
    const parsed = PasswordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Password must be 8–200 characters.' });
    }
    const id = (request.params as any).id as string;
    const ok = await resetPassword(id, parsed.data.password);
    if (!ok) return reply.status(404).send({ error: 'User not found' });

    // The same notice a self-service reset sends, and needed more here: this is
    // someone else changing the password on your account and signing you out of
    // every device, which from the owner's side is indistinguishable from being
    // compromised until somebody says otherwise.
    await sendPasswordChangedEmail(id, new Date(), request.log);
    return { ok: true };
  });

  const DisabledBody = z.object({ disabled: z.boolean() });

  app.post('/admin/users/:id/disabled', async (request, reply) => {
    const parsed = DisabledBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Send { disabled: boolean }.' });

    const id = (request.params as any).id as string;
    // An admin who suspends their own account locks themselves out of the panel
    // that would let them undo it, and the fix is an ssh session.
    if (id === request.userId && parsed.data.disabled) {
      return reply.status(400).send({ error: 'You cannot disable your own account.' });
    }

    const ok = await setDisabled(id, parsed.data.disabled);
    if (!ok) return reply.status(404).send({ error: 'User not found' });

    // Suspension is otherwise silent from the inside: the app simply stops
    // letting you in, with a message that reads like a bug. Both directions are
    // announced, because being let back in is news too.
    await sendAccountStatusEmail(id, parsed.data.disabled, request.log);
    return { ok: true, disabled: parsed.data.disabled };
  });

  /**
   * Deleting an account is the one irreversible action here, so it takes the
   * email as confirmation in the body — the same shape every "type the name to
   * confirm" dialogue uses, and it survives a misdirected click on a row.
   */
  const DeleteBody = z.object({ confirm_email: z.string().min(1) });

  app.delete('/admin/users/:id', async (request, reply) => {
    const parsed = DeleteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Send { confirm_email } to confirm.' });
    }

    const id = (request.params as any).id as string;
    if (id === request.userId) {
      return reply.status(400).send({ error: 'You cannot delete your own account.' });
    }

    const user = await getAdminUser(id);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    // An account with no email — the pre-accounts placeholder row — can never
    // be confirmed, which is the right answer rather than a special case.
    if (user.email?.toLowerCase() !== parsed.data.confirm_email.trim().toLowerCase()) {
      return reply.status(400).send({ error: "That email doesn't match this account." });
    }

    const summary = await deleteAccount(id);
    // The same receipt someone gets when they close their own account. An
    // administrator deleting it does not make the owner less entitled to know
    // what happened to their year of meals.
    if (summary) {
      await sendAccountDeletedEmail(
        {
          email: user.email!,
          name: user.display_name,
          counts: { ...summary, photos: summary.photos.length },
        },
        request.log,
      );
    }

    return { ok: true, deleted: summary };
  });

  /** Generate this user's weekly review now. Spends a turn, so it is a POST. */
  app.post('/admin/users/:id/review', async (request, reply) => {
    const id = (request.params as any).id as string;
    if (!(await getAdminUser(id))) return reply.status(404).send({ error: 'User not found' });
    try {
      return await generateWeeklyReview(id);
    } catch (error) {
      request.log.error({ err: error, userId: id }, 'admin review failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /** Run the adaptive-target pass for one user without waiting for Monday. */
  app.post('/admin/users/:id/adaptive', async (request, reply) => {
    const id = (request.params as any).id as string;
    if (!(await getAdminUser(id))) return reply.status(404).send({ error: 'User not found' });
    const { userId, ...ctx } = await getUserContext(id);
    return applyAdaptiveTargets(userId, ctx);
  });
}
