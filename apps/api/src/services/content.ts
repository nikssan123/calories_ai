import type {
  ContentJob,
  ContentPost,
  ContentTopic,
  Locale,
  PostCard,
  PostStatus,
  PublicPost,
  TopicWithPosts,
} from '@ct/shared';
import { LOCALES } from '@ct/shared';
import { query, queryOne } from '../db.ts';

/**
 * The blog's rows.
 *
 * Two audiences and a hard line between them. The `public*` functions read only
 * `status = 'published'` and are reachable without a session; everything else
 * is behind the admin gate. A draft is a nutrition claim nobody has read yet,
 * and the one thing this module must never do is serve one.
 */

const POST_COLUMNS = `
  id, topic_id, locale, slug, title, description, body_md, keyword,
  status, published_at, model, cost_usd, created_at, updated_at
`;

function toPost(row: any): ContentPost {
  return {
    id: row.id,
    topic_id: row.topic_id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    description: row.description,
    body_md: row.body_md,
    keyword: row.keyword,
    status: row.status,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
    model: row.model,
    cost_usd: row.cost_usd === null ? null : Number(row.cost_usd),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function toTopic(row: any): ContentTopic {
  return {
    id: row.id,
    name: row.name,
    brief: row.brief,
    created_at: new Date(row.created_at).toISOString(),
  };
}

// ---- Topics ----------------------------------------------------------------

export async function createTopic(name: string, brief: string): Promise<ContentTopic> {
  const row = await queryOne<any>(
    'INSERT INTO content_topics (name, brief) VALUES ($1, $2) RETURNING id, name, brief, created_at',
    [name, brief],
  );
  return toTopic(row!);
}

export async function getTopic(id: string): Promise<ContentTopic | null> {
  const row = await queryOne<any>(
    'SELECT id, name, brief, created_at FROM content_topics WHERE id = $1',
    [id],
  );
  return row ? toTopic(row) : null;
}

export async function deleteTopic(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM content_topics WHERE id = $1 RETURNING id',
    [id],
  );
  return rows.length > 0;
}

/** Every topic with every post under it, newest topic first. The admin list. */
export async function listTopics(): Promise<TopicWithPosts[]> {
  const topics = await query<any>(
    'SELECT id, name, brief, created_at FROM content_topics ORDER BY created_at DESC',
  );
  if (topics.length === 0) return [];

  const posts = await query<any>(
    `SELECT ${POST_COLUMNS} FROM content_posts
      WHERE topic_id = ANY($1::uuid[])
      ORDER BY locale`,
    [topics.map((t) => t.id)],
  );

  const byTopic = new Map<string, ContentPost[]>();
  for (const row of posts) {
    const post = toPost(row);
    const list = byTopic.get(post.topic_id) ?? [];
    list.push(post);
    byTopic.set(post.topic_id, list);
  }

  return topics.map((row) => ({ topic: toTopic(row), posts: byTopic.get(row.id) ?? [] }));
}

// ---- Posts -----------------------------------------------------------------

/**
 * Store one drafted post, replacing whatever was there for that topic and
 * locale.
 *
 * An upsert rather than an insert because regenerating is the normal way to
 * respond to a bad draft, and the alternative is a blog that grows a second
 * near-identical German article every time somebody presses the button.
 *
 * A regeneration always lands as a draft, even over a published post, and the
 * published one stays up until the new one is approved. Replacing live text
 * with unreviewed text on a button press is exactly the accident this pipeline
 * is shaped to prevent.
 */
export async function upsertPost(input: {
  topicId: string;
  locale: Locale;
  slug: string;
  title: string;
  description: string;
  bodyMd: string;
  keyword: string;
  model: string | null;
  costUsd: number | null;
}): Promise<ContentPost> {
  const row = await queryOne<any>(
    `INSERT INTO content_posts
       (topic_id, locale, slug, title, description, body_md, keyword, model, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (topic_id, locale) DO UPDATE SET
       slug = EXCLUDED.slug,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       body_md = EXCLUDED.body_md,
       keyword = EXCLUDED.keyword,
       model = EXCLUDED.model,
       cost_usd = EXCLUDED.cost_usd,
       status = 'draft',
       updated_at = now()
     RETURNING ${POST_COLUMNS}`,
    [
      input.topicId,
      input.locale,
      input.slug,
      input.title,
      input.description,
      input.bodyMd,
      input.keyword,
      input.model,
      input.costUsd,
    ],
  );
  return toPost(row!);
}

export async function getPost(id: string): Promise<ContentPost | null> {
  const row = await queryOne<any>(`SELECT ${POST_COLUMNS} FROM content_posts WHERE id = $1`, [id]);
  return row ? toPost(row) : null;
}

/**
 * Move a post between states.
 *
 * `published_at` is set once and then left alone: a correction should not
 * reorder the index or reset a date a reader may have seen, and unpublishing
 * and republishing is a correction rather than a new article.
 */
export async function setPostStatus(id: string, status: PostStatus): Promise<ContentPost | null> {
  const row = await queryOne<any>(
    `UPDATE content_posts
        SET status = $2,
            published_at = CASE
              WHEN $2 = 'published' AND published_at IS NULL THEN now()
              ELSE published_at
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${POST_COLUMNS}`,
    [id, status],
  );
  return row ? toPost(row) : null;
}

/** Edit a post by hand. The review step is only worth having if it can fix things. */
export async function editPost(
  id: string,
  fields: { title?: string; description?: string; bodyMd?: string; slug?: string },
): Promise<ContentPost | null> {
  const row = await queryOne<any>(
    `UPDATE content_posts
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            body_md = COALESCE($4, body_md),
            slug = COALESCE($5, slug),
            updated_at = now()
      WHERE id = $1
      RETURNING ${POST_COLUMNS}`,
    [id, fields.title ?? null, fields.description ?? null, fields.bodyMd ?? null, fields.slug ?? null],
  );
  return row ? toPost(row) : null;
}

/** Which locales a topic is still missing a post for. The queue. */
export async function missingLocales(topicId: string): Promise<Locale[]> {
  const rows = await query<{ locale: string }>(
    'SELECT locale FROM content_posts WHERE topic_id = $1',
    [topicId],
  );
  const have = new Set(rows.map((r) => r.locale));
  return LOCALES.filter((locale) => !have.has(locale));
}

// ---- The public read -------------------------------------------------------

/** Published posts in one language, newest first. */
export async function publicIndex(locale: Locale): Promise<PostCard[]> {
  const rows = await query<any>(
    `SELECT slug, locale, title, description, published_at
       FROM content_posts
      WHERE locale = $1 AND status = 'published'
      ORDER BY published_at DESC`,
    [locale],
  );
  return rows.map((row) => ({
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    description: row.description,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
  }));
}

/**
 * One published post, with the other languages it exists in.
 *
 * The alternates come back from the same query because they are what the page
 * turns into `hreflang`, and they carry a slug each: the slugs genuinely differ
 * per language, so a cluster cannot be derived from the URL the way it can on a
 * site that translates its paths.
 */
export async function publicPost(locale: Locale, slug: string): Promise<PublicPost | null> {
  const row = await queryOne<any>(
    `SELECT topic_id, slug, locale, title, description, body_md, published_at, updated_at
       FROM content_posts
      WHERE locale = $1 AND slug = $2 AND status = 'published'`,
    [locale, slug],
  );
  if (!row) return null;

  const alternates = await query<{ locale: string; slug: string }>(
    `SELECT locale, slug FROM content_posts
      WHERE topic_id = $1 AND status = 'published'
      ORDER BY locale`,
    [row.topic_id],
  );

  return {
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    description: row.description,
    body_md: row.body_md,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
    updated_at: new Date(row.updated_at).toISOString(),
    alternates: alternates.map((a) => ({ locale: a.locale as Locale, slug: a.slug })),
  };
}

/** Every published post in every language. The sitemap's query. */
export async function publicSitemap(): Promise<
  { locale: Locale; slug: string; updated_at: string }[]
> {
  const rows = await query<any>(
    `SELECT locale, slug, updated_at FROM content_posts
      WHERE status = 'published'
      ORDER BY locale, published_at DESC`,
  );
  return rows.map((row) => ({
    locale: row.locale as Locale,
    slug: row.slug,
    updated_at: new Date(row.updated_at).toISOString(),
  }));
}

// ---- What the planner has already thought of --------------------------------

/**
 * Every subject offered, whatever became of it.
 *
 * Deliberately not derived from `content_topics`: that table holds what is
 * currently accepted, and the question the planner needs answered is what has
 * already been *considered*. A deleted topic and a rejected suggestion are both
 * things not to propose again, and neither leaves a trace in the accepted set.
 */
export async function rememberSuggestions(
  proposals: { name: string; brief: string }[],
): Promise<void> {
  if (proposals.length === 0) return;
  await query(
    `INSERT INTO content_suggestions (name, brief)
     SELECT * FROM unnest($1::text[], $2::text[])`,
    [proposals.map((p) => p.name), proposals.map((p) => p.brief)],
  );
}

export async function markSuggestion(
  name: string,
  status: 'accepted' | 'rejected',
): Promise<void> {
  await query(
    `UPDATE content_suggestions SET status = $2
      WHERE id = (SELECT id FROM content_suggestions
                   WHERE name = $1 AND status = 'proposed'
                   ORDER BY created_at DESC LIMIT 1)`,
    [name, status],
  );
}

/**
 * The memory handed to the planner: everything it should not propose again.
 *
 * Two sources, unioned, and the split is the whole design:
 *
 *   * **Topics that exist right now.** Obvious, and the only thing the first
 *     version looked at.
 *   * **Suggestions recorded as offered or turned down.** These outlive the
 *     screen they appeared on, so unticking one is a decision that sticks
 *     rather than a preference the next click forgets.
 *
 * What is deliberately *not* in here is a topic that was created and then
 * deleted. Deleting is how you say you do not want something, including
 * wanting it out of the way — reviving it as a permanent veto would make
 * clearing the table a thing you could not undo by clearing the table.
 *
 * The brief travels with the name because names hide overlap: three subjects
 * can read as three and be one, and only the substance shows that.
 *
 * Capped, because this goes into a prompt and has to stay one. Sixty is several
 * months of planning at the rate a blog like this moves.
 */
export async function suggestionMemory(
  limit = 60,
): Promise<{ name: string; brief: string; status: string }[]> {
  const rows = await query<{ name: string; brief: string; status: string }>(
    `SELECT name, brief, status, created_at FROM (
       SELECT name, brief, 'live'::text AS status, created_at FROM content_topics
       UNION ALL
       SELECT name, brief, status, created_at FROM content_suggestions
       WHERE status <> 'accepted'
     ) memory
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/**
 * Every target query already claimed in one language.
 *
 * The real duplicate is not two topics that sound alike — it is two articles
 * chasing the same search, which is two of your own pages competing and each
 * ranking worse for it. The `keyword` column has recorded what each locale
 * chose since the library shipped; this is what makes it useful.
 */
export async function claimedKeywords(locale: Locale): Promise<string[]> {
  const rows = await query<{ keyword: string }>(
    `SELECT keyword FROM content_posts WHERE locale = $1 AND status <> 'binned'`,
    [locale],
  );
  return rows.map((r) => r.keyword);
}

// ---- A batch, as a row ------------------------------------------------------

function toJob(row: any): ContentJob {
  return {
    id: row.id,
    topic_id: row.topic_id,
    locales: row.locales,
    done: row.done,
    failed: row.failed,
    current: row.current,
    status: row.status,
    error: row.error,
    started_at: new Date(row.started_at).toISOString(),
    finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  };
}

const JOB_COLUMNS = `id, topic_id, locales, done, failed, current, status, error, started_at, finished_at`;

export async function createJob(topicId: string, locales: Locale[]): Promise<ContentJob> {
  const row = await queryOne<any>(
    `INSERT INTO content_jobs (topic_id, locales) VALUES ($1, $2) RETURNING ${JOB_COLUMNS}`,
    [topicId, locales],
  );
  return toJob(row!);
}

/** The one job that may be in flight, if there is one. */
export async function runningJob(): Promise<ContentJob | null> {
  const row = await queryOne<any>(
    `SELECT ${JOB_COLUMNS} FROM content_jobs WHERE status = 'running'
      ORDER BY started_at DESC LIMIT 1`,
  );
  return row ? toJob(row) : null;
}

export async function getJob(id: string): Promise<ContentJob | null> {
  const row = await queryOne<any>(`SELECT ${JOB_COLUMNS} FROM content_jobs WHERE id = $1`, [id]);
  return row ? toJob(row) : null;
}

/** The last few, so the panel can show what happened after a refresh. */
export async function recentJobs(limit = 5): Promise<ContentJob[]> {
  const rows = await query<any>(
    `SELECT ${JOB_COLUMNS} FROM content_jobs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toJob);
}

export async function markJobCurrent(id: string, locale: Locale): Promise<void> {
  await query('UPDATE content_jobs SET current = $2 WHERE id = $1', [id, locale]);
}

export async function markJobResult(id: string, locale: Locale, ok: boolean): Promise<void> {
  await query(
    ok
      ? 'UPDATE content_jobs SET done = array_append(done, $2), current = NULL WHERE id = $1'
      : 'UPDATE content_jobs SET failed = array_append(failed, $2), current = NULL WHERE id = $1',
    [id, locale],
  );
}

export async function finishJob(
  id: string,
  status: 'done' | 'cancelled' | 'failed',
  error?: string,
): Promise<void> {
  await query(
    `UPDATE content_jobs SET status = $2, error = $3, current = NULL, finished_at = now()
      WHERE id = $1`,
    [id, status, error ?? null],
  );
}

/** Cooperative cancellation: the runner checks this between languages. */
export async function requestCancel(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE content_jobs SET status = 'cancelled', current = NULL, finished_at = now()
      WHERE id = $1 AND status = 'running' RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

export async function isCancelled(id: string): Promise<boolean> {
  const row = await queryOne<{ status: string }>(
    'SELECT status FROM content_jobs WHERE id = $1',
    [id],
  );
  return row?.status !== 'running';
}

/**
 * Any job still marked running when the process starts is a lie left by the
 * previous one — a deploy or a crash killed the loop mid-language.
 *
 * Reconciled at boot rather than left to confuse the panel forever. The posts
 * already written are safe; it is only the row that is stale.
 */
export async function reconcileAbandonedJobs(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE content_jobs
        SET status = 'failed', current = NULL, finished_at = now(),
            error = 'Interrupted — the server restarted mid-run.'
      WHERE status = 'running' RETURNING id`,
  );
  return rows.length;
}
