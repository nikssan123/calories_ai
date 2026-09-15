import { useEffect, useState } from 'react';
import { dayPartAt, type DayPart } from '@/theme';
import type { Accessory, CastName } from './figure';

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
  name: CastName;
  /** Play it, or return false if this figure can't right now. */
  fidget: (kind: Fidget) => boolean;
  /** The centre of the figure across the window, once it has been laid out. */
  x: () => number | null;
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
const EYES: Fidget[] = ['lookLeft', 'lookRight', 'lookUp'];

/**
 * The director (CAST.md, fourth pass): what makes three timers read as three
 * somebodies who can see each other.
 *
 * - **Glances follow the mover.** When one of them does anything, each of the
 *   others looks toward them, some of the time and a beat later.
 * - **Yawns are catching.** After Plum yawns, Skye sometimes yawns too.
 * - **One big move at a time, and not often.** A stretch, a wave, a yawn or a
 *   hop starts a cooldown across the screen; until it ends, only eyes move.
 */
const GLANCE_CHANCE = 0.4;
const YAWN_CATCH_CHANCE = 0.5;
const BIG_COOLDOWN_MS = 8000;

const actors = new Set<Actor>();
let timer: ReturnType<typeof setTimeout> | null = null;
let lastBig = 0;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const later = (ms: number, fn: () => void) => setTimeout(fn, ms);

function schedule() {
  if (timer || actors.size === 0) return;
  timer = setTimeout(tick, 2800 + Math.random() * 2700);
}

/** Every other figure looks toward `x`, some of the time. */
function lookToward(x: number | null, mover: Actor | null, chance: number) {
  if (x === null) return;
  for (const other of actors) {
    if (other === mover || Math.random() > chance) continue;
    const at = other.x();
    if (at === null || Math.abs(at - x) < 4) continue;
    const kind: Fidget = x < at ? 'lookLeft' : 'lookRight';
    later(150 + Math.random() * 150, () => {
      if (actors.has(other)) other.fidget(kind);
    });
  }
}

function tick() {
  timer = null;
  const everyone = [...actors];
  const resting = Date.now() - lastBig < BIG_COOLDOWN_MS;
  for (let tries = 0; tries < 5 && everyone.length > 0; tries++) {
    const who = pick(everyone);
    const kind = pick(resting ? EYES : BAG);
    if (!who.fidget(kind)) continue;
    if (!EYES.includes(kind)) {
      lastBig = Date.now();
      lookToward(who.x(), who, GLANCE_CHANCE);
    }
    if (kind === 'yawn' && who.name === 'plum' && Math.random() < YAWN_CATCH_CHANCE) {
      const skye = everyone.find((actor) => actor.name === 'skye');
      if (skye) later(1500, () => actors.has(skye) && skye.fidget('yawn'));
    }
    break;
  }
  schedule();
}

/**
 * Everyone on screen who isn't `except` looks toward a point — the card a meal
 * just landed on, say. Unlike a fidget this always asks all of them.
 */
export function glanceToward(x: number, except?: CastName) {
  for (const other of actors) {
    if (other.name === except) continue;
    const at = other.x();
    if (at === null || Math.abs(at - x) < 4) continue;
    const kind: Fidget = x < at ? 'lookLeft' : 'lookRight';
    later(120 + Math.random() * 180, () => {
      if (actors.has(other)) other.fidget(kind);
    });
  }
}

/** Everyone on screen who isn't `name` looks toward whoever is — the one who just perked up. */
export function glanceAt(name: CastName) {
  const who = [...actors].find((actor) => actor.name === name && actor.x() !== null);
  const x = who?.x();
  if (x !== null && x !== undefined) glanceToward(x, name);
}

/** Everyone on screen does the same small thing: all eyes up at a new arrival. */
export function lookAll(kind: Fidget) {
  for (const actor of actors) {
    later(Math.random() * 200, () => {
      if (actors.has(actor)) actor.fidget(kind);
    });
  }
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

/**
 * What they wear this time of year, read from the phone's month: a scarf from
 * December to February, a flower from March to May, a leaf from September to
 * November, and nothing over the summer.
 *
 * Northern-hemisphere seasons, because that's where every language the app
 * speaks is spoken. Read once per mount, since the month doesn't change while
 * anybody watches.
 */
export function seasonAt(date: Date): Accessory | null {
  const month = date.getMonth();
  if (month === 11 || month <= 1) return 'scarf';
  if (month <= 4) return 'flower';
  if (month >= 8) return 'leaf';
  return null;
}

export function useSeason(): Accessory | null {
  const [season] = useState(() => seasonAt(new Date()));
  return season;
}
