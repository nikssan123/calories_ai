import { describe, expect, it } from 'vitest';
import { AGREE_GAP_MS, READS_TO_AGREE, agreeRead, type ReadStreak } from '@ct/shared';

/** Feeds a run of frames through, the way a scanner loop does. */
function frames(codes: Array<[string, number]>): boolean[] {
  let streak: ReadStreak | null = null;
  return codes.map(([code, at]) => {
    const read = agreeRead(streak, code, at);
    streak = read.streak;
    return read.agreed;
  });
}

describe('agreeRead', () => {
  it('acts only once the same code has come back on enough frames', () => {
    const agreed = frames(Array.from({ length: READS_TO_AGREE }, (_, i) => ['5900951310843', i * 100]));
    expect(agreed.slice(0, -1).every((a) => !a)).toBe(true);
    expect(agreed.at(-1)).toBe(true);
  });

  // The Snickers from 2026-09-13: two checksum-valid misreads, one frame each.
  it('never acts on a misread that shows up on one frame between true reads', () => {
    const agreed = frames([
      ['9040961310856', 0],
      ['5900951310843', 100],
      ['4404931310843', 200],
      ['5900951310843', 300],
      ['5900951310843', 400],
      ['5900951310843', 500],
    ]);
    expect(agreed).toEqual([false, false, false, false, false, true]);
  });

  it('does not add a read from a moment ago to one from now', () => {
    const codes: Array<[string, number]> = Array.from({ length: READS_TO_AGREE }, (_, i) => [
      '5900951310843',
      i * (AGREE_GAP_MS + 1),
    ]);
    expect(frames(codes).some(Boolean)).toBe(false);
  });
});
