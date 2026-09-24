import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import type { FunnelPing, FunnelStep, SaveReason } from '@ct/shared';
import { API_BASE_URL } from '@/lib/api';
import { deviceLocale } from '@/messages';

/**
 * Tells the server a new install reached a screen of the first-run walk.
 *
 * The walk runs on the phone and is silent until the account step, so without
 * this an install that left on the welcome screen and one that left on the
 * sign-up form look the same from the server: one `GET /auth/me` and nothing.
 * The steps are `FUNNEL_STEPS` in `@ct/shared`.
 *
 * What makes it a count rather than tracking is what is *not* sent. No install
 * id, no device id, no account: the body is the step, the platform, the version,
 * the language, the day, whether this build came from a store, and — on the two
 * steps about the save-your-account screen — which prompt opened it, and nothing
 * else. Each step goes at most once per install — the phone remembers which it
 * has sent — which is what lets the server's plain per-day count stand for
 * "installs that got this far" without being able to tell one install from
 * another.
 *
 * The language is the phone's rather than the profile's, and read from
 * `@/messages` rather than `lib/i18n`, which would pull the auth store into this
 * file — see the note below about never being handed a session. For a first-run
 * walk the two are the same value anyway: `preferredLocale()` starts as
 * `deviceLocale()` and only diverges once somebody changes it in Settings, which
 * a new install has not done yet. Thirteen shared words, never a country: see
 * `FunnelPing` in `@ct/shared` for why the blur is the right trade here.
 *
 * A bare `fetch` rather than the `api` client, on purpose: the client attaches
 * the session token whenever there is one, and a ping sent with a token is a
 * ping the server could put a name to. Nothing here reads a session, and this
 * keeps it from ever being handed one. The queue below is this file's own for
 * the same reason — `lib/outbox.ts` is the same shape and sends through the
 * authenticated client, so it is a pattern to copy and not a thing to reuse.
 *
 * ---- Why there is a queue at all ------------------------------------------
 *
 * This used to be fire and forget, on the reasoning that a ping which never got
 * through is a number on a chart slightly too low and not worth a retry loop.
 * That reasoning was wrong in a way only production could show. On 2026-09-23 a
 * guest met the save-your-account wall, tapped it, and her `save_prompt` POST
 * landed in the ninety seconds an API container takes to come back after a
 * deploy: Caddy answered 502 and the tap was gone. The chart did not read
 * slightly low — the whole rung read zero, which is the same thing the funnel
 * says when a screen is never reached, and the two must not look alike. A ping
 * is cheap and the walk happens once per install, so there is no second chance
 * to be slightly low about.
 *
 * What is *not* here is an idempotency key. A retry whose response was lost in
 * flight counts twice, and the only way to stop that would be to send something
 * per install that the server could recognise on the second attempt — an
 * identifier, which is the one thing this file may not send. So the trade is
 * explicit: a rare over-count on a flaky connection, in exchange for never
 * silently losing the step. Over-counting is also the safer error of the two,
 * because it does not invent a cliff.
 */

const SENT_KEY = 'ct:funnel-sent:v1';
const PENDING_KEY = 'ct:funnel-pending:v1';

/**
 * What "once" means for a step that carries a reason: once per reason.
 *
 * A guest can meet the save screen more than once and from different rungs —
 * the soft ask after their first meal, then the wall when their logs run out —
 * and counting only the first would credit the whole ladder to whichever rung
 * happened to come first. The key is still not an identifier: it never leaves
 * this phone, and what goes to the server is the step and the reason.
 *
 * The stored key stays a plain string, so the `v1` list an install already has
 * keeps working: only the two reasoned steps change shape, and at worst such an
 * install sends one of them a second time.
 */
type SentKey = string;

/** A ping waiting to go out: the body the server will get, and the key it marks. */
type Pending = { key: SentKey; ping: FunnelPing };

/**
 * How long a queued ping is still worth sending, in days.
 *
 * `DAY_SLACK.behind` in `apps/api/src/services/funnel.ts` is the same number
 * from the other end — past it the server stops believing the day on the ping
 * and files it under today, which would put a screen somebody saw on Monday
 * into Thursday's column. Dropping it is the honest answer: the walk it
 * belonged to is over, and a count on the wrong day is worse than a gap.
 */
const STALE_AFTER_DAYS = 2;

/**
 * At most this many waiting at once.
 *
 * Fifteen steps is the whole walk and the reasoned ones add four, so a phone
 * that has been offline for its entire first run still fits. The cap is for the
 * case this file cannot see — a build pointed at an API that is never coming
 * back — where an uncapped queue would grow in somebody's storage forever.
 */
const MAX_PENDING = 32;

/** In-app retries before the queue waits for a foreground instead. */
const BACKOFF_MS = [5_000, 30_000, 120_000];

let sent: Promise<Set<SentKey>> | null = null;
/** Keys already queued or in flight, so a screen that remounts does not double up. */
const held = new Set<SentKey>();
let flushing = false;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (step: FunnelStep, reason?: SaveReason): SentKey =>
  reason ? `${step}:${reason}` : step;

function loadSent(): Promise<Set<SentKey>> {
  sent ??= AsyncStorage.getItem(SENT_KEY)
    .then((raw) => new Set<SentKey>(raw ? (JSON.parse(raw) as SentKey[]) : []))
    .catch(() => new Set<SentKey>());
  return sent;
}

/**
 * The queue is one value in one key, so every read-modify-write on it has to be
 * the only one running.
 *
 * Without this they are not. `reachedStep` reads the queue, appends and writes
 * it back, and two steps reached in the same tick both read the array *before*
 * either has written — so the second write lands on top of the first and the
 * first step is gone. It never comes back either: `held` remembers it as queued
 * for the rest of the session, which is the whole point of `held` and exactly
 * wrong once the ping it is holding has been overwritten.
 *
 * That is not hypothetical. `start` and `goal` are reached on the same tap —
 * the welcome button pings one and moves the walk on to the other — and 1.5.9,
 * the first build with this queue, sent `goal` 10 times and `start` never once,
 * against every earlier build sending them within one of each other. The queue
 * was written to stop a ping being lost to a 502 and lost one to itself.
 *
 * Only the read-modify-write is serialised. `flush` does its network call
 * outside the lock, because a queue that blocked every new step for the length
 * of a request would stall the walk on a slow connection to keep a count
 * tidy.
 */
let queueWork: Promise<unknown> = Promise.resolve();

function onQueue<T>(job: () => Promise<T>): Promise<T> {
  // Settled either way before the next job starts: a failed write must not take
  // the queue down with it, and every job here already handles its own storage
  // errors.
  const run = queueWork.then(job, job);
  queueWork = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function loadPending(): Promise<Pending[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending[]) : [];
  } catch {
    return [];
  }
}

async function persistPending(queue: Pending[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(queue));
  } catch {
    // Storage is full or unreadable. The ping stays in `held` for this session,
    // so it is still sent — it just no longer survives the app being killed.
  }
}

/**
 * The phone's calendar date.
 *
 * Deliberately not `lib/day.ts`: that one answers "which logging day is this",
 * which bends around the profile's `day_start_hour` and needs a session to know
 * it. The funnel groups by plain local midnight, and this file has no profile to
 * ask. Built by hand rather than from `toISOString`, which would be UTC and put
 * every evening ping in Sofia on tomorrow.
 */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysOld(day: string | undefined): number {
  if (!day) return 0;
  const then = Date.parse(`${day}T00:00:00Z`);
  const now = Date.parse(`${today()}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.round((now - then) / 86_400_000);
}

/**
 * Whether this copy of the app came from a store.
 *
 * `__DEV__` catches anything under Metro; `EXPO_PUBLIC_INTERNAL` is set by the
 * development, simulator and preview profiles in `eas.json` and by nothing else,
 * so a production build cannot carry it and a local build cannot forget it. Read
 * once at module load because neither can change while the app is running, and
 * because `process.env` is inlined at build time rather than looked up.
 *
 * It does not catch a production build on one of our own phones. Nothing could,
 * short of an identifier, which is the one thing this file may not send.
 */
const INTERNAL = __DEV__ || process.env.EXPO_PUBLIC_INTERNAL === '1';

/**
 * `reason` belongs to `save_prompt` and `account` and is refused anywhere else
 * — the server's `FunnelPing` says so, and a ping it refuses is a step that
 * never counts. Which prompt asked is the point of it: see GUEST-ACCOUNTS.md.
 */
export function reachedStep(step: FunnelStep, reason?: SaveReason): void {
  const platform = Platform.OS;
  const version = Constants.expoConfig?.version;
  if ((platform !== 'ios' && platform !== 'android') || !version) return;

  const key = keyOf(step, reason);
  if (held.has(key)) return;

  void (async () => {
    const done = await loadSent();
    if (done.has(key) || held.has(key)) return;
    held.add(key);

    const pending: Pending = {
      key,
      ping: {
        step,
        platform,
        app_version: version,
        locale: deviceLocale(),
        day: today(),
        ...(INTERNAL ? { internal: true } : {}),
        ...(reason ? { reason } : {}),
      },
    };

    const queued = await onQueue(async () => {
      const queue = await loadPending();
      if (queue.length >= MAX_PENDING) return false;
      await persistPending([...queue, pending]);
      return true;
    });
    if (!queued) {
      held.delete(key);
      return;
    }

    void flush();
  })();
}

function scheduleRetry(): void {
  if (retryTimer) return;
  const wait = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)];
  // Past the last step of the backoff the queue stops asking and waits for a
  // foreground, which is the only signal this app gets that the network may
  // have changed. A timer that kept firing would spend battery to learn nothing.
  if (failures > BACKOFF_MS.length) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, wait);
}

/**
 * Sends what is waiting, oldest first.
 *
 * One at a time rather than in parallel: the route allows sixty pings an hour
 * from one address and a whole walk is fifteen, so there is no reason to race,
 * and a burst from a phone that has just come back into signal is exactly the
 * shape that limit is there to bound.
 */
async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const queue = await onQueue(loadPending);
      const next = queue[0];
      if (!next) break;

      /*
       * Too old to be true. Dropped rather than sent, because the server would
       * file it under today — see `STALE_AFTER_DAYS`.
       */
      if (daysOld(next.ping.day) > STALE_AFTER_DAYS) {
        held.delete(next.key);
        await onQueue(async () => persistPending((await loadPending()).filter((p) => p.key !== next.key)));
        continue;
      }

      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/funnel`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next.ping),
        });
      } catch {
        // Offline, or nothing is listening. Keep it and come back.
        failures += 1;
        scheduleRetry();
        return;
      }

      /*
       * A 5xx is the deploy window this queue was written for, and a 429 is the
       * rate limit telling us to slow down: both are worth trying again. A 4xx
       * is the server saying this body is wrong — a step it does not know, a
       * reason on the wrong step — and no amount of retrying will change its
       * mind, so it is dropped and marked done rather than blocking everything
       * queued behind it forever.
       */
      if (!response.ok && (response.status >= 500 || response.status === 429)) {
        failures += 1;
        scheduleRetry();
        return;
      }

      failures = 0;
      const done = await loadSent();
      done.add(next.key);
      try {
        await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...done]));
      } catch {
        // At worst this step is sent once more on a later launch.
      }

      /*
       * Re-read rather than writing back the array from the top of the loop. A
       * step reached while that request was in flight is already in the queue,
       * and persisting a copy taken before it arrived would drop it — the one
       * bug in a queue that nobody would ever reproduce on purpose.
       */
      await onQueue(async () => persistPending((await loadPending()).filter((p) => p.key !== next.key)));
      held.delete(next.key);
    }
  } finally {
    flushing = false;
  }
}

/**
 * Starts the queue draining itself.
 *
 * Foreground rather than a poll, for the reason `lib/outbox.ts` gives: that is
 * when connectivity actually changes from this app's point of view. Unlike the
 * outbox it is not gated on a session and must never be — most of the walk
 * happens before there is an account, and the steps worth the most are the ones
 * an install that never signs up sends.
 */
export function watchFunnel(): () => void {
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      // A fresh foreground is a fresh chance, not a continuation of the backoff.
      failures = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void flush();
    }
  });

  void flush();
  return () => subscription.remove();
}
