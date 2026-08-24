/**
 * Turning data into the words a sentence needs.
 *
 * Shared rather than kept beside a caller because both halves of Cook, both
 * recipe screens and both clients say these same sentences about the same
 * pantry — and a second copy would be the kind that drifts a comma at a time.
 */

/**
 * "chicken, garlic and spinach" — a sentence, not a comma-separated list.
 *
 * Lives here rather than beside one of its callers because both halves of Cook
 * and both recipe pages say this same sentence about the same pantry.
 */
export function listWords(items: string[]): string {
  const lower = items.map((i) => i.toLowerCase());
  if (lower.length === 1) return lower[0]!;
  if (lower.length === 2) return `${lower[0]} and ${lower[1]}`;
  return `${lower.slice(0, -1).join(', ')} and ${lower.at(-1)}`;
}

/**
 * "in about 3 hours" — how long until a rolling window lets go.
 *
 * Deliberately vague at the top end and precise at the bottom. Somebody told
 * "in 2 hours 47 minutes" reads it as a promise and comes back to check; the
 * useful information is only ever whether this is worth waiting for or worth
 * coming back tomorrow for.
 */
export function untilWords(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'in a moment';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return 'in about an hour';
  if (hours < 24) return `in about ${hours} hours`;
  if (hours < 48) return 'tomorrow';
  /*
   * Past a day the vagueness has to keep scaling, and it did not.
   *
   * This used to end at 'tomorrow', which was true for every caller it had: the
   * recipe budget is a rolling twenty-four hours and can never point further
   * out than that. The monthly meters can — a spent journal allowance comes
   * back when the oldest turn ages out of a *thirty*-day window — and 'tomorrow'
   * for something four weeks away is not vague, it is wrong, and it is wrong in
   * the direction that brings somebody back to find nothing.
   */
  const days = Math.round(hours / 24);
  if (days < 14) return `in ${days} days`;
  if (days < 45) return 'in a few weeks';
  return 'in a while';
}
