/**
 * When a barcode off the camera is believed.
 *
 * A single decoded frame is not. On 2026-09-13 a Snickers bar went to the API
 * as 9040961310856, then 4404931310843, and only on the third scan as
 * 5900951310843 — and both wrong reads carry a valid EAN-13 check digit. The
 * checksum catches one bad digit; a shiny, creased wrapper at an angle gets
 * several wrong at once, and some of those land on a number that still adds up.
 * Each one was a lookup, a "not catalogued" card, and a tap to try again.
 *
 * What the misreads do not do is repeat. The camera decodes several frames a
 * second, and the true code comes back on every one of them while a glare
 * misread comes back on one. So a read counts once enough frames in a row agree
 * on it — a fraction of a second on a packet held still, and nothing to
 * a person, against a wrong card that costs them three taps.
 */

/** Frames that must decode to the same code before it is looked up. */
export const READS_TO_AGREE = 3;

/**
 * How far apart two agreeing reads may be and still count as consecutive.
 *
 * Wide enough for the slowest loop — the web decodes a frame every 220ms plus
 * however long zxing takes — and narrow enough that a code glimpsed a moment
 * ago and a code glimpsed now are not added together.
 */
export const AGREE_GAP_MS = 1000;

export interface ReadStreak {
  code: string;
  count: number;
  at: number;
}

/**
 * Folds one decoded frame into the streak. Returns the new streak and whether
 * the code has now been read enough times to act on.
 *
 * A different code restarts the count rather than subtracting from it: a
 * misread interleaved with the true code is exactly the wrapper this is for,
 * and the true code will be back on the next frame.
 */
export function agreeRead(
  streak: ReadStreak | null,
  code: string,
  now: number = Date.now(),
): { streak: ReadStreak; agreed: boolean } {
  const next =
    streak && streak.code === code && now - streak.at <= AGREE_GAP_MS
      ? { code, count: streak.count + 1, at: now }
      : { code, count: 1, at: now };
  return { streak: next, agreed: next.count >= READS_TO_AGREE };
}
