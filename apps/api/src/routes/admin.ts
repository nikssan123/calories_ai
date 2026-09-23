import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  LOCALES,
  Locale,
  PlanName,
  PlanSource,
  PostStatus,
  SocialDecision,
  SocialUpload,
  localeOf,
} from '@ct/shared';
import { draftPost, suggestTopics } from '../ai/content.ts';
import { startBatch } from '../services/content-runner.ts';
import {
  claimedKeywords,
  linkablePosts,
  createTopic,
  deleteTopic,
  markSuggestion,
  recentJobs,
  rememberSuggestions,
  requestCancel,
  runningJob,
  suggestionMemory,
  editPost,
  getPost,
  getTopic,
  listTopics,
  missingLocales,
  setPostStatus,
  upsertPost,
} from '../services/content.ts';
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
import { setPlan, subscriptionReport } from '../services/subscriptions.ts';
import { readFunnel } from '../services/funnel.ts';
import {
  addCandidate,
  bufferQueue,
  decide,
  loadQueue,
  movePost,
  postedPerformance,
  removePost,
  reschedulePost,
} from '../services/social.ts';
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

  // ---- The blog -------------------------------------------------------------
  //
  // The write half of the content pipeline. The read half is public and lives
  // in routes/public.ts, which serves published posts only.
  //
  // Nothing here publishes as a side effect. Generating writes a draft, and
  // regenerating over a live post writes a draft too and leaves the live one
  // standing: this is a health-adjacent site, most of what the blog will say
  // contains a nutrition claim, and an unreviewed one going out is the most
  // expensive thing that can happen to it. Publishing is a separate button
  // pressed by a person who has read the thing.

  app.get('/admin/content', async () => ({ topics: await listTopics() }));

  /**
   * Ask for subjects instead of thinking of them.
   *
   * Returns a list and writes nothing: agreeing to a topic is agreeing to
   * thirteen articles, so the list is meant to be read and cut down first. The
   * names already in the table go up with the request, so the planner does not
   * propose the same thing twice.
   */
  app.post('/admin/content/topics/suggest', async (request, reply) => {
    const parsed = z
      .object({ count: z.number().int().min(1).max(12).optional() })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    /*
     * Everything ever proposed, not merely everything currently accepted.
     * Deleting a topic must not erase the memory that it was already thought
     * of — clearing the table to start fresh is exactly when re-proposing the
     * same eight would be most annoying and least noticed.
     */
    const seen = await suggestionMemory();
    try {
      const { topics } = await suggestTopics(seen, parsed.data.count ?? 8);
      // Recorded as proposed the moment they are shown, so a suggestion the
      // editor simply closes the tab on still counts as seen.
      await rememberSuggestions(topics);
      return { topics };
    } catch (error) {
      request.log.error({ err: error }, 'topic suggestion failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /**
   * Turn a suggestion down.
   *
   * Worth a route of its own rather than silently forgetting: a rejection is
   * the strongest signal the planner can be given, and the whole reason the
   * same subject kept coming back was that nobody was writing it down.
   */
  app.post('/admin/content/suggestions/reject', async (request, reply) => {
    const parsed = z
      .object({ names: z.array(z.string().min(1)).min(1).max(24) })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });
    for (const name of parsed.data.names) await markSuggestion(name, 'rejected');
    return reply.status(204).send();
  });

  /** Accept one or more suggestions, or a topic typed by hand. */
  app.post('/admin/content/topics', async (request, reply) => {
    const parsed = z
      .object({ name: z.string().min(1).max(200), brief: z.string().min(1).max(4000) })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid topic' });
    await markSuggestion(parsed.data.name, 'accepted');
    return createTopic(parsed.data.name, parsed.data.brief);
  });

  app.delete('/admin/content/topics/:id', async (request, reply) => {
    const gone = await deleteTopic((request.params as any).id);
    if (!gone) return reply.status(404).send({ error: 'No such topic' });
    return reply.status(204).send();
  });

  /**
   * Write one language's post for a topic.
   *
   * One locale per request, on purpose. Thirteen Opus articles in a single HTTP
   * request is several minutes with a socket held open and nothing to show for
   * it if the twelfth fails; the panel drives the loop instead and shows each
   * one landing. `locale` omitted means "the next one missing", which is what
   * makes that loop a one-liner on the client.
   */
  app.post('/admin/content/topics/:id/write', async (request, reply) => {
    const topic = await getTopic((request.params as any).id);
    if (!topic) return reply.status(404).send({ error: 'No such topic' });

    const asked = (request.body as any)?.locale;
    let locale: Locale;
    if (asked === undefined || asked === null) {
      const [next] = await missingLocales(topic.id);
      if (!next) return reply.status(409).send({ error: 'Every language already has a post.' });
      locale = next;
    } else {
      const parsed = Locale.safeParse(asked);
      if (!parsed.success) return reply.status(400).send({ error: 'No such language' });
      locale = parsed.data;
    }

    try {
      const { post, model, costUsd } = await draftPost(
        topic,
        locale,
        await claimedKeywords(locale, topic.id),
        await linkablePosts(locale),
      );
      const saved = await upsertPost({
        topicId: topic.id,
        locale,
        slug: post.slug,
        title: post.title,
        description: post.description,
        bodyMd: post.body_md,
        keyword: post.keyword,
        model,
        costUsd,
      });
      return { post: saved, remaining: await missingLocales(topic.id) };
    } catch (error) {
      // A failed draft is a 502 rather than a 500: the fault is upstream, and
      // the panel says so instead of showing a stack trace to the one person
      // who could have fixed it if they knew which half broke.
      request.log.error({ err: error, topic: topic.id, locale }, 'content draft failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /**
   * Write several languages, on the server.
   *
   * Answers immediately with the job, because the work behind it is about a
   * minute per language and an HTTP request is the wrong place to keep that.
   * Progress is read back from `/admin/content/jobs`.
   */
  app.post('/admin/content/topics/:id/batch', async (request, reply) => {
    const parsed = z
      .object({ locales: z.array(Locale).min(1).max(LOCALES.length) })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    const { job, refused } = await startBatch(
      (request.params as any).id,
      parsed.data.locales,
      request.log,
    );
    if (!job) return reply.status(409).send({ error: refused });
    return job;
  });

  /** Whatever is running, plus the last few, so a reloaded panel can catch up. */
  app.get('/admin/content/jobs', async () => ({
    running: await runningJob(),
    recent: await recentJobs(),
  }));

  app.post('/admin/content/jobs/:id/cancel', async (request, reply) => {
    const stopped = await requestCancel((request.params as any).id);
    if (!stopped) return reply.status(409).send({ error: 'That job is not running.' });
    return reply.status(204).send();
  });

  app.patch('/admin/content/posts/:id', async (request, reply) => {
    const parsed = z
      .object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().min(1).max(400).optional(),
        body_md: z.string().min(1).optional(),
        slug: z
          .string()
          .min(1)
          .max(90)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        status: PostStatus.optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid edit' });

    const id = (request.params as any).id;
    if (!(await getPost(id))) return reply.status(404).send({ error: 'No such post' });

    const { status, body_md, ...rest } = parsed.data;
    let post = await editPost(id, { ...rest, bodyMd: body_md });
    if (status) post = await setPostStatus(id, status);
    return post;
  });

  /** The languages, for the panel's picker. */
  app.get('/admin/content/locales', async () => ({ locales: LOCALES }));

  /*
   * The social queue. Separate from `/admin/content/*` above, which is the
   * blog: that engine writes prose in thirteen languages and this one decides
   * whether an image is good enough to post.
   */

  app.get('/admin/social', async () => loadQueue());

  /**
   * What has gone out, and how it did.
   *
   * A separate request from the queue because it reaches Buffer for per-post
   * metrics and the panel should render the stack without waiting on that —
   * deciding is the job, and measuring is the thing you read afterwards.
   */
  app.get('/admin/social/performance', async (_request, reply) => {
    try {
      return { posted: await postedPerformance() };
    } catch (error) {
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /**
   * Buffer's queue, as Buffer holds it: what is going out, when, and what
   * already went.
   *
   * Not derivable from `/admin/social`, which reads our rows. A row turns
   * `posted` when Buffer accepts it — days before it publishes — and the
   * account also holds posts this queue never made. Asking our table what
   * shipped answers wrongly in both directions.
   *
   * 502 rather than an empty queue on failure: an empty Buffer and an
   * unreachable Buffer must not render the same, which they did once already.
   */
  app.get('/admin/social/queue', async (_request, reply) => {
    try {
      return await bufferQueue();
    } catch (error) {
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /**
   * Rearranging Buffer's queue: order, time, or gone.
   *
   * Three routes rather than one PATCH, because they are three different
   * Buffer operations with three different failure modes and nothing is
   * gained by pretending otherwise. All three answer 502 on a Buffer refusal,
   * so the panel can show what Buffer said instead of a generic failure.
   */
  app.post('/admin/social/queue/:id/move', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ position: z.enum(['top', 'bottom']) }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'position must be top or bottom' });
    try {
      await movePost(id, body.data.position);
      return { ok: true };
    } catch (error) {
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  app.post('/admin/social/queue/:id/time', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ dueAt: z.string().datetime() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'dueAt must be an ISO timestamp' });
    try {
      await reschedulePost(id, body.data.dueAt);
      return { ok: true };
    } catch (error) {
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  app.delete('/admin/social/queue/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await removePost(id);
      return { ok: true };
    } catch (error) {
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  /**
   * A rendered post arriving from `scripts/content/queue.mts`.
   *
   * Base64 in the body rather than the presigned-PUT dance meal photos use.
   * That exists to keep megabytes off the event loop when thousands of phones
   * upload at once; this is one laptop, a few dozen times a week, and a slide
   * is a couple of hundred kilobytes.
   */
  app.post('/admin/social', async (request, reply) => {
    const parsed = SocialUpload.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid upload' });
    return addCandidate(parsed.data);
  });

  /*
   * Keyed by the slideshow, not the row: a carousel is one decision. `:key` is
   * a source key with its trailing index removed — `10-three-ways` — which is
   * URL-safe by construction because post.mts keys are kebab-case.
   */
  app.post('/admin/social/:key/decide', async (request, reply) => {
    const parsed = SocialDecision.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid decision' });

    const key = (request.params as { key: string }).key;
    try {
      return await decide(key, parsed.data);
    } catch (error) {
      /*
       * 409 and not 500. Everything `decide` throws is a state or
       * configuration problem the panel should show verbatim — no such
       * slideshow, already posted, Buffer unconfigured, every channel
       * disconnected. A Buffer refusal for an individual channel never gets
       * here: it is recorded on the row and returned as an `error` state, so
       * the panel can show which channels did go.
       */
      return reply.status(409).send({ error: (error as Error).message });
    }
  });

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

  // ---- Subscriptions --------------------------------------------------------

  /**
   * Who is paying, what they are paying for, and whether the plumbing that
   * decides it is working.
   *
   * One request, like `/admin/costs`, because the numbers only mean anything
   * beside each other — see the note on `subscriptionReport`.
   */
  app.get('/admin/subscriptions', async () => subscriptionReport());

  /**
   * Set an account's plan by hand.
   *
   * The case this is for is a purchase the store took money for and our server
   * never heard about: a missed `INITIAL_PURCHASE` is never redelivered, so
   * somebody has to be able to repair the column. `plan: 'free'` is the revoke,
   * and it clears the source and the expiry with it.
   *
   * `expires_at` is a date or a timestamp — a support fix is usually typed as
   * "the 23rd", and rejecting that in favour of an ISO instant would mean the
   * one control nobody can use without a converter. A plan with no expiry is
   * allowed and means what it says: the sweep never revokes it.
   */
  const PlanBody = z.object({
    plan: PlanName,
    expires_at: z.string().min(4).nullish(),
    source: PlanSource.optional(),
  });

  app.post('/admin/subscriptions/:id/plan', async (request, reply) => {
    const parsed = PlanBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Send { plan, expires_at?, source? }.' });
    }

    const id = (request.params as any).id as string;
    if (!(await getAdminUser(id))) return reply.status(404).send({ error: 'User not found' });

    let expiresAt: string | null = null;
    if (parsed.data.expires_at) {
      const when = new Date(parsed.data.expires_at);
      if (Number.isNaN(when.getTime())) {
        return reply.status(400).send({ error: 'That expiry is not a date.' });
      }
      expiresAt = when.toISOString();
    }

    const ok = await setPlan(id, {
      plan: parsed.data.plan,
      expiresAt,
      // `manual` by default, and that is the safe default rather than a lazy
      // one: it is the only source `expirePlans` refuses to sweep, so a grant
      // typed without an expiry cannot be silently revoked overnight.
      source: parsed.data.source ?? 'manual',
      by: request.userId ?? null,
    });
    if (!ok) return reply.status(404).send({ error: 'User not found' });
    return { ok: true, plan: parsed.data.plan, expires_at: expiresAt };
  });

  // ---- Read-only: the first-run funnel ----------------------------------------

  /** How far new installs got through the walk before an account, over `days`. */
  app.get('/admin/funnel', async (request) => readFunnel(clampDays((request.query as any)?.days, 7)));

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
          // The owner's language, not the operator's. Read off `user`, which
          // was fetched before the deletion.
          locale: localeOf(user),
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
