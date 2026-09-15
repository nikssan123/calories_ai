import type { CastName } from '@ct/shared/cast';
import { ACHIEVEMENT_GROUPS, type AchievementGroupKey, type AchievementKey, type DaySummary } from '@ct/shared';

/**
 * What the session remembers about the cast (CAST.md, fourth pass).
 *
 * Kept free of React and React Native, because the day snapshot the widgets
 * draw from reads it too, and the headless widget handler must not drag a UI
 * tree along.
 *
 * - `lastCatch`: who caught the last meal in the journal, and which. Today's
 *   shelf cheers it once (`greeted`), and the widget draws that character.
 */
export const castMemory: {
  lastCatch: { name: CastName; entryId: string } | null;
  greeted: string | null;
  /** Badges a day read said were just earned, until a screen on show has shown where they went. */
  pendingBadges: AchievementKey[];
} = {
  lastCatch: null,
  greeted: null,
  pendingBadges: [],
};

/** Queues whatever a fresh day says was just earned. Call it wherever a day arrives from the server. */
export function noteEarned(day: DaySummary | null | undefined) {
  for (const badge of day?.earned ?? []) {
    if (!castMemory.pendingBadges.includes(badge.key)) castMemory.pendingBadges.push(badge.key);
  }
}

/** The next badge to show off, taken off the queue. */
export function takeBadge(): AchievementKey | null {
  return castMemory.pendingBadges.shift() ?? null;
}

/**
 * Who holds a badge up, by the group it belongs to — by temperament: Ember is
 * momentum, so runs and training; Skye is curiosity, so firsts; Plum is the
 * look back, so totals.
 */
const HOLDER: Record<AchievementGroupKey, CastName> = {
  streaks: 'ember',
  training: 'ember',
  firsts: 'skye',
  totals: 'plum',
};

const GROUP_OF = new Map<AchievementKey, AchievementGroupKey>(
  ACHIEVEMENT_GROUPS.flatMap((group) => group.keys.map((key) => [key, group.key] as const)),
);

export const holderOf = (key: AchievementKey): CastName => HOLDER[GROUP_OF.get(key) ?? 'firsts'];
