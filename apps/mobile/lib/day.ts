import type { DaySummary, PendingFood, Profile } from '@ct/shared';
import { foldPending, localDateFor } from '@ct/shared';
import { api } from '@/lib/api';
import { cacheDay, cachedDay } from '@/lib/store';
import type { Intent } from '@/lib/outbox';

/**
 * A day, however the phone can get one.
 *
 * Three sources, in order of authority: the server, the cache, and the outbox.
 * The screen asks for a day and gets the best available answer plus a flag
 * saying whether it came from the network — which is the only thing the UI
 * needs to know to tell the truth about being offline.
 *
 * The arithmetic is not here. `foldPending` in `@ct/shared` does it, because it
 * is pure and this phone has no test runner to check it with — what is left in
 * this file is the part that genuinely belongs to a device: which day is today
 * according to this clock, and what to show when the server cannot be reached.
 *
 * See OFFLINE.md §3 and §4.
 */

export interface LoadedDay {
  day: DaySummary;
  /** False when this came off disk because the network could not be reached. */
  live: boolean;
}

/** The day the phone thinks it is, without asking. */
export function localToday(profile: Profile): string {
  return localDateFor(new Date(), {
    timezone: profile.timezone,
    dayStartHour: profile.day_start_hour,
  });
}

/**
 * Fetches, and falls back to what was last seen.
 *
 * A cached day is served *only* when the network genuinely could not answer —
 * never to make the screen feel faster. Showing yesterday's copy of today while
 * a perfectly good request is in flight is how a total ends up wrong on a
 * screen that had every opportunity to be right.
 *
 * A miss on both throws, because there is nothing honest left to draw: a day
 * that has never been fetched and cannot be fetched is unknown, and a ring at
 * zero would claim it was empty.
 */
export async function loadDay(userId: string, localDate: string | null): Promise<LoadedDay> {
  try {
    const day = await api.day(localDate ?? undefined);
    void cacheDay(userId, day);
    return { day, live: true };
  } catch (error) {
    // Without a date there is nothing to look up — "today" is a question only
    // the server's idea of the clock can answer, so the caller resolves it
    // first and the cache has something to be keyed by.
    const fallback = localDate === null ? null : await cachedDay(userId, localDate);
    if (!fallback) throw error;
    return { day: fallback, live: false };
  }
}

/** The day as it stands, including everything still sitting in the queue. */
export function withPending(day: DaySummary, intents: Intent[]): DaySummary {
  return foldPending(day, {
    added: intents.map(asPendingFood).filter((food): food is PendingFood => food !== null),
    removed: intents.filter((i) => i.kind === 'delete').map((i) => i.entryId),
    patched: intents
      .filter((i) => i.kind === 'patch')
      .map((i) => ({
        entryId: i.entryId,
        meal: i.patch.meal,
        description: i.patch.description,
        note: i.patch.note,
        items: i.patch.items,
      })),
  });
}

/** The ids of everything on this day that has not reached the server. */
export function pendingIds(intents: Intent[], localDate: string): Set<string> {
  return new Set(
    intents
      .map(asPendingFood)
      .filter((food): food is PendingFood => food !== null && food.localDate === localDate)
      .map((food) => food.id),
  );
}

/**
 * The two intents that put a new meal on a day, as that meal.
 *
 * A repeat becomes one item rather than the original's list: the template
 * carries per-item calories but not per-item macros, and inventing a split so
 * the card looks detailed would put four made-up numbers on screen to save a
 * line of layout. The totals are right, which is what the ring reads.
 */
function asPendingFood(intent: Intent): PendingFood | null {
  if (intent.kind === 'create') {
    return {
      id: intent.id,
      localDate: intent.localDate,
      meal: intent.payload.meal ?? 'snack',
      description: intent.payload.description,
      eatenAt: intent.payload.eaten_at ?? intent.queuedAt,
      note: intent.payload.note ?? null,
      // What `POST /entries/food` will actually write, so nothing on screen
      // changes when the send lands.
      source: 'manual',
      confidence: 'high',
      items: intent.payload.items,
    };
  }

  if (intent.kind === 'repeat') {
    const { preview } = intent;
    return {
      id: intent.id,
      localDate: intent.localDate,
      meal: intent.meal ?? 'snack',
      description: preview.description,
      eatenAt: intent.queuedAt,
      note: null,
      source: 'quick',
      // The estimate is being reused verbatim, so it is no more certain than it
      // was the first time — matching what `repeatFoodEntry` records.
      confidence: 'medium',
      items: [
        {
          name: preview.description,
          quantity_g: null,
          quantity_desc: null,
          kcal: preview.kcal,
          protein_g: preview.protein_g,
          carbs_g: preview.carbs_g,
          fat_g: preview.fat_g,
          fiber_g: null,
          sodium_mg: null,
          sat_fat_g: null,
          sugar_g: null,
        },
      ],
    };
  }

  return null;
}
