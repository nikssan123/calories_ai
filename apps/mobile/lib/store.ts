import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DaySummary, MealTemplate, Profile } from '@ct/shared';

/**
 * What the phone keeps when the network is gone.
 *
 * Until this existed the app persisted two things — the session token and the
 * theme — and every screen was fetch-on-mount. That is not an app that degrades
 * offline; it is an app that shows an empty day and a ring at zero, which is a
 * lie about what somebody ate rather than an absence of information.
 *
 * Three things are cached and nothing else: the last few days, the meal
 * templates that make up the offline catalogue, and the profile — needed for
 * `timezone` and `day_start_hour`, without which the phone cannot even work out
 * which day a meal belongs to. See OFFLINE.md §3.
 *
 * **AsyncStorage rather than SQLite**, and it is not close. The working set is
 * one day of entries and eight templates — kilobytes. `expo-sqlite` is a native
 * module: a rebuild, a new binary through review, and a schema to migrate on
 * devices we cannot inspect. Read-modify-write of a JSON blob is enough for
 * this shape of data, and the UI reads through the hooks below rather than the
 * storage, so a later move to SQLite changes this file and nothing else.
 *
 * Everything here fails soft. A cache that throws is a cache miss — there is
 * always a network path behind it, and a corrupt blob must never be the reason
 * somebody cannot open their food journal.
 */

/**
 * Bumped when a cached shape changes in a way an old blob would survive
 * silently. Everything under a superseded version is simply unreachable, which
 * is the correct amount of ceremony for data the server still holds.
 */
const VERSION = 'v1';

/**
 * Keys are namespaced by user, because a phone is shared and an account is not.
 * Signing out and in as somebody else must not show the previous account's
 * meals for the second it takes the first fetch to land.
 */
function keyFor(userId: string, name: string): string {
  return `ct:${VERSION}:${userId}:${name}`;
}

async function read<T>(userId: string, name: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, name));
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

async function write(userId: string, name: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId, name), JSON.stringify(value));
  } catch {
    // A full disk is not worth interrupting a meal being logged over. The
    // request still goes out; only the offline copy is lost.
  }
}

// ---- Days ------------------------------------------------------------------

/**
 * How many days are kept.
 *
 * Seven, because History is a grid somebody scrolls and Today is a screen they
 * open — and the only day worth having offline is one they have already looked
 * at. Beyond a week the cache would be keeping days to answer a question nobody
 * asks without a network.
 */
const DAY_LIMIT = 7;

type DayCache = Record<string, DaySummary>;

export async function cachedDay(userId: string, localDate: string): Promise<DaySummary | null> {
  const days = await read<DayCache>(userId, 'days');
  return days?.[localDate] ?? null;
}

export async function cacheDay(userId: string, day: DaySummary): Promise<void> {
  const days = (await read<DayCache>(userId, 'days')) ?? {};
  days[day.local_date] = day;

  // Trimmed by date rather than by insertion order: the seven most recent days
  // are the ones worth holding, and a user browsing back through March should
  // not evict today on the way.
  const keep = Object.keys(days).sort().slice(-DAY_LIMIT);
  const trimmed: DayCache = {};
  for (const date of keep) trimmed[date] = days[date]!;

  await write(userId, 'days', trimmed);
}

// ---- The offline catalogue -------------------------------------------------

/**
 * The eight things this person actually eats.
 *
 * The most valuable thing in the cache by some distance. With these, offline
 * logging is "yesterday's lunch, again" — one tap — rather than typing four
 * macros per item into a form. Manual entry is the fallback; this is the path.
 */
export async function cachedTemplates(userId: string): Promise<MealTemplate[] | null> {
  return read<MealTemplate[]>(userId, 'templates');
}

export async function cacheTemplates(userId: string, meals: MealTemplate[]): Promise<void> {
  await write(userId, 'templates', meals);
}

// ---- Profile ---------------------------------------------------------------

export async function cachedProfile(userId: string): Promise<Profile | null> {
  return read<Profile>(userId, 'profile');
}

export async function cacheProfile(userId: string, profile: Profile): Promise<void> {
  await write(userId, 'profile', profile);
}

// ---- Clearing --------------------------------------------------------------

/**
 * Everything this account left behind, on the way out.
 *
 * Called on sign-out. Not a security measure — the token is gone and the data
 * is the user's own — but leaving a stale day on disk means the next person to
 * sign in on this phone waits for a fetch while somebody else's breakfast is on
 * the screen.
 */
export async function forgetUser(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((key) => key.startsWith(`ct:${VERSION}:${userId}:`));
    if (mine.length > 0) await AsyncStorage.multiRemove(mine);
  } catch {
    // Nothing to do about it, and nothing that depends on it having worked.
  }
}
