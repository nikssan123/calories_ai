import { useEffect, useState } from 'react';
import { dayPartAt, type DayPart } from '@/theme';

/**
 * Idle life: the small thing one of them does every few seconds.
 *
 * Breathing and blinking on a timer read as a loop, and a loop reads as a
 * machine. What makes three figures read as somebody is an occasional,
 * unscheduled, *single* action: a glance, a stretch, a yawn. That's this.
 *
 * **One at a time, app-wide.** Every figure that can fidget registers while its
 * screen is focused, and one timer picks one of them. Only one screen is
 * focused at a time, so that is one fidget at a time per screen, with no
 * provider to thread through the tree. Two at once is the moment it starts to
 * look choreographed.
 *
 * **Random, every 2.8 to 5.5 seconds.** A pattern anybody can see stops being
 * life. A figure that can't do what was drawn (a sleeping one can't wave, a
 * holding one can't stretch without dropping what it holds) declines, and the
 * timer tries somebody else.
 *
 * Nothing registers under Reduce Motion; `Character` sees to that.
 */
export type Fidget = 'lookLeft' | 'lookRight' | 'lookUp' | 'stretch' | 'wave' | 'yawn' | 'hop';

export interface Actor {
  /** Play it, or return false if this figure can't right now. */
  fidget: (kind: Fidget) => boolean;
}

/** Weighted by repetition: eyes do most of it, bigger moves are rarer. */
const BAG: Fidget[] = [
  'lookLeft',
  'lookLeft',
  'lookLeft',
  'lookRight',
  'lookRight',
  'lookRight',
  'lookUp',
  'stretch',
  'stretch',
  'wave',
  'yawn',
  'yawn',
  'hop',
  'hop',
];

const actors = new Set<Actor>();
let timer: ReturnType<typeof setTimeout> | null = null;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

function schedule() {
  if (timer || actors.size === 0) return;
  timer = setTimeout(tick, 2800 + Math.random() * 2700);
}

function tick() {
  timer = null;
  const everyone = [...actors];
  for (let tries = 0; tries < 5 && everyone.length > 0; tries++) {
    if (pick(everyone).fidget(pick(BAG))) break;
  }
  schedule();
}

/** Registers an actor for as long as it is non-null. */
export function useLife(actor: Actor | null) {
  useEffect(() => {
    if (!actor) return;
    actors.add(actor);
    schedule();
    return () => {
      actors.delete(actor);
      if (actors.size === 0 && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [actor]);
}

/** The part of the day, re-read once a minute, for the scenes. Same clock as `useSky`. */
export function useDayPart(): DayPart {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return dayPartAt(now);
}
