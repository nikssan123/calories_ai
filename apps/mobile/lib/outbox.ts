import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppState, type AppStateStatus } from 'react-native';
import { ApiError } from '@ct/api-client';
import type { LogFoodRequest, Meal } from '@ct/shared';
import { api } from '@/lib/api';

/**
 * The meals that have been logged but not yet sent.
 *
 * A failed send already reconciles honestly — it asks the server what actually
 * landed rather than assuming — but it has never held the message and tried
 * again. Phones lose signal in supermarkets, gyms and lifts, which is precisely
 * where and when people log food. "I will send this when you are back" is the
 * difference between an app you rely on and one you learn not to trust in a
 * basement. See MOBILE-UX.md §5 and OFFLINE.md §4.
 *
 * Intents, not entries. What is queued is "log this meal", not a row waiting
 * for an id — which is what lets the same queue carry a deletion of something
 * that was never sent in the first place.
 */

const KEY = 'ct:outbox:v1';

/**
 * `localDate` is carried rather than derived.
 *
 * A create and a repeat both put a *new* entry on a specific day, and which day
 * that is depends on the profile's `day_start_hour` — so the screen that queued
 * it, holding the profile and already showing that day, is the only place that
 * knows the answer for certain. Working it back out of a timestamp later would
 * be a second, worse answer to a settled question, and it would put a queued
 * meal on the wrong day for anyone whose day does not start at midnight.
 */
export type Intent =
  | {
      kind: 'create';
      id: string;
      userId: string;
      localDate: string;
      payload: LogFoodRequest;
      queuedAt: string;
    }
  | {
      kind: 'repeat';
      id: string;
      userId: string;
      localDate: string;
      entryId: string;
      meal?: Meal;
      /** Everything the optimistic copy needs before the server answers. */
      preview: { description: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number };
      queuedAt: string;
    }
  | { kind: 'delete'; id: string; userId: string; entryId: string; queuedAt: string }
  | {
      kind: 'patch';
      id: string;
      userId: string;
      entryId: string;
      patch: Parameters<typeof api.updateFoodEntry>[1];
      queuedAt: string;
    };

/** A `client_id` for the API, and the local id of the intent that carries it. */
export function newId(): string {
  return Crypto.randomUUID();
}

// ---- Storage ---------------------------------------------------------------

let queue: Intent[] | null = null;
const listeners = new Set<(pending: Intent[]) => void>();

async function load(): Promise<Intent[]> {
  if (queue) return queue;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    queue = raw === null ? [] : (JSON.parse(raw) as Intent[]);
  } catch {
    // An unreadable queue is an empty one. Losing a queued meal is bad; failing
    // to open the app because of a bad blob is worse, and unrecoverable.
    queue = [];
  }
  return queue;
}

async function persist(next: Intent[]): Promise<void> {
  queue = next;
  for (const listener of listeners) listener(next);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // In memory it is still correct for this session, which is the case that
    // matters — the flush below is about to try sending it anyway.
  }
}

/**
 * Told when an intent is thrown away because the server refused it.
 *
 * Without this a 400 is a meal that silently ceases to exist: the row leaves
 * the queue, the optimistic copy leaves the screen, and nobody is told that
 * what they logged is not logged. Dropping it is right — it will never
 * succeed — but doing so quietly is how somebody's dinner disappears overnight.
 */
const rejections = new Set<(intent: Intent, reason: string) => void>();

export function onRejected(listener: (intent: Intent, reason: string) => void): () => void {
  rejections.add(listener);
  return () => rejections.delete(listener);
}

/** Everything still waiting, for the screens that draw it. */
export async function pending(): Promise<Intent[]> {
  return [...(await load())];
}

export function subscribe(listener: (pending: Intent[]) => void): () => void {
  listeners.add(listener);
  if (queue) listener(queue);
  return () => listeners.delete(listener);
}

// ---- Queueing --------------------------------------------------------------

export async function enqueue(intent: Intent): Promise<void> {
  const current = await load();
  await persist([...current, intent]);
  void flush();
}

/**
 * Drops an intent that has not been sent.
 *
 * How a pending meal is deleted: there is no entry on the server to remove, so
 * removing it is forgetting we meant to create one. A `delete` intent for an id
 * the server has never seen would be a 404 the queue could not act on.
 */
export async function drop(intentId: string): Promise<void> {
  const current = await load();
  await persist(current.filter((intent) => intent.id !== intentId));
}

// ---- Flushing --------------------------------------------------------------

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Capped exponential backoff, so a long outage is not a busy loop. */
const BACKOFF_MS = [2_000, 10_000, 30_000, 120_000];
let failures = 0;

function scheduleRetry(): void {
  if (retryTimer) return;
  const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, wait);
}

/**
 * Whether this failure is worth trying again.
 *
 * The whole connectivity check, and the reason no NetInfo dependency was added:
 * `ApiError` carries a status, and a transport failure throws without one. That
 * distinction is exactly what we need to know.
 *
 * - **No status** — never reached the API. Keep it and back off.
 * - **5xx / 429** — reached a server that could not answer. Keep it.
 * - **401 / 403** — kept too, which is the exception worth stating. The request
 *   was refused for who was asking rather than for what was asked, and that can
 *   change: a session expires, they sign back in, and the meal they logged this
 *   morning is still the meal they ate. Throwing away somebody's food log
 *   because a token lapsed is the wrong way round.
 * - **Any other 4xx** — the server understood and refused, and will refuse the
 *   retry too. Drop it and say so. A queue that retries a 400 forever is a
 *   queue that never drains, and it blocks every meal behind it.
 */
function worthRetrying(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 401 || error.status === 403) return true;
  return error.status >= 500 || error.status === 429;
}

async function send(intent: Intent): Promise<void> {
  switch (intent.kind) {
    case 'create':
      await api.logFoodEntry(intent.payload);
      return;
    case 'repeat':
      await api.repeatFoodEntry(intent.entryId, { meal: intent.meal, client_id: intent.id });
      return;
    case 'delete':
      await api.deleteFoodEntry(intent.entryId);
      return;
    case 'patch':
      await api.updateFoodEntry(intent.entryId, intent.patch);
      return;
  }
}

/**
 * Sends what it can, oldest first, and stops at the first thing it cannot.
 *
 * Serial and in order, because the queue is a history and reordering it
 * corrupts the result: a delete that overtakes the create it refers to leaves
 * the meal on the server forever. Stopping at the first transport failure is
 * the same argument — if the network is gone it is gone for the next one too,
 * and racing through the rest only burns battery to produce identical errors.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    for (;;) {
      const next = (await load())[0];
      if (!next) break;

      try {
        await send(next);
      } catch (error) {
        if (worthRetrying(error)) {
          failures += 1;
          scheduleRetry();
          return;
        }
        // Refused rather than unreachable. Dropping it is the only way the
        // queue behind it ever moves — but the user is told, because the meal
        // they logged is now not logged and nothing else on screen says so.
        const reason = error instanceof ApiError ? error.message : 'It could not be saved.';
        for (const listener of rejections) listener(next, reason);
      }

      /*
       * Re-read rather than carrying a local copy across the await. A meal
       * logged while that request was in flight is already in the queue, and
       * writing back an array captured before it arrived would drop it — the
       * one bug in a queue that nobody would ever reproduce on purpose.
       */
      const live = await load();
      await persist(live.filter((intent) => intent.id !== next.id));
    }
    failures = 0;
  } finally {
    flushing = false;
  }
}

/**
 * Starts the queue draining itself.
 *
 * Foreground rather than a poll, because that is when connectivity actually
 * changes from this app's point of view: a phone that came back into signal in
 * somebody's pocket has nothing to tell us until they look at it again, and by
 * then the meal is already an hour old either way.
 */
export function watch(): () => void {
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
