import type { FastifyBaseLogger } from 'fastify';
import type { ContentJob, Locale } from '@ct/shared';
import { draftPost } from '../ai/content.ts';
import { CONTENT_JOB, withJobLock } from './job-lock.ts';
import { query } from '../db.ts';
import { sendBlogNeedsTopicsEmail } from '../email/notify.ts';
import {
  claimedKeywords,
  createJob,
  finishJob,
  getTopic,
  isCancelled,
  markJobCurrent,
  markJobDone,
  markJobFailed,
  nextUnfinishedTopic,
  runningJob,
  topicCoverage,
  upsertPost,
} from './content.ts';

/**
 * Writing a batch of posts, on the server, where a browser cannot interrupt it.
 *
 * This loop used to live in the admin panel: one request per language, awaited
 * in the page. Refreshing the tab killed it. Each language already written was
 * safe — they are separate requests and each commits on its own — but the rest
 * simply never happened, and the screen had no memory that they were supposed
 * to.
 *
 * So the panel now starts a job and polls a row. Closing the laptop is fine.
 *
 * One at a time, enforced by the same advisory lock the scheduler uses. Not to
 * prevent duplicated work — two batches would write different rows quite
 * happily — but because thirteen minutes of sequential model calls started
 * twice is how you find the subscription's rate limit, and the second run's
 * failures would look like a bug in the first.
 */

export interface StartResult {
  job: ContentJob | null;
  /** Set when the job was refused, with the reason to show. */
  refused?: string;
}

export async function startBatch(
  topicId: string,
  locales: Locale[],
  logger?: FastifyBaseLogger,
): Promise<StartResult> {
  if (locales.length === 0) return { job: null, refused: 'No languages selected.' };
  if (!(await getTopic(topicId))) return { job: null, refused: 'No such topic.' };

  const inFlight = await runningJob();
  // Refused rather than queued, and the panel says which one is running. A
  // queue here would be a second thing to explain for a button pressed a few
  // times a week.
  if (inFlight) return { job: null, refused: 'Another batch is already running.' };

  const job = await createJob(topicId, locales);

  /*
   * Deliberately not awaited: the caller is an HTTP request that must answer
   * now with the job id, and the work behind it takes about a minute per
   * language. Everything after this point reports through the row.
   */
  void run(job.id, topicId, locales, logger).catch((error: unknown) => {
    logger?.error({ err: error, job: job.id }, 'content batch crashed');
    void finishJob(job.id, 'failed', (error as Error).message);
  });

  return { job };
}

async function run(
  jobId: string,
  topicId: string,
  locales: Locale[],
  logger?: FastifyBaseLogger,
): Promise<void> {
  const ran = await withJobLock(CONTENT_JOB, async () => {
    let consecutive = 0;

    for (const locale of locales) {
      // Cancellation is cooperative and checked here, between languages: the
      // model call in the middle of one cannot be taken back, and abandoning a
      // post that is already written would waste the minute that wrote it.
      if (await isCancelled(jobId)) return 'cancelled' as const;

      await markJobCurrent(jobId, locale);
      const topic = await getTopic(topicId);
      if (!topic) return 'gone' as const;

      /*
       * Two attempts, because the first real production failure was a language
       * that worked perfectly on the very next try.
       *
       * Writing a post is one long non-deterministic call, and its failure
       * modes are mostly of a kind that does not repeat: a slug that came back
       * with a diacritic in it, a reply the JSON parser could not find an
       * object in, a turn that ran out of steps while thinking. Retrying once
       * costs a minute and converts most of those into a post. What it must
       * not do is grind: a genuinely broken locale gets two goes and then
       * counts as one failure toward the consecutive limit below.
       */
      let lastError: Error | null = null;
      let wrote = false;

      for (let attempt = 0; attempt < 2 && !wrote; attempt++) {
        if (attempt > 0 && (await isCancelled(jobId))) return 'cancelled' as const;
        try {
          const { post, model, costUsd } = await draftPost(
            topic,
            locale,
            await claimedKeywords(locale),
          );
          await upsertPost({
            topicId,
            locale,
            slug: post.slug,
            title: post.title,
            description: post.description,
            bodyMd: post.body_md,
            keyword: post.keyword,
            model,
            costUsd,
          });
          wrote = true;
        } catch (error) {
          lastError = error as Error;
          logger?.warn(
            { err: error, job: jobId, locale, attempt: attempt + 1 },
            'content draft attempt failed',
          );
        }
      }

      if (wrote) {
        await markJobDone(jobId, locale);
        consecutive = 0;
      } else {
        // The message is stored on the row, not only logged. A container that
        // gets replaced by a deploy takes its log with it, which is exactly how
        // the reason for the first failure was lost.
        logger?.error({ err: lastError, job: jobId, locale }, 'content draft failed twice');
        await markJobFailed(jobId, locale, lastError?.message ?? 'Unknown error');
        consecutive++;
        /*
         * One failure is a language having a bad minute — twice over, by now —
         * and the rest are still worth writing. Two in a row is the lane being
         * unavailable, and grinding through eleven more is eleven more minutes
         * of the same error.
         */
        if (consecutive >= 2) {
          await finishJob(jobId, 'failed', 'Two languages failed in a row — stopped.');
          return 'stopped' as const;
        }
      }
    }
    return 'finished' as const;
  });

  // `withJobLock` answers null when somebody else holds the lock. The check in
  // `startBatch` makes that unlikely rather than impossible — two presses in
  // the same instant both see no running job — so the loser says so plainly.
  if (ran === null) {
    await finishJob(jobId, 'failed', 'Another batch held the lock.');
    return;
  }
  if (ran === 'finished') await finishJob(jobId, 'done');
  if (ran === 'gone') await finishJob(jobId, 'failed', 'The topic was deleted mid-run.');
  // 'cancelled' and 'stopped' have already written their own ending.
}

// ---- The nightly pass -------------------------------------------------------

/** The hour, in UTC, the daily pass fires. 03:00 — nobody is reading, and the
 *  subscription's day-scale limits have had all night to recover. */
export const CONTENT_HOUR = 3;

/**
 * One topic a night, in every language it is missing.
 *
 * Deliberately one topic rather than "everything outstanding". Thirteen posts
 * is already thirteen minutes of model time and thirteen things to review, and
 * a pass that cleared a backlog of six topics in one go would hand somebody
 * seventy-eight drafts on a Tuesday. A steady one a day is a pace a person can
 * actually keep up with, and the review gate is only worth having if the
 * reviewing happens.
 *
 * Everything it writes is a draft, like everything else. The nightly pass is
 * allowed to write; it is not allowed to publish.
 */
export async function runDailyContent(now: Date, logger?: FastifyBaseLogger): Promise<void> {
  if (now.getUTCHours() !== CONTENT_HOUR) return;

  // The hourly tick means this function is called twenty-four times a day and
  // must act once. The job row is the record of having acted: if one already
  // started today, there is nothing to do.
  const day = now.toISOString().slice(0, 10);
  if (await ranToday(day)) return;

  const next = await nextUnfinishedTopic();
  if (!next) {
    const coverage = await topicCoverage();
    logger?.info({ ...coverage }, 'nightly blog pass: nothing to write');
    // Keyed by the day inside the sender, so a run of empty nights is one
    // notice each rather than one ever or one an hour.
    await sendBlogNeedsTopicsEmail({ ...coverage, day }, logger);
    return;
  }

  logger?.info(
    { topic: next.topic.name, missing: next.missing.length },
    'nightly blog pass: writing',
  );

  const { job, refused } = await startBatch(next.topic.id, next.missing, logger);
  if (!job) logger?.warn({ refused }, 'nightly blog pass could not start');
}

/**
 * Whether a batch has already been started today.
 *
 * Reads the job table rather than keeping a marker of its own: a job row is
 * exactly the evidence wanted, it already exists, and a manual batch run this
 * morning is a perfectly good reason for the pass to leave tonight alone —
 * the point is a steady trickle of drafts, not a quota.
 */
async function ranToday(day: string): Promise<boolean> {
  const rows = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM content_jobs
      WHERE started_at >= $1::date AND started_at < ($1::date + INTERVAL '1 day')`,
    [day],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}
