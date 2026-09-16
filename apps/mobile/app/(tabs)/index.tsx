import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused, useRouter } from 'expo-router';
import type {
  Allowance,
  ChatAction,
  ChatMessage,
  ChatRole,
  ChatStreamEvent,
  DaySummary,
  FoodItemInput,
  Meal,
  MessageScan,
  UnitSystem,
} from '@ct/shared';
import {
  formatMass,
  formatNumber,
  formatServings,
  inferMeal,
  isDeletion,
  meterSpent,
  unitsOf,
} from '@ct/shared';
import { ChatActionCard } from '@/components/ChatCard';
import { BarcodeGlyph, Composer, type ComposerPayload } from '@/components/Composer';
import { FoodEditor } from '@/components/FoodEditor';
import { Markdown } from '@/components/Markdown';
import { Material } from '@/components/Material';
import { PressableChunk } from '@/components/Chunk';
import { CastPlate } from '@/components/cast/Plate';
import { CardPeek, CastLedge, dominant } from '@/components/cast/Presence';
import type { CastName, Cue } from '@/components/cast/Character';
import { bounceTab, claimAll, spark, useAnchor, visit } from '@/components/cast/stage';
import { castMemory, holderOf, noteEarned, takeBadge } from '@/lib/cast-memory';
import { glanceAt, lookAll, useDayPart } from '@/components/cast/life';
import { castForDraft } from '@/lib/food-cast';
import { markMomentShown, momentShown } from '@/lib/store';
import { Serif } from '@/components/Serif';
import { greetingFor } from '@/lib/greeting';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { MomentBurst, MomentCard, useStreakMoment, type Milestone } from '@/components/cast/StreakMoment';
import { ReminderInvite } from '@/components/ReminderInvite';
import { MeterChip, PencilGlyph, PlanWall } from '@/components/PlanWall';
import { Skeleton } from '@/components/Skeleton';
import { Sky, useSky } from '@/components/Sky';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { useCountUp } from '@/hooks/useCountUp';
import { useToast } from '@/components/Toast';
import { api, planLimitOf } from '@/lib/api';
import { uploadPhotoFile } from '@/lib/image';
import { useAuth } from '@/lib/auth';
import { useEntitlements } from '@/lib/entitlements';
import { useSaveAccount } from '@/lib/save-account';
import { enqueue, newId } from '@/lib/outbox';
import { useOutbox } from '@/hooks/useOutbox';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { duration, ease, font, type as t, useColors, useType } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptics } from '@/lib/haptics';
import { onEntryRemoved } from '@/lib/removals';
import { writeDaySnapshot } from '@/lib/snapshot';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { useUnits } from '@/lib/units';
import { CoachBubble } from '@/components/CoachBubble';

/** Optimistic rows carry a local id until the server assigns the real one. */
interface Bubble {
  key: string;
  role: ChatRole;
  content: string;
  photoUrl?: string;
  pending?: boolean;
  failed?: boolean;
  actions?: ChatAction[];
  /**
   * Packets scanned into this message, as words rather than as codes.
   *
   * Drawn under the sentence they were assembled with, because without them
   * the bubble is only the typed half of what was said and the reply below it
   * names foods that appear nowhere above.
   */
  scanned?: MessageScan[];
  /**
   * This turn just happened, rather than having been read back from the
   * server. The only thing it changes is whether a correction wears its ring:
   * reopening the app must not flash every correction in the last forty
   * messages, because none of them is news any more.
   */
  live?: boolean;
  /**
   * The tool the model is running right now, while this row is still pending.
   * Set from the stream and cleared when text starts arriving again, so the
   * wait says "logging food" rather than nothing.
   */
  tool?: string;
  /**
   * What the turn said on its way to the answer — the sentence before a tool
   * call, which the server does not persist. Shown while the row is pending
   * and dropped when the reply lands. See `applyEvent`.
   */
  steps?: string[];
  /**
   * This turn was refused because the plan is spent, and the row is the wall
   * rather than a reply.
   *
   * A field on the bubble rather than a modal over the screen, and that is the
   * whole design: the refusal lands in the transcript where the answer would
   * have been, scrolls with it, and is still there tomorrow. Nothing is
   * dismissed and nothing is covered — see `PlanWall`.
   *
   * `text` is what they were trying to say, carried so the manual form can open
   * with their own sentence already in it.
   */
  wall?: { allowance: Allowance | null; message: string; text: string };
  /**
   * A streak milestone, said in the conversation rather than in a modal over it
   * (CAST.md, fourth pass). Local: it lasts the session, like a wall.
   */
  moment?: Milestone;
}

/** Near enough to the end that a new message should still carry the view. */
const NEAR_BOTTOM_PX = 64;

/**
 * How long to wait before asking a second time about a turn that died at the
 * transport.
 *
 * Long enough to be on the other side of a resume — iOS freezes JS in the
 * background, so the rejection for a socket the OS killed can surface a beat
 * *after* the app is active again, which is to say after the foreground
 * listener has already run and found nothing owed. Short enough that somebody
 * watching the screen sees it repair itself rather than wondering.
 */
const RECOVERY_MS = 4_000;

/**
 * How many times to ask about an owed turn before letting the failure stand.
 *
 * A turn that never reached the server at all is indistinguishable from one
 * still being written, and asking forever would put two requests on every
 * foreground for the rest of the app's life on the strength of one send that
 * never happened. Five is generous — the first ask is four seconds later and
 * the rest are whole returns to the app apart, so a turn that landed has run
 * out of ways to still be running by then.
 */
const RECOVERY_ATTEMPTS = 5;

/**
 * The empty-state suggestions. Only the run carries a unit, and it carries one
 * because a distance without one is not a sentence anybody says — so there are
 * two lists rather than a placeholder to substitute into.
 */
const RUN_DISTANCE: Record<UnitSystem, string> = { metric: '5km', imperial: '3 mile' };

const prompts = (tr: ReturnType<typeof useT>, units: UnitSystem): string[] => [
  tr('journal.promptEggs'),
  tr('journal.promptLunch'),
  tr('journal.promptRun')(RUN_DISTANCE[units]),
  tr('journal.promptProtein'),
];

/**
 * The product itself: one continuous conversation.
 *
 * The web pairs this with the day on a wide screen; here the day is its own
 * tab, so this is the phone layout and only that — status bar welded to the
 * top, conversation, composer welded to the bottom.
 */
export default function JournalScreen() {
  const colors = useColors();
  const { profile, adoptProfile, guest } = useAuth();
  const units = unitsOf(profile);
  /*
   * The language this screen is drawn in, which is also the language the reply
   * has to come back in. Sent with every turn: the profile's preference wins on
   * the server, and this is what answers for an account that has none — where
   * the app is following the device and the model would otherwise write English
   * underneath a Bulgarian interface. See `ChatRequest.locale`.
   */
  const locale = useLocale();
  const tr = useT();
  const toast = useToast();
  const { adopt, refresh: refreshPlan, allowances } = useEntitlements();
  const save = useSaveAccount();

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  /**
   * The newest meal card, which one of the cast peeks over: the row it is in,
   * the entry, and whoever the meal is mostly made of.
   */
  const newest = useMemo(() => {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const bubble = bubbles[i]!;
      const actions = bubble.actions ?? [];
      for (let j = actions.length - 1; j >= 0; j--) {
        const card = actions[j]!.card;
        if (card?.type === 'food' && !actions[j]!.removed && card.entry_id) {
          return { row: bubble.key, entryId: card.entry_id, who: dominant(card) };
        }
      }
    }
    return null;
  }, [bubbles]);
  const newestFood = newest?.row ?? null;
  const [day, setDay] = useState<DaySummary | null>(null);

  /*
   * The buzz that says a turn logged something.
   *
   * A turn is the app's main way of putting food in the journal — "two eggs
   * and toast" — and it is the one path that never announces itself. The
   * stream carries prose, the model decides mid-sentence whether to call the
   * tool, and nothing in the events says outright "that landed". What is
   * certain is the day that comes back with the reply, so the test is the
   * honest one: if the number moved, something was logged.
   *
   * Held in a ref rather than read off `day`, because the send callback is
   * memoised against the profile and deliberately does not close over the day
   * it is about to replace.
   */
  const consumed = useRef<number | null>(null);
  const commitDay = useCallback((next: DaySummary) => {
    if (consumed.current !== null && next.consumed.kcal !== consumed.current) haptics.logged();
    consumed.current = next.consumed.kcal;
    noteEarned(next);
    setDay(next);
    // The home screen learns what the journal just learned. Safe here because
    // the journal is always today — see `today.tsx` for the case that is not.
    // The language goes with it: the launcher has no tree to ask.
    void writeDaySnapshot(next, locale, profile);
  }, [locale, profile]);
  const [busy, setBusy] = useState(false);

  /**
   * A turn is in flight. The same fact as `busy`, in the form the recovery
   * below needs it: that runs from an event rather than from a render, and must
   * not replace the conversation with the server's copy while an optimistic row
   * is sitting in it.
   */
  const sending = useRef(false);
  /**
   * The last turn whose connection died with the answer still owed, and the
   * message ids that were on screen before it started.
   *
   * A dropped connection is a question, not an answer: the server does not
   * abandon a turn when the reader goes away — it finishes it and commits, and
   * writes the reply to a socket nobody is holding any more (see the note on
   * `request.raw.on('close')` in `sse.ts`). Keeping the turn here is what lets
   * the question be asked again once there is a network to ask over.
   */
  const orphaned = useRef<Set<string> | null>(null);
  /** Asks left about it. See `RECOVERY_ATTEMPTS`. */
  const asks = useRef(0);
  const [loading, setLoading] = useState(true);
  /*
   * The count, hidden for this launch.
   *
   * Deliberately not persisted. It comes back next launch because the number it
   * reports will have changed by then — and a warning somebody silenced once,
   * forever, is a warning that fails at the only moment it was for.
   */
  const [dismissedCount, setDismissedCount] = useState(false);

  /*
   * The ring in the status bar, held back while a meal is on its way into it
   * (CAST.md, fourth pass). The card lands, whoever it is mostly made of catches
   * it and tosses a spark up into the ring — and the ring moves when the spark
   * arrives, not a second before, so what caused it is on screen. A fallback
   * lets go if the catch never comes (another tab, Reduce Motion, a card that
   * scrolled away).
   */
  const [ringDay, setRingDay] = useState<DaySummary | null>(null);
  const [ringFlash, setRingFlash] = useState(0);
  const holdingRing = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const releaseRing = useCallback((flash: boolean) => {
    clearTimeout(holdTimer.current);
    holdingRing.current = false;
    setRingDay(dayRef.current);
    if (flash) setRingFlash((n) => n + 1);
  }, []);
  const holdRing = useCallback(() => {
    holdingRing.current = true;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => releaseRing(false), 3600);
  }, [releaseRing]);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  useEffect(() => {
    if (!holdingRing.current) setRingDay(day);
  }, [day]);

  /* The carrier caught the card: the spark goes up, in its macro's colour. */
  const onCatch = useCallback(
    (who: CastName, entryId: string) => {
      // The widget draws whoever caught the last meal (`castMemory`, set by the peek).
      if (dayRef.current) void writeDaySnapshot(dayRef.current, locale, profile);
      if (!holdingRing.current) return;
      spark({ seat: `journal.peek:${entryId}`, name: who }, 'journal.ring', macroColour(colors, who), () =>
        releaseRing(true),
      );
    },
    [colors, releaseRing, locale, profile],
  );

  /*
   * Where the three sit in the journal (CAST.md, fourth pass). Nowhere while the
   * journal is empty — the plate has them. In the reply row while a turn is
   * silent. Otherwise on the ledge above the composer, except whoever the newest
   * meal is mostly made of, who is on that card. Asked for whenever any of that
   * changes and whenever the journal comes back on screen; the stage flies them.
   */
  const focused = useIsFocused();
  const typing = useKeyboardVisible();
  const dayPart = useDayPart();
  const night = dayPart === 'night';
  const replying = bubbles.some((bubble) => bubble.pending && !bubble.content);
  const empty = !loading && bubbles.length === 0;
  useEffect(() => {
    if (!focused) return;
    claimAll('index', (name) => {
      if (empty) return null;
      // Loading the conversation: they bounce on the composer, as for a reply.
      if (loading) return 'journal.ledge';
      // A turn is out: all three wait on the ledge (bouncing while it is silent),
      // the last carrier included, rather than staying on a card the reply is
      // about to make old.
      if (busy || replying) return 'journal.ledge';
      if (newest && newest.who === name) return `journal.peek:${newest.entryId}`;
      return 'journal.ledge';
    });
  }, [focused, loading, empty, replying, busy, newest?.who, newest?.entryId]);

  /* ---- The ledge's small life (CAST.md, fourth pass) ---------------------- */

  const reducedMotion = useReducedMotion();
  const [cues, setCues] = useState<Partial<Record<CastName, Cue>>>({});
  const cueFor = useCallback((name: CastName, next: Omit<Cue, 'key'>) => {
    setCues((prev) => ({ ...prev, [name]: { ...next, key: Date.now() + Math.random() } }));
  }, []);

  /*
   * Dozing off on the counter. Two minutes with nobody touching the journal and
   * they nod off one by one, Plum first, holding still — which is also every
   * loop on the screen stopping. A touch wakes them the other way round.
   */
  const lastTouch = useRef(Date.now());
  const [dozing, setDozing] = useState<readonly CastName[]>(NOBODY);
  const dozingRef = useRef(dozing);
  dozingRef.current = dozing;
  const touched = useCallback(() => {
    lastTouch.current = Date.now();
    const asleep = dozingRef.current;
    if (asleep.length === 0) return;
    setDozing(NOBODY);
    [...asleep].reverse().forEach((name, i) => {
      setTimeout(() => cueFor(name, { mood: 'yawn', ms: 1100 }), 120 + i * 260);
    });
  }, [cueFor]);
  useEffect(() => {
    if (!focused) return;
    lastTouch.current = Date.now();
    const timer = setInterval(() => {
      if (sending.current) return;
      const idle = Date.now() - lastTouch.current;
      const count = idle > DOZE_AFTER_MS + 16_000 ? 3 : idle > DOZE_AFTER_MS + 8_000 ? 2 : idle > DOZE_AFTER_MS ? 1 : 0;
      if (count > dozingRef.current.length) setDozing(DOZE_ORDER.slice(0, count));
    }, 4000);
    const back = AppState.addEventListener('change', (next) => {
      if (next === 'active') touched();
    });
    return () => {
      clearInterval(timer);
      back.remove();
    };
  }, [focused, touched]);

  /*
   * Listening while a meal is typed. The newest food word perks up whoever it is
   * mostly made of, and the other two look over. Debounced, once per word, and
   * not more than every second and a half.
   */
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heard = useRef<{ word: string | null; at: number }>({ word: null, at: 0 });
  useEffect(() => () => clearTimeout(draftTimer.current), []);
  const onDraft = useCallback(
    (text: string) => {
      touched();
      clearTimeout(draftTimer.current);
      if (!text.trim()) {
        heard.current.word = null;
        return;
      }
      draftTimer.current = setTimeout(() => {
        const match = castForDraft(text);
        if (!match || match.word === heard.current.word || Date.now() - heard.current.at < 1500) return;
        heard.current = { word: match.word, at: Date.now() };
        cueFor(match.name, { mood: 'hopeful', ms: 900, hop: true });
        glanceAt(match.name);
      }, 250);
    },
    [cueFor, touched],
  );

  /* Waking up with you: the first open of the morning, once a day on this phone. */
  useEffect(() => {
    if (!focused || !profile?.id || !day || dayPart !== 'morning' || reducedMotion) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const userId = profile.id;
    const moment = `wake:${day.local_date}`;
    void (async () => {
      if (await momentShown(userId, moment)) return;
      await markMomentShown(userId, moment);
      if (cancelled) return;
      timers.push(setTimeout(() => cueFor('plum', { mood: 'yawn', ms: 1300 }), 500));
      timers.push(setTimeout(() => cueFor('ember', { mood: 'stretch', ms: 1100 }), 1100));
      timers.push(setTimeout(() => cueFor('skye', { mood: 'wave', ms: 1600, hop: true }), 1700));
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, profile?.id, day?.local_date, dayPart, reducedMotion]);

  /* A coach's comment arriving turns heads: all eyes up at it, once. */
  const seenCoach = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    let last: string | null = null;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i]!.role === 'coach') {
        last = bubbles[i]!.key;
        break;
      }
    }
    if (seenCoach.current !== undefined && last && last !== seenCoach.current) lookAll('lookUp');
    seenCoach.current = last;
  }, [bubbles, loading]);

  /*
   * A streak milestone: the three celebrate on the ledge — Ember with the flame,
   * the other two cheering — confetti comes off the composer, and the words land
   * in the conversation. See `useStreakMoment`.
   */
  const moment = useStreakMoment(day?.streak, profile?.id);
  useEffect(() => {
    if (!moment) return;
    cueFor('ember', { mood: 'proud', ms: 2600, hop: true });
    const later = [
      setTimeout(() => cueFor('skye', { mood: 'cheer', ms: 1600 }), 180),
      setTimeout(() => cueFor('plum', { mood: 'cheer', ms: 1600 }), 360),
    ];
    pinned.current = true;
    setBubbles((prev) =>
      prev.some((bubble) => bubble.key === `local-${moment.key}`)
        ? prev
        : [...prev, { key: `local-${moment.key}`, role: 'assistant', content: '', moment: moment.days }],
    );
    return () => later.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.key]);

  /*
   * A badge just earned: its holder hops down to the Progress tab, the icon
   * kicks, and they hop back — which is where badges live, said without a
   * notice. After the catch and the spark, so the meal's moment comes first.
   */
  useEffect(() => {
    if (!focused || castMemory.pendingBadges.length === 0) return;
    const timer = setTimeout(() => {
      const badge = takeBadge();
      if (!badge) return;
      visit(holderOf(badge), 'tab.progress', () => {
        haptics.selected();
        bounceTab('progress');
      });
    }, 2800);
    return () => clearTimeout(timer);
  }, [focused, day]);

  /* Leaning against a scroll the reader is making, never one the app makes. */
  const lean = useSharedValue(0);

  const birthday = Boolean(
    profile?.birth_date && day?.local_date && profile.birth_date.slice(5, 10) === day.local_date.slice(5, 10),
  );
  const ledgeState = useMemo(
    () => ({
      typing,
      waiting: replying || loading,
      streaming: busy && !replying,
      night,
      evening: dayPart === 'evening',
      birthday,
      dozing,
    }),
    [typing, replying, loading, busy, night, dayPart, birthday, dozing],
  );

  const scroller = useRef<ScrollView>(null);
  /*
   * Whether the conversation is parked at its end. Everything that grows it
   * follows it down while this holds, and nothing does once the reader has
   * scrolled back through history.
   */
  const pinned = useRef(true);
  /*
   * Whether the finger is what is moving the column.
   *
   * `onScroll` cannot tell the reader's scroll from the app's own, and this
   * screen issues one on every growth — so a photo that finishes decoding
   * between `scrollToEnd` and the delivery of the event it caused reports the
   * app's own scroll to the end as a scroll three hundred pixels away from it,
   * and unpins a conversation nobody touched. After that the journal simply
   * stops following, which is how it comes to open half a screen up.
   *
   * So only a gesture may unpin: a drag, and the momentum it throws.
   */
  const touching = useRef(false);
  /**
   * The day, for the callbacks that need only its date.
   *
   * Same reason as `bubblesRef`: `logManually` is a prop on memoised rows and
   * must not be rebuilt every time the day's calorie total moves, but the local
   * date it queues against has to be the current one. This app's day turns over
   * at 4am, so taking the date off the device clock instead would file a meal
   * eaten at 1am under tomorrow.
   */
  const dayRef = useRef<DaySummary | null>(null);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  /** Lets `send` see the messages it started from without depending on them. */
  const bubblesRef = useRef<Bubble[]>([]);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [history, today] = await Promise.all([api.history(40), api.day()]);
        if (cancelled) return;
        setBubbles(history.messages.map(toBubble));
        consumed.current = today.consumed.kcal;
        noteEarned(today);
        setDay(today);
        void writeDaySnapshot(today, locale, profile);
      } catch {
        // Reported by the empty conversation rather than over it: there is no
        // toast here, and an error bar above a blank screen says less than the
        // screen already does.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * A meal deleted somewhere else in the app, struck through here.
   *
   * The server writes the same mark onto the stored card, so this is not what
   * makes it stick — it is what makes it happen now. This tab is mounted the
   * whole time the Today tab is being used and reads its history exactly once,
   * at launch, so without this the card sits here counting a meal the reader
   * just watched leave the other screen, until the next cold start.
   */
  useEffect(
    () => onEntryRemoved((entryId) => setBubbles((prev) => strike(prev, entryId))),
    [],
  );

  /*
   * Reaching the end is two scrolls a frame apart, and the second one is the
   * one that works.
   *
   * `onContentSizeChange` is the RN spelling of the web's ResizeObserver on the
   * column, and it fires on every growth — a streamed reply arriving a word at
   * a time, a card unfolding under it. But the scroll it asks for cannot land
   * yet: the event reaches JS before the native view has been laid out at its
   * new height, so `scrollToEnd` clamps to the height the column still is and
   * goes nowhere. On a cold start, where forty messages appear in a single
   * commit and there is no second growth to save it, that was the whole bug —
   * the journal opened on the *oldest* message in the history it had just
   * fetched, having never emitted a scroll event at all.
   *
   * Both calls rather than only the deferred one: when the size was already
   * committed the first lands immediately and the second is a no-op, which is
   * the difference between arriving at the end and arriving a frame late.
   */
  const stickToBottom = useCallback(() => {
    if (!pinned.current) return;
    scroller.current?.scrollToEnd({ animated: false });
    requestAnimationFrame(() => {
      if (pinned.current) scroller.current?.scrollToEnd({ animated: false });
    });
  }, []);

  /*
   * The keyboard, which moves the end of the conversation without changing the
   * length of it.
   *
   * Everything above follows the *content* growing, and none of it fires here:
   * opening the keyboard leaves the column exactly as long as it was and takes
   * away the bottom third of the window it is being read through, so the last
   * message ends up behind the keys with nothing to say it moved. The column's
   * own `onLayout` catches the same thing — and catches the composer growing a
   * line as it is typed into, which is the other way this happens — but it
   * lands mid-animation on iOS, where the padding arrives over a quarter of a
   * second. `keyboardDidShow` is the frame after that settles.
   */
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', stickToBottom);
    return () => shown.remove();
  }, [stickToBottom]);

  /**
   * Re-read the day. Stable, because it is a prop on every memoised row — an
   * inline arrow would hand each of them a new function on every render and
   * quietly undo the memoisation while looking like it worked.
   */
  const refreshDay = useCallback(() => {
    void api.day().then(setDay).catch(() => {});
  }, []);

  /*
   * A queued meal that has landed, folded into the status bar.
   *
   * The manual form on the wall below writes to the outbox rather than to the
   * API — the same path Today uses, so an offline log behaves identically from
   * either screen — and the outbox sends on its own schedule. Watching the
   * queue *shrink* is the signal that something reached the server, and it is
   * the only one there is: nothing else on this screen is told.
   *
   * A count rather than the contents, because a meal added and a meal sent in
   * the same tick would net to zero on any comparison finer than this one and
   * neither would be worth the redraw.
   */
  const queued = useOutbox().length;
  const wasQueued = useRef(queued);
  useEffect(() => {
    if (queued < wasQueued.current) refreshDay();
    wasQueued.current = queued;
  }, [queued, refreshDay]);

  /**
   * A meal typed into the wall, handed to the queue rather than to the API.
   *
   * Identical to Today's manual path on purpose, down to going through the
   * outbox on a perfect connection: two code paths that differ only under bad
   * network are two code paths that diverge where it is hardest to notice. The
   * `client_id` is what makes the retry safe.
   *
   * Nothing about this spends a meter, which is the entire point of offering it
   * here — see `plans.ts` on why the free tier can be as small as it is.
   */
  const logManually = useCallback(
    (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => {
      void enqueue({
        kind: 'create',
        id: newId(),
        userId: profile?.id ?? '',
        localDate: dayRef.current?.local_date ?? '',
        payload: {
          description: draft.description,
          meal: draft.meal,
          eaten_at: new Date().toISOString(),
          items: draft.items,
        },
        queuedAt: new Date().toISOString(),
      });
      const kcal = draft.items.reduce((sum, item) => sum + item.kcal, 0);
      toast.success(tr('toast.logged')(draft.description, formatNumber(Math.round(kcal), locale)));
    },
    [profile?.id, toast, tr, locale],
  );

  /**
   * A scan, arriving in the conversation.
   *
   * The scanner logs through its own route rather than a turn, so nothing here
   * had written the meal down — the packet went into the status bar and the
   * Today tab and left the journal with a gap where a meal should be. The
   * server now stores the message with the card on it and returns it, so this
   * is the same row a relaunch would show, put in without waiting for one.
   */
  const onScanned = useCallback(
    (message: ChatMessage) => {
      // Scanning is a request to be at the end of the conversation, wherever
      // the reader had scrolled back to — the same as sending.
      pinned.current = true;
      setBubbles((prev) => [...prev, toBubble(message)]);
      refreshDay();
    },
    [refreshDay],
  );

  const measure = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    pinned.current =
      contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_BOTTOM_PX;
  }, []);

  const lastScroll = useRef({ y: 0, t: 0 });
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!touching.current) return;
      measure(event);
      const y = event.nativeEvent.contentOffset.y;
      const t = Date.now();
      const dt = t - lastScroll.current.t;
      if (dt > 0 && dt < 120) {
        const velocity = (y - lastScroll.current.y) / dt;
        lean.value = withSpring(Math.max(-1, Math.min(1, -velocity * 0.5)), { damping: 14, stiffness: 160 });
      }
      lastScroll.current = { y, t };
    },
    [measure, lean],
  );

  /*
   * The two halves of a flick — the drag, and the coasting after it — are
   * separate gestures to the native view, and the gap between them is where a
   * scroll that is still the reader's would otherwise stop counting as one.
   * Both ends measure, so a flick that lands at the bottom re-pins.
   */
  const onTouchBegin = useCallback(() => {
    touching.current = true;
  }, []);

  const onTouchEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      measure(event);
      touching.current = false;
      // Settles back upright on a looser spring, so the stop wobbles.
      lean.value = withSpring(0, { damping: 6, stiffness: 80 });
    },
    [measure, lean],
  );

  /**
   * Asks the server what became of a turn whose connection died.
   *
   * The other half of the reconciliation inside `send`, and the half that was
   * missing. Locking the phone kills the socket mid-turn, so the ask that
   * happens right there happens with no radio and learns nothing — and the row
   * was then stuck on a failure that had already stopped being true, visibly
   * so, since the turn was in the conversation the moment the app was launched
   * again. Relaunching is not how anybody should find that out, so the same
   * question is asked on the way back in.
   */
  const recover = useCallback(async () => {
    const known = orphaned.current;
    if (!known || sending.current) return;
    if (asks.current <= 0) {
      orphaned.current = null;
      return;
    }
    asks.current -= 1;
    const landed = await reconcile(known);
    // Still nothing to see, or a new turn started while we were asking. Either
    // way the answer stays owed and the next return asks again.
    if (!landed || orphaned.current !== known || sending.current) return;
    orphaned.current = null;
    setBubbles(landed.bubbles);
    commitDay(landed.day);
  }, [commitDay]);

  /**
   * Read the conversation again, because time passed while we were away.
   *
   * This screen used to fetch exactly once, at mount, and a phone app is
   * mounted for weeks — so everything that arrives without the reader sending
   * it was invisible until the process next died. A nudge and a weekly review
   * are both written into this conversation by the server; so is the reply to a
   * turn whose socket the lock screen killed. All three were being announced by
   * a notification that deep-linked to a screen already holding the version of
   * the transcript from before they existed.
   *
   * The other half is repair. A photo bubble drawn optimistically points at the
   * picker's cache file, and Android empties that directory whenever it wants
   * the space; the row survives, the picture does not. `send` now swaps in the
   * server's durable URL as each turn lands, but that only helps turns sent by
   * *this* build — anything already sitting in a mounted screen is fixed by
   * asking again, which is what this does.
   *
   * The server's copy wins for everything the server has heard of. What it has
   * not heard of is exactly the local-only tail — a turn still in flight, one
   * that failed, the wall a spent plan left behind — which is kept, in order,
   * after it. Those carry a `local-` key precisely because nothing has given
   * them a real one yet.
   */
  const refresh = useCallback(async () => {
    // An owed turn has its own, more careful path: it needs to know whether the
    // reply landed before it may touch the conversation. Let it run instead.
    if (orphaned.current) return recover();
    // Never over a turn in flight. `reconcile` guards the same way and for the
    // same reason: the optimistic rows are not on the server yet, and replacing
    // the list under them would erase the message being sent.
    if (sending.current) return;

    try {
      const [history, today] = await Promise.all([api.history(40), api.day()]);
      if (sending.current) return;
      setBubbles((prev) => [
        ...history.messages.map(toBubble),
        ...prev.filter((bubble) => bubble.key.startsWith('local-')),
      ]);
      commitDay(today);
    } catch {
      // Offline, or the server is down. The screen keeps what it had, which is
      // the same answer the mount fetch gives and better than an empty one.
    }
  }, [recover, commitDay]);

  /*
   * Both halves of "coming back" — another tab, and another app — because a
   * dropped turn is exactly what happens while this screen is the one being
   * left, and because the launcher's widget deep-links straight in here.
   * See `useRefreshOnReturn`.
   */
  useRefreshOnReturn(refresh);

  const send = useCallback(
    async (payload: ComposerPayload) => {
      const localKey = `local-${Date.now()}`;
      // Ids the server had already given us. Anything outside this set
      // afterwards arrived during this turn, which is clock-free evidence that
      // it landed.
      const known = new Set(bubblesRef.current.map((b) => b.key));
      // Sending is a request to be at the end of the conversation, wherever the
      // reader had scrolled back to.
      pinned.current = true;

      const replyKey = `${localKey}-reply`;
      // Render the user's message immediately — a multi-second wait before
      // anything appears would break the "continuous conversation" feel.
      setBubbles((prev) => [
        ...prev,
        {
          key: localKey,
          role: 'user',
          // A photo on its own carries no words: the default sentence the
          // composer supplies is for the model, not for the reader's bubble.
          content: payload.photoOnly ? '' : payload.text,
          photoUrl: payload.photoPreview,
          scanned: payload.scannedPreview,
        },
        // The lane runs one tool and returns, so the wait says what it is
        // doing from the start rather than after a stream event arrives.
        { key: replyKey, role: 'assistant', content: '', pending: true, tool: payload.photoOnly ? 'log_food' : undefined },
      ]);
      setBusy(true);
      sending.current = true;

      try {
        /*
         * The photo goes phone-to-bucket, and the turn carries a key. Expo's
         * `File.upload` streams the file the picker already wrote to disk, so
         * the bytes never enter JS — a phone never has to hold several
         * megabytes in memory to send a photo it is sitting on.
         *
         * Any failure falls back to base64, which still logs the meal, and says
         * so in `photo_upload_failed` so a bucket that has quietly stopped
         * accepting writes does not look like one nobody configured.
         */
        let photoKey: string | undefined;
        let uploadFailed = false;
        if (payload.photoPreview && payload.photoMediaType) {
          try {
            const ticket = await api.photoUploadTicket(payload.photoMediaType);
            if (ticket.url && ticket.key) {
              const ok = await uploadPhotoFile(
                payload.photoPreview,
                payload.photoMediaType,
                ticket.url,
              );
              if (ok) photoKey = ticket.key;
              else uploadFailed = true;
            }
          } catch {
            uploadFailed = true;
          }
        }

        /*
         * Two roads to the same answer. A photograph with nothing under it
         * takes the photo-only lane: one tool, no transcript, no stream, and a
         * `ChatResponse` at the end that this screen handles exactly as it
         * handles the journal's. Anything with words goes through the turn.
         */
        const result =
          payload.photoOnly && (photoKey || payload.photoBase64)
            ? await api.logPhoto({
                photo_key: photoKey,
                photo_base64: photoKey ? undefined : payload.photoBase64,
                photo_media_type: payload.photoMediaType ?? 'image/jpeg',
              })
            : await api.chatStream(
                {
                  text: payload.text,
                  photo_key: photoKey,
                  photo_base64: photoKey ? undefined : payload.photoBase64,
                  photo_media_type: payload.photoMediaType,
                  photo_upload_failed: uploadFailed || undefined,
                  scanned: payload.scanned,
                  locale,
                },
                // The stream is a preview of the reply, never the record of it:
                // `result` below is what actually lands in the conversation. So this
                // only ever touches the one pending row, and nothing here has to be
                // undone.
                (event) =>
                  setBubbles((prev) => prev.map((b) => (b.key === replyKey ? applyEvent(b, event) : b))),
              );

        setBubbles((prev) =>
          prev.map((b) => {
            if (b.key === replyKey) {
              return {
                ...b,
                key: result.message.id,
                content: result.message.content,
                pending: false,
                tool: undefined,
                // The trace was scaffolding for the wait. The reply it was
                // standing in for is here now, and it says the same things.
                steps: undefined,
                actions: result.actions,
                live: true,
              };
            }
            /*
             * The row the reader wrote, exchanged for the row the server kept.
             *
             * It matters for exactly one field. The optimistic bubble's photo is
             * the picker's own file, in a cache directory Android empties
             * whenever it wants the space — so a journal left open across a
             * sweep loses the picture out of every meal logged this session,
             * and nothing on this screen ever asks again. `photo_url` is the
             * durable answer, signed by the API and good for a week; taking it
             * now is what keeps the square from going blank behind the reader's
             * back. See `ChatResponse.user_message`.
             *
             * The whole row rather than the one field, so the key becomes the
             * server's too and this bubble stops being local-only — which is
             * what lets `refresh` below recognise it as already known.
             *
             * Guarded, because an API that has not learned to send it still has
             * to work: without the field the bubble stays exactly as it was.
             */
            if (b.key === localKey && result.user_message) {
              return {
                ...b,
                key: result.user_message.id,
                photoUrl: result.user_message.photo_url
                  ? api.photoUrl(result.user_message.photo_url)
                  : b.photoUrl,
                // Same guard: an API that has not learned to store these still
                // leaves the optimistic chips exactly where they were.
                scanned:
                  result.user_message.scanned.length > 0
                    ? result.user_message.scanned
                    : b.scanned,
              };
            }
            return b;
          }),
        );
        // A turn can delete an entry too, and the card that logged it is
        // somewhere above in this same conversation.
        for (const action of result.actions) {
          if (isDeletion(action) && action.entry_id) {
            const gone = action.entry_id;
            setBubbles((prev) => strike(prev, gone));
          }
        }
        // A meal the cast is about to catch holds the ring for its spark.
        if (result.actions.some((action) => action.kind === 'food_logged' && action.card?.type === 'food')) holdRing();
        commitDay(result.day);
        // What the turn just spent, so the count above the composer is right
        // without a request of its own. See `ChatResponse.allowance`.
        if (result.allowance) adopt(result.allowance);
        // The turn may have changed the profile — units, diet, a name. Adopting
        // it here is what makes "switch me to pounds" take effect now rather
        // than at the next launch.
        adoptProfile(result.profile);
      } catch (e) {
        /*
         * A price, not a fault, and told apart before anything else.
         *
         * This is the branch this whole screen used to get wrong: a 402 fell
         * through to the transport handler below and became a red sentence in
         * the conversation, which reads as the app being broken at the exact
         * moment it is asking to be paid for. It is also the one failure where
         * nothing was attempted — no turn ran, no meal was logged — so there is
         * nothing to reconcile and asking the server about it would be a wasted
         * round trip on a screen somebody is waiting on.
         *
         * The row becomes the wall instead, carrying what they typed so the
         * free path opens with their own sentence in it.
         */
        const limit = planLimitOf(e);
        if (limit) {
          if (limit.allowance) adopt(limit.allowance);
          else void refreshPlan();
          setBubbles((prev) =>
            prev.map((b) =>
              b.key === replyKey
                ? {
                    ...b,
                    content: '',
                    pending: false,
                    tool: undefined,
                    steps: undefined,
                    wall: { ...limit, text: payload.text },
                  }
                : b,
            ),
          );
          // A guest's day is spent: the answer is saving the account, which
          // starts the trial. The wall stays in the transcript behind it.
          if (limit.allowance?.trial === 'guest') save.open('guest_limit');
          return;
        }

        /*
         * A lost response is not a lost turn. The server commits the message
         * and the reply together at the very end, so a connection that dies
         * while waiting — a phone changing network, a screen locking mid-upload
         * — leaves the meal logged but the answer undelivered. Ask what actually
         * happened before calling it a failure, or the obvious retry logs the
         * meal twice.
         */
        const landed = await reconcile(known);
        if (landed) {
          setBubbles(landed.bubbles);
          commitDay(landed.day);
        } else {
          /*
           * What went wrong, not what threw.
           *
           * `expo/fetch` hands up whatever OkHttp raised, and a phone that
           * locked mid-turn produces a Java socket exception — printed into the
           * conversation, it reads as the app having crashed rather than as a
           * connection having gone. What is actually true is that the answer is
           * owed and may well already exist, so the row says that, and the turn
           * is remembered for `recover` to ask about again.
           */
          orphaned.current = known;
          asks.current = RECOVERY_ATTEMPTS;
          setTimeout(() => void recover(), RECOVERY_MS);
          setBubbles((prev) =>
            prev.map((b) =>
              b.key === replyKey
                ? {
                    ...b,
                    content: tr('journal.lost'),
                    pending: false,
                    tool: undefined,
                    steps: undefined,
                    failed: true,
                  }
                : b,
            ),
          );
        }
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [
      locale,
      tr,
      recover,
      adoptProfile,
      commitDay,
      adopt,
      refreshPlan,
      save,
      holdRing,
    ],
  );

  /*
   * Asked before the camera opens. A spent photo meter used to be found out
   * after the picture was taken and uploaded — a wasted shot and a stored file
   * nobody reads — so the wall lands first, the same card a refused turn
   * leaves, with nothing typed to carry. Bought scans still count as room, and
   * an unknown meter (still loading, offline) lets the server decide.
   */
  const canAttachPhoto = useCallback((): boolean => {
    const photo = allowances?.photo;
    if (!photo || !meterSpent(photo) || photo.credits > 0) return true;
    pinned.current = true;
    setBubbles((prev) => [
      ...prev,
      {
        key: `local-${Date.now()}-wall`,
        role: 'assistant',
        content: '',
        wall: { allowance: photo, message: '', text: '' },
      },
    ]);
    if (photo.trial === 'guest' && guest) save.open('guest_limit');
    return false;
  }, [allowances, guest, save]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // Any touch counts as somebody being here: see the dozing, above.
      onTouchStart={touched}
      /*
       * `padding` on both platforms, and no offset.
       *
       * The usual advice is that Android resizes its own window and needs
       * nothing here. That stopped being true with edge-to-edge: the window now
       * spans the keyboard instead of shrinking away from it, so the composer
       * simply ends up underneath. Padding driven by the keyboard events works
       * the same way on both, and the offset is zero because the tab bar —
       * which is the only other thing down there — takes itself off screen
       * while the keyboard is up. See `useKeyboardVisible`.
       */
      behavior="padding"
    >
      <StatusBar day={ringDay} loading={loading} flash={ringFlash} />

      <ScrollView
        ref={scroller}
        style={styles.flex}
        contentContainerStyle={styles.column}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={onTouchBegin}
        onScrollEndDrag={onTouchEnd}
        onMomentumScrollBegin={onTouchBegin}
        onMomentumScrollEnd={onTouchEnd}
        onContentSizeChange={stickToBottom}
        // Growing content is only half of it: the window it is read through
        // shrinks too, for the keyboard and for a composer being typed into.
        onLayout={stickToBottom}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {loading && <ChatSkeleton />}

        {!loading && bubbles.length === 0 && (
          <View style={styles.empty}>
            {/* The one screen in the app with room for an illustration, and the one
                that otherwise offers a new account a wall of text. The cast
                peeks over the plate until the first thing is said. */}
            <View style={styles.emptyArt}>
              <CastPlate width={200} entrance />
            </View>
            <Serif accessibilityRole="header" style={[t.hero, { color: colors.foreground }]}>
              {tr('journal.emptyTitle')}
            </Serif>
            <Text style={[t.body, styles.blurb, { color: colors.mutedForeground }]}>
              {tr('journal.emptyBody')}
            </Text>
            <View style={styles.prompts}>
              {prompts(tr, units).map((prompt) => (
                <PressableChunk
                  key={prompt}
                  depth={3}
                  radius={999}
                  onPress={() => void send({ text: prompt })}
                  accessibilityRole="button"
                  contentStyle={[
                    styles.prompt,
                    { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge },
                  ]}
                >
                  <Text style={[styles.promptLabel, { color: colors.secondaryForeground }]}>
                    {prompt}
                  </Text>
                </PressableChunk>
              ))}
            </View>
          </View>
        )}

        {bubbles.map((bubble) => (
          <Row
            peek={bubble.key === newestFood}
            key={bubble.key}
            bubble={bubble}
            today={day?.local_date}
            timezone={profile?.timezone}
            onLogged={refreshDay}
            onLogManually={logManually}
            onCatch={onCatch}
          />
        ))}
      </ScrollView>

      {/* The three's home in the journal, laid out between the conversation and
          the composer. Empty while the journal is (the plate has them). */}
      <View style={styles.burstAnchor} pointerEvents="none">
        <MomentBurst trigger={moment?.key ?? null} />
      </View>
      {!empty && <CastLedge state={ledgeState} cues={cues} lean={lean} right={LEDGE_RIGHT} />}

      {/*
        The count, and only once it is close — half the grant on a small one,
        the last few on a large one. `showFrom` in `MeterChip` sizes it, which
        on free's ten a month means the fifth message is where it appears.
        
        Above the composer rather than in the conversation: it is about the app
        rather than about the food, and a line that reappears in the transcript
        every time you open the journal is an advert. Here it sits with the
        controls, says a number, and goes away when it is dismissed or when
        there is nothing left to count. See `MeterChip`.
      */}
      {!dismissedCount && <MeterChip meter="chat" onDismiss={() => setDismissedCount(true)} />}

      <Composer
        onSend={(p) => void send(p)}
        canAttachPhoto={canAttachPhoto}
        // A scanned packet is logged by the scanner itself, without a turn — so
        // the message it produced is dropped into the conversation here, and the
        // status bar above told to re-read itself.
        onLogged={onScanned}
        disabled={busy}
        onDraft={onDraft}
      />

      {/*
        * The daily reminder, offered the first time a meal lands here rather
        * than left in the settings tab for somebody to find. Held off while a
        * turn is in flight or the queue still has meals in it: an ask made
        * over the top of the app visibly working is an interruption, and the
        * cue is not spent by waiting. See `lib/reminder-invite.ts`.
        */}
      <ReminderInvite day={day} quiet={busy || queued > 0} />

    </KeyboardAvoidingView>
  );
}

/**
 * One streamed frame folded into the row it belongs to.
 *
 * Text before a tool call is a preamble — "Let me log that" — and is not part
 * of the reply the server persists, which is the model's final message. So it
 * cannot stay in the body of the bubble: the real answer would replace it and
 * a sentence the reader was halfway through would change under them.
 *
 * It does not get deleted either, which is what this used to do and what read
 * as a bug — a line appearing, vanishing a second later, and the whole reply
 * arriving after it. On `tool` the preamble moves into `steps`, where it stays
 * beside the dots as the trace of what the turn is doing, until the reply it
 * was announcing arrives and takes over. Nothing on screen is ever removed
 * before the thing that replaces it exists.
 */
function applyEvent(bubble: Bubble, event: ChatStreamEvent): Bubble {
  switch (event.type) {
    case 'text':
      return { ...bubble, content: bubble.content + event.text, tool: undefined };
    case 'tool': {
      const said = bubble.content.trim();
      return {
        ...bubble,
        content: '',
        steps: said ? [...(bubble.steps ?? []), said] : bubble.steps,
        tool: event.name,
      };
    }
    case 'reset':
      // A run that died and is being started over. Its trace described that
      // run, so it goes with it.
      return { ...bubble, content: '', steps: undefined, tool: undefined };
    default:
      // `done` and `error` never reach here — the client resolves or throws on
      // them — but a frame from a newer server should be ignored, not rendered.
      return bubble;
  }
}

/**
 * What to call the pause while a tool runs.
 *
 * Keyed on the verb rather than on all thirty-odd tool names, because the names
 * are already `verb_noun` and a table of every one of them would be a second
 * place to update whenever a tool is added. An unknown verb falls through to
 * the plain dots.
 */
const TOOL_VERBS: Record<string, StringKey> = {
  log: 'tool.log',
  update: 'tool.update',
  delete: 'tool.delete',
  get: 'tool.get',
  search: 'tool.search',
  find: 'tool.find',
  set: 'tool.set',
  show: 'tool.show',
  suggest: 'tool.suggest',
  import: 'tool.import',
  adapt: 'tool.adapt',
  save: 'tool.save',
  plan: 'tool.plan',
  cook: 'tool.cook',
  repeat: 'tool.repeat',
  remember: 'tool.remember',
  forget: 'tool.forget',
  lookup: 'tool.lookup',
  run: 'tool.run',
  define: 'tool.define',
  ask: 'tool.ask',
};

/**
 * The verb alone, and deliberately not the object — see the web twin. The tool
 * name's second half is an identifier, so appending it printed half a sentence
 * in English inside an otherwise translated status line.
 */
function toolLabel(name: string, tr: ReturnType<typeof useT>): string | null {
  const [verb = ''] = name.split('_');
  const key = TOOL_VERBS[verb];
  return key ? tr(key) : null;
}

/**
 * Marks every card drawn from an entry that has since been deleted.
 *
 * The mark itself is the server's — it writes it onto the stored cards as the
 * entry goes, so a relaunch is right whatever the app was doing at the time.
 * This is the same edit applied to the copy already on screen, because the
 * conversation is read once at launch and would otherwise go on showing the
 * meal until the next one.
 *
 * Untouched bubbles keep their identity: the rows are memoised, and rebuilding
 * every one of them to strike a single card would redraw the whole journal.
 */
function strike(bubbles: Bubble[], entryId: string): Bubble[] {
  return bubbles.map((bubble) =>
    bubble.actions?.some((action) => action.entry_id === entryId && !action.removed)
      ? {
          ...bubble,
          actions: bubble.actions.map((action) =>
            action.entry_id === entryId ? { ...action, removed: true } : action,
          ),
        }
      : bubble,
  );
}

/**
 * A stored message as a bubble. `actions` comes back from the server with the
 * turn, so a reopened conversation still shows what it was answered with.
 */
function toBubble(message: ChatMessage): Bubble {
  return {
    key: message.id,
    role: message.role,
    content: message.content,
    photoUrl: message.photo_url ? api.photoUrl(message.photo_url) : undefined,
    actions: message.actions,
    scanned: message.scanned,
  };
}

/**
 * Re-reads the conversation after a send failed at the transport. Returns the
 * server's version of it when this turn is present there, and null when the
 * request really never arrived.
 */
async function reconcile(
  known: Set<string>,
): Promise<{ bubbles: Bubble[]; day: DaySummary } | null> {
  try {
    const [history, today] = await Promise.all([api.history(40), api.day()]);
    if (!history.messages.some((m) => !known.has(m.id))) return null;
    return { bubbles: history.messages.map(toBubble), day: today };
  } catch {
    // The network is still down; report the original failure.
    return null;
  }
}

/**
 * Compact always-visible answer to "how am I doing today?" (§25).
 *
 * Since the glow-up it is the top of Today's sky, folded down to one line
 * (GLOW-UP.md): the hour's gradient behind it running into the page, a small
 * lit ring for where the day has got to, and what is left set in the serif the
 * ring on Today uses. The journal and Today are one tap apart, and the header
 * is what makes them read as two views of one day rather than two apps.
 *
 * It is laid out above the conversation, not over it — nothing scrolls under
 * this band, so nothing in it ever sits on top of a message.
 */
/**
 * The top of home: a hello for the hour, and the day so far as a ring and a
 * number — which is also the door to Today.
 *
 * The greeting came across from Today when the journal became the tab the app
 * opens on (CAST.md, fourth pass), so the first screen still says hello. One
 * quiet serif line, not the big one Today keeps: the conversation below is what
 * this screen is for.
 */
function StatusBar({ day, loading, flash }: { day: DaySummary | null; loading: boolean; flash: number }) {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const locale = useLocale();
  const sky = useSky();
  const router = useRouter();
  const { profile } = useAuth();
  const ink = sky.inkLight ? colors.skyInk : colors.foreground;
  const quiet = sky.inkLight ? colors.skyInk : colors.mutedForeground;

  return (
    <View style={[styles.status, { paddingTop: insets.top + 6 }]}>
      <Sky sky={sky} height={insets.top + 170} hazeTop={insets.top + 170} />
      <Serif numberOfLines={1} style={[type.serifTitle, styles.hello, { color: ink }]}>
        {greetingFor(tr, profile?.display_name ?? null)}
      </Serif>
      {loading || !day ? (
        <Skeleton style={styles.statusSkeleton} />
      ) : (
        <Pressable
          onPress={() => {
            haptics.selected();
            router.navigate('/today');
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('nav.today')}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <StatusLine day={day} ink={ink} quiet={quiet} type={type} tr={tr} locale={locale} flash={flash} />
        </Pressable>
      )}
    </View>
  );
}

function StatusLine({
  day,
  ink,
  quiet,
  type,
  tr,
  locale,
  flash,
}: {
  day: DaySummary;
  ink: string;
  quiet: string;
  type: ReturnType<typeof useType>;
  tr: ReturnType<typeof useT>;
  locale: ReturnType<typeof useLocale>;
  flash: number;
}) {
  const colors = useColors();
  const { consumed, targets } = day;
  const remaining = targets.kcal - consumed.kcal;
  const over = remaining < 0;
  const shown = useCountUp(Math.abs(Math.round(remaining)), 900);

  return (
    <View style={styles.statusRow}>
      <MiniRing consumed={consumed.kcal} target={targets.kcal} flash={flash} />
      <View style={styles.statusText}>
        <Text style={[type.serifFigure, styles.statusFigure, { color: ink }]} numberOfLines={1}>
          {formatNumber(Math.round(shown), locale)}
          {/* Ink rather than red — see the note on --destructive in globals.css. */}
          <Text style={[t.footnoteBold, { color: quiet }]}>
            {`  ${over ? tr('today.over') : tr('today.toGo')}`}
          </Text>
        </Text>
        <Text style={[t.footnoteSemibold, t.tnum, { color: quiet }]} numberOfLines={1}>
          {`${formatNumber(Math.round(consumed.kcal), locale)} / ${formatNumber(targets.kcal, locale)} kcal`}
          {/*
            §9: the ring tracks the plain target, so a run never quietly enlarges
            the budget. But logging one has to visibly change this screen, so the
            burn sits beside the day's total.
          */}
          {day.burned_kcal > 0 && (
            <Text style={{ fontFamily: font.bold, color: colors.exerciseText }}>
              {`  ${tr('journal.burned')(formatNumber(day.burned_kcal, locale))}`}
            </Text>
          )}
        </Text>
      </View>
      {/* Where the line leads: Today. After dark Plum used to sleep here; it
          sleeps on the ledge now, with the other two (CAST.md, fourth pass). */}
      <ChevronGlyph color={quiet} />
    </View>
  );
}

function ChevronGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
    </Svg>
  );
}

const AnimatedArc = Animated.createAnimatedComponent(Circle);

/**
 * The ring on Today, at the size of an avatar. Springs to a new total the way
 * the big one does — the only feedback on this screen that the number at the
 * top changed — and turns to ink past the target rather than to red.
 */
function MiniRing({ consumed, target, flash }: { consumed: number; target: number; flash: number }) {
  const colors = useColors();
  const reduced = useReducedMotion();
  /* Where the cast's spark lands, and the light it makes when it does. */
  const anchor = useAnchor('journal.ring');
  const glow = useSharedValue(0);
  useEffect(() => {
    if (flash === 0 || reduced) return;
    glow.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 700 }));
  }, [flash, reduced, glow]);
  const glowing = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.8 + glow.value * 0.55 }] }));
  const size = 46;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, Math.max(0, consumed / Math.max(1, target)));
  const over = consumed > target;
  const arc = useSharedValue(circumference * ratio);

  useEffect(() => {
    arc.value = reduced
      ? circumference * ratio
      : withTiming(circumference * ratio, { duration: duration.spring, easing: ease.spring });
  }, [ratio, reduced, arc, circumference]);

  const props = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0, Math.min(circumference, arc.value)), circumference],
  }));

  return (
    <View
      ref={anchor}
      collapsable={false}
      style={[styles.miniRing, { boxShadow: over ? undefined : `0px 6px 18px -8px ${colors.calories}` }]}
    >
      <Animated.View
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.ringGlow,
          { experimental_backgroundImage: `radial-gradient(circle, ${colors.calories} 0%, transparent 68%)` },
          glowing,
        ]}
      />
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="mini" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.calories} />
            <Stop offset="1" stopColor={colors.logoRamp} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.glassStrong} strokeWidth={stroke} fill="none" />
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <AnimatedArc
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={over ? colors.foreground : 'url(#mini)'}
            strokeWidth={stroke}
            strokeLinecap={ratio > 0 ? 'round' : 'butt'}
            fill="none"
            animatedProps={props}
          />
        </G>
      </Svg>
    </View>
  );
}

/**
 * One packet, as it reads back on a message already sent.
 *
 * The composer's chip without its controls: nothing here can be tapped, and
 * there is nothing to remove — the turn happened, and the entry it wrote is
 * where a wrong amount gets corrected now. The barcode glyph stays, because it
 * is the only thing that says this line came off a packet rather than out of
 * the sentence above it.
 */
function SentScan({ scan }: { scan: MessageScan }) {
  const colors = useColors();
  const units = useUnits();
  const name = scan.brand ? `${scan.brand} ${scan.name}` : scan.name;
  const amount =
    scan.grams !== undefined
      ? formatMass(scan.grams, units)
      : scan.servings !== undefined
        ? formatServings(scan.servings)
        : null;

  return (
    <View style={[styles.sentScan, { backgroundColor: colors.glassStrong, borderColor: colors.hairline, boxShadow: `inset 0px 1px 0px ${colors.glassEdge}` }]}>
      <BarcodeGlyph color={colors.mutedForeground} size={13} />
      <Text
        numberOfLines={1}
        style={[t.footnoteSemibold, styles.sentScanName, { color: colors.foreground }]}
      >
        {name}
        {amount !== null && (
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>{` · ${amount}`}</Text>
        )}
      </Text>
    </View>
  );
}

const Row = memo(function Row({
  bubble,
  today,
  timezone,
  peek,
  onLogged,
  onLogManually,
  onCatch,
}: {
  bubble: Bubble;
  today?: string;
  /** This row holds the newest food card, so one of the cast peeks over it. See `CardPeek`. */
  peek?: boolean;
  /** The carrier caught this row's card. See `CardPeek`. */
  onCatch?: (who: CastName, entryId: string) => void;
  /** For guessing which meal a manually typed entry belongs to. */
  timezone?: string;
  onLogged: () => void;
  onLogManually: (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => void;
}) {
  const colors = useColors();
  const tr = useT();

  if (bubble.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userStack}>
          {bubble.photoUrl && (
            <Image
              source={{ uri: bubble.photoUrl }}
              style={[styles.photo, { borderColor: colors.hairline }]}
              resizeMode="cover"
            />
          )}
          {bubble.content.length > 0 && (
            <View style={styles.userBubbleWrap}>
              <View
                style={[
                  styles.userBubble,
                  {
                    backgroundColor: colors.primary,
                    experimental_backgroundImage: `linear-gradient(135deg, ${colors.calories} 0%, ${colors.logoRamp} 100%)`,
                    boxShadow: `0px 10px 22px -12px ${colors.calories}, inset 0px 1px 0px rgba(255,255,255,0.45)`,
                  },
                ]}
              >
                <Text style={[t.body, styles.userText, { color: colors.primaryForeground }]}>
                  {bubble.content}
                </Text>
              </View>
            </View>
          )}
          {/*
            The packets, under the sentence they were scanned into.

            Outside the bubble rather than inside it: what is in the bubble is
            what this person wrote, and a scan is something they did. Same
            reasoning as the photo above, which has always sat outside for the
            same reason — and it keeps the chips readable, since a barcode name
            is often longer than the line it would have to share.
          */}
          {bubble.scanned && bubble.scanned.length > 0 && (
            <View style={styles.sentScans}>
              {bubble.scanned.map((scan) => (
                <SentScan key={scan.barcode} scan={scan} />
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  /*
   * A person, not the model. Drawn as its own shape — see `CoachBubble` — and
   * before the wall, because a comment is never a refusal.
   */
  if (bubble.role === 'coach') {
    return (
      <View style={styles.assistantRow}>
        <CoachBubble content={bubble.content} />
      </View>
    );
  }

  if (bubble.moment) {
    return (
      <View style={styles.assistantRow}>
        <MomentCard days={bubble.moment} />
      </View>
    );
  }

  if (bubble.wall) {
    return (
      <View style={styles.assistantRow}>
        <Wall wall={bubble.wall} timezone={timezone} onLogManually={onLogManually} />
      </View>
    );
  }

  const label = bubble.tool ? toolLabel(bubble.tool, tr) : null;
  const waiting = bubble.pending && !bubble.content;
  /*
   * The weekly review is the one turn whose card *replaces* the words rather
   * than illustrating them: the card folds the prose into itself, so drawing
   * both would print the review twice — once unfolded above the thing built to
   * fold it. Every other card in the app sits under its reply.
   */
  const review = bubble.actions?.find((action) => action.card?.type === 'review');
  /** The last meal card in this row: the one the peek belongs to, when the row has it. */
  const lastFood = (bubble.actions ?? []).reduce(
    (last, action, i) => (action.card?.type === 'food' && !action.removed ? i : last),
    -1,
  );

  return (
    <View style={styles.assistantRow}>
      {/*
        What the turn said before it went to work, kept where it cannot be
        mistaken for the answer: quiet, one line per step, and gone the moment
        the reply arrives. It is the same words the model wrote, so it reads as
        the turn narrating itself rather than as a message that changed its mind.
      */}
      {bubble.pending && bubble.steps && bubble.steps.length > 0 && (
        <View style={styles.steps}>
          {bubble.steps.map((step, i) => (
            <Text key={i} style={[t.footnote, { color: colors.mutedForeground }]}>
              {step}
            </Text>
          ))}
        </View>
      )}

      {waiting ? (
        <Waiting label={label} />
      ) : review ? null : (
        <Markdown
          text={bubble.content}
          style={
            bubble.failed
              ? { color: colors.destructive, fontFamily: font.semibold }
              : undefined
          }
        />
      )}

      {bubble.actions && bubble.actions.length > 0 && (
        <View style={styles.actions}>
          {bubble.actions.map((action, i) => {
            const card = (
              <ChatActionCard
                key={`${action.entry_id ?? action.kind}-${i}`}
                action={action}
                // The two action kinds that are a correction rather than a new
                // fact, and the only thing that tells them apart on screen from a
                // fresh log — both arrive as a card with a number on it.
                touched={
                  bubble.live === true &&
                  (action.kind === 'food_updated' || action.kind === 'exercise_updated')
                }
                // The workout card posts its own answer and the server rewrites
                // this message's card into a receipt — so it has to know which
                // message it is sitting on.
                messageId={bubble.key}
                today={today}
                onLogged={onLogged}
                // Only the review card reads this; see the note above.
                text={bubble.content}
              />
            );
            // Every meal card is wrapped the same way, so the tree doesn't change
            // shape when the peek moves on to a newer one. Only the last meal in
            // the newest row is active. See `CardPeek`.
            // Removed meals stay wrapped too, just never active, so striking one out doesn't remount it.
            const food = action.card?.type === 'food' ? action.card : null;
            if (!food) return card;
            return (
              <CardPeek
                key={`${action.entry_id ?? action.kind}-${i}`}
                card={food}
                entryId={food.entry_id}
                active={peek === true && i === lastFood}
                landing={bubble.live === true && action.kind === 'food_logged'}
                correcting={bubble.live === true && action.kind === 'food_updated'}
                onCatch={onCatch}
              >
                {card}
              </CardPeek>
            );
          })}
        </View>
      )}
    </View>
  );
});

/**
 * A refused turn, and the two ways forward from it.
 *
 * The manual form opens *inside the conversation*, under the wall, rather than
 * sending anybody to the Today tab to find it. That is the part that makes this
 * an answer rather than a redirect: the sentence they typed is still on screen
 * two rows up, the form opens with it already in the name field, and the meal
 * ends up in the same day it would have.
 *
 * `logged` is what happens afterwards, and it matters more than it looks. A
 * form that simply closed would leave the wall sitting there as the last word
 * on a turn that did, in the end, work — so the card says so instead, and says
 * the thing worth knowing: that path is always open and never costs anything.
 */
function Wall({
  wall,
  timezone,
  onLogManually,
}: {
  wall: NonNullable<Bubble['wall']>;
  timezone?: string;
  onLogManually: (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  if (logged) {
    return (
      <View style={styles.wallDone}>
        <PencilGlyph color={colors.mutedForeground} size={13} />
        <Text style={[t.footnoteSemibold, styles.wallDoneText, { color: colors.mutedForeground }]}>
          {tr('wall.loggedByHand')}
        </Text>
      </View>
    );
  }

  if (open) {
    return (
      <View style={styles.wallForm}>
        <FoodEditor
          entryId={null}
          initialMeal={inferMeal(new Date(), timezone ?? 'UTC')}
          // Their own words, so the refusal did not cost them the sentence.
          initialDescription={wall.text}
          onCreate={(draft) => {
            onLogManually(draft);
            setLogged(true);
          }}
          onCancel={() => setOpen(false)}
        />
      </View>
    );
  }

  return (
    <PlanWall
      allowance={wall.allowance}
      message={wall.message}
      /*
       * Only where there is genuinely a free way to do the same thing. That is
       * true of both journal meters — a message and a photo scan are both ways
       * of saying what you ate, and typing it in says the same thing for
       * nothing. It would not be true of a meal plan, which is why this is a
       * check rather than an assumption.
       */
      onLogManually={
        !wall.allowance || wall.allowance.meter === 'chat' || wall.allowance.meter === 'photo'
          ? () => setOpen(true)
          : undefined
      }
    />
  );
}

/**
 * The dots are for silence, not for waiting.
 *
 * They cover only the gaps the stream cannot fill — before the first word, and
 * while a tool is running, which is where the label comes from. Once text is
 * arriving it speaks for itself, and there is deliberately nothing decorating
 * it: text that is visibly growing already reads as live.
 *
 * The dots are the cast now (CAST.md): the logo's three, with bodies, hopping
 * out of step. Still a bounce and not a sequence lighting up, and for the same
 * reason — three things taking turns is a *progress* indicator, and the model
 * has not said how long it will be. A hop says only that something is still
 * happening. Under Reduce Motion they stand still and the label beside them
 * says what is going on.
 */
function Waiting({ label }: { label: string | null }) {
  const colors = useColors();
  const tr = useT();

  return (
    <View style={styles.waiting} accessibilityLabel={label ?? tr('journal.thinking')}>
      {/* The three bounce on the composer for the wait (`CastLedge`); the row
          says in words what is going on. */}
      <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{label ?? tr('journal.thinking')}…</Text>
    </View>
  );
}

/**
 * Where the ledge's figures end, from the right edge: past the composer's
 * send button and its gap, so they sit on the field itself. See `Composer`'s
 * `bar` and `send` styles.
 */
const LEDGE_RIGHT = 12 + 40 + 8 + 10;

/** How long the journal sits untouched before the first of them dozes off. */
const DOZE_AFTER_MS = 120_000;
const DOZE_ORDER: CastName[] = ['plum', 'skye', 'ember'];
const NOBODY: readonly CastName[] = [];

function ChatSkeleton() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.userRow}>
        <Skeleton style={{ height: 44, width: 192, borderRadius: 22 }} />
      </View>
      <View style={{ gap: 8 }}>
        <Skeleton style={{ height: 16, borderRadius: 8 }} />
        <Skeleton style={{ height: 16, width: '60%', borderRadius: 8 }} />
      </View>
    </View>
  );
}

/** A character's macro colour, for the spark it throws. */
function macroColour(colors: ReturnType<typeof useColors>, who: CastName): string {
  return who === 'ember' ? colors.protein : who === 'skye' ? colors.carbs : colors.fat;
}

/**
 * The tucked corner of a sent bubble — `rounded-br-lg`, which is `--radius-lg`.
 *
 * Worth naming rather than inlining, because the radius scale is overridden
 * wholesale in `@theme inline` and `lg` is 16px here, not Tailwind's stock 8.
 * Read as the stock value it makes the tuck twice as sharp as the web's, which
 * is small on paper and the difference between a bubble and an arrow on screen.
 */
const TUCK = 16;

const styles = StyleSheet.create({
  // The wall and the form it opens both sit at the assistant row's own width,
  // with the ledge's overhang held open so the card below does not ride up it.
  wallForm: { paddingBottom: 4 },
  wallDone: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  wallDoneText: { flexShrink: 1 },
  flex: { flex: 1 },
  status: { paddingHorizontal: 16, paddingBottom: 12 },
  statusSkeleton: { height: 46, width: 180, borderRadius: 23 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusText: { flex: 1, gap: 1 },
  statusFigure: { fontSize: 26, lineHeight: 30 },
  miniRing: { width: 46, height: 46, borderRadius: 23 },
  burstAnchor: { height: 0, zIndex: 3 },
  ringGlow: { position: 'absolute', left: -22, top: -22, width: 90, height: 90, borderRadius: 45 },
  hello: { marginBottom: 6 },
  track: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 999 },
  burn: { marginTop: 6 },
  column: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  empty: { paddingTop: 40 },
  emptyArt: { marginBottom: 12 },
  blurb: { marginTop: 12, lineHeight: 24 },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 28 },
  prompt: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  promptLabel: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
  userRow: { alignItems: 'flex-end' },
  sentScans: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: 6, maxWidth: '100%' },
  sentScan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sentScanName: { flexShrink: 1 },
  userStack: { maxWidth: '85%', alignItems: 'flex-end', gap: 8 },
  /*
   * Square, where the web keeps the photo's own proportions under a `max-h-72`.
   *
   * The web can do that because an `<img>` sizes itself once it decodes; an RN
   * `<Image>` with a remote source has no intrinsic size and lays out at
   * whatever it is told, so honouring the aspect ratio means knowing it, and
   * the ratio of a photo pulled from `photo_url` is not known until it is
   * fetched. A fixed square with `cover` is the version that never lays out at
   * zero height and never distorts; carrying the real dimensions through is
   * worth doing when the photo becomes tappable.
   */
  photo: { width: 240, height: 240, borderRadius: 24, borderWidth: 1 },
  /*
   * Lit rather than ledged, like every surface since the glow-up: the logo's
   * green-to-teal ramp and a glow of its own colour under it. Still drawn here
   * rather than with <Chunk>, because the corner nearest the sender is tucked
   * in — which is the whole reason a chat bubble reads as coming *from*
   * somewhere.
   */
  userBubbleWrap: { alignSelf: 'flex-end' },
  userBubble: {
    borderRadius: 22,
    borderBottomRightRadius: TUCK,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // `leading-relaxed`, which overrides the 24 that `text-body` sets.
  userText: { fontFamily: font.semibold, lineHeight: 26 },
  assistantRow: { maxWidth: '92%', gap: 10 },
  actions: { gap: 6 },
  receipt: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  steps: { gap: 4, paddingBottom: 2 },
  skeleton: { gap: 20, paddingTop: 16 },
});
