import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';
import type { DaySummary, ExerciseEntry, FoodEntry, FoodItemInput, Locale, Meal } from '@ct/shared';
import { formatBodyWeight, formatDay, formatDistance, formatMass, formatNumber, inferMeal } from '@ct/shared';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';
import { Chunk } from '@/components/Chunk';
import { DateStrip } from '@/components/DateStrip';
import { GlowRing } from '@/components/GlowRing';
import { Glossy, type GlossyName } from '@/components/icons/Glossy';
import { CastShelf } from '@/components/cast/Presence';
import { bounceTab, claimAll, visit } from '@/components/cast/stage';
import { castMemory, holderOf, noteEarned, takeBadge } from '@/lib/cast-memory';
import { requestCompose } from '@/lib/compose';
import { MomentBurst, MomentCard, useStreakMoment } from '@/components/cast/StreakMoment';
import { ReplayDrop, useReplay } from '@/components/ReplayDay';
import type { CastName, Cue } from '@/components/cast/Character';
import { Serif } from '@/components/Serif';
import { Sky, useSky } from '@/components/Sky';
import { greetingFor } from '@/lib/greeting';
import { StreakChip } from '@/components/StreakChip';
import { DietQuality } from '@/components/DietQuality';
import { FoodEditor } from '@/components/FoodEditor';
import { groupSets } from '@/components/ChatCard';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { MacroBars } from '@/components/MacroBars';
import { RepeatMeals } from '@/components/RepeatMeals';
import { StepsCard } from '@/components/StepsCard';
import { CoachBanner } from '@/components/CoachBanner';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { beforeDayStart, loadDay, localToday, pendingIds, withPending } from '@/lib/day';
import { drop, enqueue, newId, onRejected } from '@/lib/outbox';
import { maybeAskForReview } from '@/lib/review-prompt';
import { useOutbox } from '@/hooks/useOutbox';
import { useUnits } from '@/lib/units';
import { duration, ease, font, tint, type as t, useColors, useType, type Palette } from '@/theme';
import { haptics } from '@/lib/haptics';
import { entryRemoved } from '@/lib/removals';
import { DeferToRows, removeAction, repeatAction, SwipeRow } from '@/components/SwipeRow';
import { Glyph } from '@/components/Glyph';
import { Material } from '@/components/Material';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';
import { useCountUp } from '@/hooks/useCountUp';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useSteps } from '@/hooks/useSteps';
import { openStepsSettings } from '@/lib/steps';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { writeDaySnapshot } from '@/lib/snapshot';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';

/** The `date` the calendar links here with. Anything else is ignored. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const NO_ENTRIES: FoodEntry[] = [];
/*
 * Glossy icons again (CAST.md, fourth pass). Each meal held one of the cast for a
 * release, which put Ember on the shelf, on breakfast and on the snack at once —
 * three of one character is a sticker sheet, not somebody.
 */
const MEAL_ICON: Record<Meal, GlossyName> = {
  breakfast: 'egg',
  lunch: 'bowl',
  dinner: 'fish',
  snack: 'apple',
};
/** Message keys rather than words — resolved per render, see (tabs)/_layout.tsx. */
const MEAL_LABEL: Record<Meal, StringKey> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
  snack: 'meal.snack',
};

export default function TodayScreen() {
  const locale = useLocale();
  const tr = useT();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const colors = useColors();
  const type = useType();
  const sky = useSky();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const router = useRouter();
  const toast = useToast();
  const undoably = useUndoableRemoval();

  /*
   * The compact bar's clock. Both shared values rather than refs: the worklet
   * below reads them every frame, and Reanimated freezes a plain object the
   * first time one is captured — see `Sheet`, which learned that the expensive
   * way.
   */
  const scrollY = useSharedValue(0);
  const headerHeight = useSharedValue(96);
  /*
   * Only so the bar can stop swallowing touches while it is invisible. Flipped
   * from a reaction rather than read per frame, so the JS thread hears about
   * this twice a screen rather than sixty times a second.
   */
  const [stuck, setStuck] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > headerHeight.value * 0.7,
    (past, previous) => {
      if (past !== previous) runOnJS(setStuck)(past);
    },
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const compact = useAnimatedStyle(() => {
    /*
     * Fades over the second half of the header's own travel, so it arrives as
     * the thing it replaces is leaving rather than the two overlapping at full
     * strength — which would read as two headers rather than one changing
     * shape.
     */
    const from = headerHeight.value * 0.45;
    const to = headerHeight.value * 0.9;
    const progress = Math.max(0, Math.min(1, (scrollY.value - from) / (to - from)));
    return { opacity: progress, transform: [{ translateY: (1 - progress) * -6 }] };
  });

  const params = useLocalSearchParams<{ date?: string }>();
  const requested = typeof params.date === 'string' && ISO_DATE.test(params.date) ? params.date : null;

  const { profile } = useAuth();
  const intents = useOutbox();
  /*
   * Whether the day on screen came off the network or off the disk. Not an
   * error state — the numbers are the last true ones plus whatever is queued —
   * so it is reported as a footnote rather than a banner. See OFFLINE.md §6.
   */
  const [live, setLive] = useState(true);
  /*
   * Every day fetched this session, by date, rather than only the last one.
   *
   * Holding just the one meant a step to another day had nothing to draw until
   * the round trip came back: the strip, the heading and the ring all sat on
   * the old day for as long as the network took, which read as the tap not
   * having landed. A day already seen is drawn at once and refetched
   * underneath; a day never seen is a skeleton. Neither is the disk cache —
   * everything here came off the network in this session, so the rule in
   * `loadDay` about not serving old copies to feel fast still holds.
   */
  const [loaded, setLoaded] = useState<Record<string, DaySummary>>({});
  /*
   * The date being shown, or null for "whatever the server calls today". Held
   * as a date rather than an offset so History can link straight to a day.
   *
   * Seeded from the param, and then re-applied whenever the param *changes*.
   * The web can seed this once at render because arriving at `/today?date=…`
   * mounts the page; here Today is a tab that is already mounted and stays
   * mounted, so an initialiser alone would read the param exactly once — at
   * launch, when there is never one — and every later link from the calendar
   * would land on a screen that ignored it. Guarded on the previous value so
   * that stepping days afterwards is not dragged back by the stale param.
   */
  const [date, setDate] = useState<string | null>(requested);
  const appliedParam = useRef(requested);
  const [today, setToday] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  /*
   * The session opened, and the one being rewritten. Two ids rather than one
   * flag because the row expands to show the sets — which is the whole answer
   * to "what did I log?" — and only then offers to change them.
   */
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  /*
   * Which fetch is allowed to publish its result.
   *
   * Stepping through days quickly issues overlapping requests, and they do not
   * come back in the order they were sent. Without this the day on screen is
   * whichever response happened to be slowest rather than the one that was
   * asked for last.
   */
  const latest = useRef(0);
  /*
   * The day before the one on screen, fetched quietly so the swipe back to it
   * has something to slide in. Once per date per session — the swipe is the
   * common move and a wasted request is cheap, but not on every refocus.
   */
  const asked = useRef(new Set<string>());
  const prefetch = useCallback(
    (localDate: string) => {
      if (!profile || asked.current.has(localDate)) return;
      asked.current.add(localDate);
      loadDay(profile.id, localDate)
        .then(({ day: summary, live: fresh }) => {
          if (!fresh) return;
          setLoaded((all) => (all[summary.local_date] ? all : { ...all, [summary.local_date]: summary }));
        })
        .catch(() => asked.current.delete(localDate));
    },
    [profile],
  );

  const load = useCallback(
    async (target: string | null) => {
      const seq = ++latest.current;
      /*
       * A date is resolved here rather than left to the server when there is a
       * profile to resolve it with. Asking for "today" with no date is a
       * question only a reachable server can answer, and it is exactly the
       * question being asked when the network is gone — so the phone works out
       * its own local date first, and the cache has something to be keyed by.
       */
      const resolved = target ?? (profile ? localToday(profile) : null);
      try {
        const { day: summary, live: fresh } = await loadDay(profile?.id ?? '', resolved);
        if (seq !== latest.current) {
          // Overtaken, but still a true answer about its own day — kept if
          // there is nothing better, so stepping back to it is instant.
          setLoaded((all) => (all[summary.local_date] ? all : { ...all, [summary.local_date]: summary }));
          return;
        }
        setLoaded((all) => ({ ...all, [summary.local_date]: summary }));
        noteEarned(summary);
        setLive(fresh);
        setError(null);
        // Today is whatever the server says when asked without a date; it
        // honours day_start_hour, so it is not always the device's calendar
        // date. Offline the phone's own answer stands in, computed the same way.
        if (target === null) setToday(summary.local_date);
        if (fresh) prefetch(shiftDate(summary.local_date, -1));
      } catch (e) {
        if (seq !== latest.current) return;
        setError(messageOf(e, tr));
      }
    },
    [profile, prefetch],
  );

  /*
   * The day being looked at, known the moment it is chosen — before anything
   * about it has come back. Null only on the very first load, before the
   * server has said which day today is.
   */
  const shownDate = date ?? today;
  const onToday = date === null || date === today;
  const fetched = shownDate === null ? null : (loaded[shownDate] ?? null);
  /*
   * The last day drawn, kept on the page — hidden, and deaf to touches — while
   * the one chosen is still on its way, with the skeleton laid over it.
   *
   * Swapping the page for the skeleton outright would unmount it and mount it
   * again a round trip later, and a fresh mount restarts every looping
   * animation in it — the cast, the ring's orbit — which on Android floods the
   * log with a stack trace per failed prop update while the day slides in.
   */
  const held = useRef<DaySummary | null>(null);
  if (fetched) held.current = fetched;
  const source = fetched ?? held.current;
  const ready = fetched !== null;
  /** The optimistic edits below, applied to the day they were made on. */
  const patchDay = (localDate: string, change: (day: DaySummary) => DaySummary) =>
    setLoaded((all) => {
      const current = all[localDate];
      return current ? { ...all, [localDate]: change(current) } : all;
    });

  /*
   * What the screen actually draws: the day as fetched, plus everything still
   * in the queue, re-added up by the same function the API uses.
   */
  const day = source === null ? null : withPending(source, intents);
  const unsent = pendingIds(intents, source?.local_date ?? '');
  /** Everything queued, not just what shows on this day — deletes count too. */
  const waiting = intents.length;

  useEffect(() => {
    // A failure belongs to the day that failed, not to the one stepped to.
    setError((current) => (current === null ? current : null));
    void load(date);
  }, [load, date]);

  /*
   * And again every time the tab comes back.
   *
   * The web refetches this screen for free, because reaching it there is a
   * navigation and the page mounts. Here it is a tab: it mounts once, on the
   * first visit, and then stays mounted for the life of the app — so the effect
   * above was the only fetch a session ever made unless the date changed.
   * Meanwhile everything that puts food in the day happens somewhere else. A
   * sentence in the Journal, a recipe in Cook; neither can reach this copy of
   * the day, so what the screen drew on first open is what it kept drawing
   * until the user thought to pull down. Coming back to a tab is the moment the
   * question "what have I eaten" is being asked again, so it is the moment to
   * go and ask.
   *
   * A day already drawn stays drawn while `load` asks again, so this refills the
   * screen underneath the reader rather than throwing it back to skeletons.
   *
   * The date is read through a ref so this callback can stay stable: the hook
   * re-runs the effect whenever the callback changes identity, and one that
   * closed over `date` would fetch a second time on every step through the
   * days.
   */
  const shown = useRef(date);
  useEffect(() => {
    shown.current = date;
  }, [date]);
  /*
   * And again whenever the queue gets shorter.
   *
   * Without this a meal vanishes the moment it syncs: `withPending` stops
   * drawing it as soon as the intent is gone, and the fetched day underneath is
   * the one from before it was sent. Watching the count rather than the
   * contents because that is the only thing that can shrink — an intent is
   * never edited in place, only added and removed.
   */
  /*
   * A meal the server refused.
   *
   * The queue drops it — a 400 will be a 400 next time too — but silently
   * dropping it is how somebody's dinner disappears between looking at it and
   * looking again. The toast is the only place this can be said, because the
   * row it is about has already left the screen.
   */
  useEffect(
    () =>
      onRejected((intent, reason) => {
        const what =
          intent.kind === 'create'
            ? intent.payload.description
            : intent.kind === 'repeat'
              ? intent.preview.description
              : tr('today.thatChange');
        toast.error(tr('today.couldNotSave')(what, reason));
        void load(shown.current);
      }),
    [load, toast],
  );

  const queued = useRef(intents.length);
  useEffect(() => {
    const shrank = intents.length < queued.current;
    queued.current = intents.length;
    if (shrank) void load(shown.current);
  }, [intents.length, load]);
  /*
   * Set when the tab is left, which is what makes the *first* focus silent —
   * the mount above has already fetched, and this fires on that same focus.
   */
  const left = useRef(false);
  /*
   * The three come to the shelf whenever Today is on show — flown over from the
   * journal's ledge when that is where they were (CAST.md, fourth pass).
   */
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) claimAll('today', () => 'day.shelf');
  }, [focused]);
  /*
   * While Today re-reads itself on coming back, a higher total is a meal logged in
   * the journal, which celebrated it there. The ring takes the new number quietly.
   */
  const quietUntil = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (left.current) {
        quietUntil.current = Date.now() + 5000;
        void load(shown.current);
      }
      return () => {
        left.current = true;
      };
    }, [load]),
  );

  const isToday = day !== null && today !== null && day.local_date === today;

  /*
   * A streak milestone reached while Today is the screen on show: the shelf
   * celebrates — Ember with the flame, the other two cheering — confetti comes off
   * the card, and the words sit under the run's chip for the rest of the visit.
   */
  const moment = useStreakMoment(isToday ? day?.streak : null, profile?.id);

  const { replay, start: startReplay } = useReplay(
    day?.food_entries ?? NO_ENTRIES,
    day?.consumed.kcal ?? 0,
    locale,
    profile?.timezone,
  );
  // Whoever each replayed meal is mostly made of hops where they sit.
  useEffect(() => {
    if (!replay.hop) return;
    const { name, key } = replay.hop;
    setShelfCues((prev) => ({ ...prev, [name]: { mood: 'cheer', ms: 600, hop: true, key: Date.now() + key } }));
  }, [replay.hop?.key]);

  /* A badge just earned: its holder hops from the shelf to the Progress tab and back. */
  useEffect(() => {
    if (!focused || castMemory.pendingBadges.length === 0) return;
    const timer = setTimeout(() => {
      const badge = takeBadge();
      if (!badge) return;
      visit(holderOf(badge), 'tab.progress', () => {
        haptics.selected();
        bounceTab('progress');
      });
    }, 1400);
    return () => clearTimeout(timer);
  }, [focused, day]);
  const [shelfCues, setShelfCues] = useState<Partial<Record<CastName, Cue>>>({});
  useEffect(() => {
    if (!moment) return;
    const at = Date.now();
    setShelfCues({ ember: { mood: 'proud', ms: 2600, hop: true, key: at } });
    const later = [
      setTimeout(() => setShelfCues((prev) => ({ ...prev, skye: { mood: 'cheer', ms: 1600, key: at + 1 } })), 180),
      setTimeout(() => setShelfCues((prev) => ({ ...prev, plum: { mood: 'cheer', ms: 1600, key: at + 2 } })), 360),
    ];
    return () => later.forEach(clearTimeout);
  }, [moment?.key]);

  /*
   * The phone's own count, read on this screen because this is the screen that
   * knows which day is being looked at. It never touches the ring above it:
   * steps inform the target over weeks, and are not an ingredient of it today.
   * See `lib/steps.ts`.
   */
  const {
    steps,
    permission: stepPermission,
    empty: stepsEmpty,
    enable: enableSteps,
  } = useSteps(profile, isToday, day?.steps ?? null);

  /*
   * Keep the home screen in step, but only while this screen is actually
   * showing today — stepping back to Tuesday must not leave Tuesday's ring on
   * the launcher.
   *
   * Watching `day` rather than the fetched summary, because `day` is what the
   * ring above is drawing: it carries the optimistic edits too, so deleting a
   * meal moves the widget at the same moment it moves the screen rather than
   * after the round trip.
   *
   * Keyed on the numbers instead of the object, which is rebuilt every render
   * by `withPending` and would otherwise rewrite the note on every keystroke.
   */
  useEffect(() => {
    if (!day || !isToday) return;
    /*
     * `steps` rather than `day.steps`, so the home screen gets the count this
     * session just read off the sensor instead of the one the server held when
     * the day was fetched. It is the same preference `useSteps` makes for the
     * screen, and without it the widget would sit a sync behind the row three
     * inches above it.
     */
    void writeDaySnapshot({ ...day, steps }, locale, profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, locale, profile, steps, day?.local_date, day?.consumed.kcal, day?.targets.kcal, day?.burned_kcal]);

  /*
   * The ask for a store rating. Why this moment and not another is in
   * `lib/review-prompt.ts`; what belongs here is only when it is safe to ask.
   *
   * `isToday`, because a run is a claim about now. `day.streak` is null on
   * every other day already, so this is belt and braces — but stepping back
   * through the calendar should not be able to trigger anything at all.
   *
   * An empty queue, because an ask that arrives while meals are still waiting
   * to send is an ask made over the top of the app visibly not working. The
   * milestone is not spent by skipping it; the next launch on a live
   * connection gets it.
   */
  useEffect(() => {
    if (!isToday || waiting > 0) return;
    const run = day?.streak?.current;
    if (typeof run !== 'number') return;
    void maybeAskForReview(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, waiting, day?.streak?.current]);
  /*
   * Swipe the day across.
   *
   * MOBILE-UX §3 dropped this once, and the reason was sound: a screen-level
   * horizontal pan competes with swipe-to-delete on every row of this same
   * screen, and losing a shipped gesture to a convenience is a bad trade. What
   * has changed is that the arbitration turns out to be stateable rather than
   * guessy — a finger that lands on a meal is talking about that meal, and
   * `DeferToRows` says so to the gesture system, so the pan can only take over
   * where there is no row under the thumb. That is most of the day: the ring,
   * the macros, the quality panel, the headings, the space beside them.
   *
   * Not the header. The strip of days is a horizontal scroller of its own, and
   * with the pan over it too, running a thumb along the week stepped the day
   * back instead of scrolling — the strip never moved and the day did.
   *
   * The page follows the finger rather than waiting for the lift, because a
   * gesture that answers only on release is indistinguishable from one that is
   * not there — and this one has to be discoverable by trying it.
   */
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const drift = useSharedValue(0);
  const fade = useSharedValue(1);
  /*
   * Mirrored into a shared value because the wall at today has to be felt on
   * the drag itself. Read off the JS thread it would arrive a frame late, which
   * on the one gesture the app refuses is exactly where it would be noticed.
   */
  const atToday = useSharedValue(true);
  /** Whether the page holds the chosen day, or an old one hidden under the skeleton. */
  const present = useSharedValue(true);
  useEffect(() => {
    atToday.value = onToday;
    present.value = ready;
  }, [onToday, ready, atToday, present]);

  /**
   * Every change of day comes through here.
   *
   * Today is held as null, however it was reached, so there is one way to be on
   * it. The old day fades out first, a touch towards the side it is leaving
   * by, and the new one is drawn only once that has finished — on the UI
   * thread, where it is known to have. Hiding it from here instead, alongside
   * the `setDate`, loses the race with React's commit: the new day was drawn in
   * place at full strength for a frame or two and then jumped aside to slide
   * in, which is the flicker this is here to prevent.
   *
   * One render for the whole change, not one for the heading and another for
   * the page: a render of this screen is the expensive part of a step, and the
   * fade is already under way while it happens. The strip marks the day the
   * moment it is tapped, on its own (see `DateStrip`).
   *
   * `hidden` is the swipe, which has already taken the old day off the page.
   */
  const heading = useRef<string | null | undefined>(undefined);
  const land = useCallback((next: string | null) => {
    heading.current = undefined;
    setDate(next);
  }, []);
  const go = (next: string | null, hidden = false): boolean => {
    const normal = next === today ? null : next;
    const current = heading.current === undefined ? date : heading.current;
    if (normal === current) return false;
    if (hidden || reduced || normal === date || (normal === null && onToday)) {
      // Back to the day still on the page before it had finished leaving:
      // overruling the fade also cancels its hand-over to the other day.
      if (heading.current !== undefined && !hidden) {
        drift.value = withTiming(0, { duration: duration.quick, easing: ease.out });
        fade.value = withTiming(1, { duration: duration.quick });
      }
      land(normal);
      return true;
    }
    heading.current = normal;
    const later = (normal ?? today ?? '') >= (shownDate ?? '');
    const out = { duration: 90, easing: ease.out };
    drift.value = withTiming(later ? -16 : 16, out);
    fade.value = withTiming(0, out, (finished) => {
      if (finished) runOnJS(land)(normal);
    });
    return true;
  };
  const step = (by: number, hidden = false) => {
    const from = heading.current === undefined ? date : heading.current;
    return go(shiftDate(from ?? today ?? day?.local_date ?? '', by), hidden);
  };

  useEffect(() => {
    if (requested === appliedParam.current) return;
    appliedParam.current = requested;
    if (requested) go(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  /*
   * `step` closes over the day on screen, so it is a new function every render;
   * the gesture is not, and must not be, or the relation the rows hold against
   * it would be rebuilt on every scroll frame. The ref is the seam between the
   * two.
   */
  const stepper = useRef(step);
  const chooser = useRef(go);
  useEffect(() => {
    stepper.current = step;
    chooser.current = go;
  });
  // Stable, so the strip — memoised — is not redrawn by every render of Today.
  const choose = useCallback((next: string) => chooser.current(next), []);
  const stepBy = useCallback(
    (by: number) => {
      if (stepper.current(by, true)) return;
      /*
       * The new day brings the page back as it arrives (see `pageKey`). A step
       * that changed nothing has no new day, and would otherwise leave the page
       * swiped off and invisible for good.
       */
      drift.value = withTiming(0, { duration: duration.quick, easing: ease.out });
      fade.value = withTiming(1, { duration: duration.quick });
    },
    [drift, fade],
  );
  const buzz = useCallback(() => haptics.selected(), []);
  /** A thumb on the page overrules a tapped day still fading in. */
  const abandon = useCallback(() => {
    heading.current = undefined;
  }, []);

  const swipe = useMemo(() => {
    /** Where the page is gone by: past here it has nothing left to show. */
    const gone = width * 0.6;
    const settle = { duration: reduced ? 0 : duration.quick, easing: ease.out };
    return (
      Gesture.Pan()
        /*
         * Deliberate, and sideways. The activation offset is wide because this
         * is the longest screen in the app and almost every finger on it is
         * trying to scroll; `failOffsetY` gives the gesture up the moment one
         * of them turns out to be.
         */
        .activeOffsetX([-20, 20])
        .failOffsetY([-14, 14])
        .onStart(() => {
          runOnJS(abandon)();
        })
        .onChange((event) => {
          const x = event.translationX;
          if (x < 0 && atToday.value) {
            /*
             * Tomorrow has not happened, so the edge has to read as a wall the
             * page is up against rather than as a swipe that was ignored: it
             * gives a little and then stops giving, however far the thumb goes.
             */
            drift.value = -32 * (1 - Math.exp(x / 140));
            fade.value = present.value ? 1 : 0;
            return;
          }
          // With the finger, one to one, and fading as it goes — the day is
          // being handed over, and a page at full strength half off the screen
          // reads as the layout breaking rather than as a page turning.
          drift.value = x;
          fade.value = present.value ? 1 - Math.min(Math.abs(x) / gone, 1) * 0.75 : 0;
        })
        .onEnd((event) => {
          const x = event.translationX;
          const forward = x < 0;
          /*
           * Distance *or* speed, like the sheet's dismiss: a slow drag a quarter
           * of the way and a quick flick both plainly mean "the next one". A
           * flick back the way it came means "never mind".
           */
          const decided =
            !(forward && atToday.value) &&
            (Math.abs(x) > width * 0.25 ||
              (Math.abs(event.velocityX) > 500 && Math.sign(event.velocityX) === Math.sign(x)));
          if (!decided) {
            // Home, with `ease.out` and not the spring — an overshoot on the
            // way back to where it started reads as the screen coming loose.
            drift.value = withTiming(0, settle);
            fade.value = withTiming(present.value ? 1 : 0, settle);
            return;
          }
          runOnJS(buzz)();
          /*
           * Off the rest of the way, and only then the step. The next day
           * arrives from the far side once it is drawn — see `pageKey` — so what
           * is on screen in between is nothing, never the old day sliding back
           * in to have its numbers change under the reader.
           */
          const leave = { duration: reduced ? 0 : 150, easing: ease.out };
          fade.value = withTiming(0, leave);
          drift.value = withTiming(forward ? -gone : gone, leave, (finished) => {
            if (finished) runOnJS(stepBy)(forward ? 1 : -1);
          });
        })
    );
  }, [abandon, atToday, buzz, drift, fade, present, reduced, stepBy, width]);

  /*
   * Carried by the day and not by the scroller.
   *
   * On the `ScrollView` itself this moved the viewport — its own background and
   * its clip bounds went with it, so the drag slid the whole window sideways
   * off the screen behind it, and slid it *under* the compact bar, which is
   * outside the scroller and stayed exactly where it was. The frame is meant to
   * be the thing that holds still while the day inside it moves — and so are
   * the sky and the header above it, which belong to the hour, not the day.
   */
  const sliding = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: drift.value }],
  }));

  /*
   * The day arriving: from the left for an earlier day and the right for a
   * later one, worked out against the day that was showing — so a tap on the
   * strip, the arrows, "back to today" and the swipe all move the same way.
   * Nothing on the first draw; the screen opening is not a day changing.
   *
   * Played on the frame rather than by remounting the day under a key. A fresh
   * mount would have been the tidier sequence, but it restarts every looping
   * animation on the page — the cast, the ring's orbit — and on Android that
   * floods the log with a stack trace per failed prop update for seconds after
   * each step, which stalls the very slide it is meant to be.
   */
  const pageKey = onToday ? 'today' : (date ?? 'today');
  const drawn = useRef<{ key: string; date: string | null } | null>(null);
  useEffect(() => {
    const previous = drawn.current;
    if (!ready) {
      // Nothing to bring in yet. The day being left stays out of sight under
      // the skeleton — already faded by `go` or the swipe, except when motion
      // is reduced and nothing faded it.
      if (previous && previous.key !== pageKey) fade.value = 0;
      return;
    }
    drawn.current = { key: pageKey, date: shownDate };
    if (!previous || previous.key === pageKey) return;
    const side = (shownDate ?? '') >= (previous.date ?? '') ? 1 : -1;
    const distance = reduced ? 0 : Math.min(width * 0.22, 96);
    drift.value = withSequence(
      withTiming(side * distance, { duration: 0 }),
      withTiming(0, { duration: reduced ? 0 : 280, easing: ease.out }),
    );
    fade.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: reduced ? 0 : 220 }));
    // Only a change of day plays it, and only once that day is there to show;
    // today's date arriving on the first load is the same page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, ready]);
  useEffect(() => {
    if (drawn.current) drawn.current.date = shownDate;
  }, [shownDate]);

  /*
   * The three things on this screen that answer over it rather than in it.
   *
   * All three are gone by the time there is anything to say. A deleted row is
   * taken out optimistically — and now offers its own way back, see
   * `useUndoableRemoval` — so a failure has no row left to sit under and
   * `error` — which heads the screen and belongs to the day failing to load —
   * would report it a full scroll away from where it happened. A repeat jumps
   * the screen back to today, which redraws everything including any inline
   * message. So the receipt goes over the top, where it can outlive its subject.
   */
  function removeEntry(entry: FoodEntry) {
    /*
     * A meal that has never been sent is removed by forgetting we meant to
     * send it. There is no row on the server to delete and no id it would
     * accept, so a `delete` intent here would be a 404 the queue could not act
     * on — and the undo is simply putting the intent back.
     */
    if (unsent.has(entry.id)) {
      const forgotten = intents.find((intent) => intent.id === entry.id);
      void drop(entry.id);
      undoably(tr('toast.removed')(entry.description), {
        commit: () => {},
        restore: () => {
          if (forgotten) void enqueue(forgotten);
        },
      });
      return;
    }

    /*
     * The totals come off here rather than being left to the reload.
     *
     * They used to be corrected by the `load` that followed the delete, which
     * was fine when the delete went out immediately. Now that it is held for
     * four seconds, leaving them would mean the ring above kept counting a meal
     * the reader had just watched leave the screen — and the ring is the first
     * thing they look at.
     *
     * `quality` is not adjusted, because it cannot be: coverage is a share of
     * the day's calories and not a sum that an entry can be subtracted from.
     * It settles on the next load.
     */
    const before = fetched;
    if (before) {
      patchDay(before.local_date, (prev) => ({
        ...prev,
        food_entries: prev.food_entries.filter((e) => e.id !== entry.id),
        consumed: {
          kcal: prev.consumed.kcal - entry.kcal,
          protein_g: prev.consumed.protein_g - entry.protein_g,
          carbs_g: prev.consumed.carbs_g - entry.carbs_g,
          fat_g: prev.consumed.fat_g - entry.fat_g,
        },
        net_kcal: prev.net_kcal - entry.kcal,
      }));
    }

    undoably(tr('toast.removed')(entry.description), {
      commit: () => {
        /*
         * Queued rather than sent. The four seconds of undo have already
         * elapsed, so this is the decision — and a decision made in a lift
         * should survive the lift. The queue sends it when there is a network
         * and, until then, `withPending` keeps the meal off the screen.
         */
        void enqueue({
          kind: 'delete',
          id: newId(),
          userId: profile?.id ?? '',
          entryId: entry.id,
          queuedAt: new Date().toISOString(),
        });
        // The journal is mounted on the next tab with this meal's card in it,
        // and nothing there re-reads the conversation. Tell it.
        entryRemoved(entry.id);
        void load(date);
      },
      restore: () => {
        if (before) patchDay(before.local_date, () => before);
      },
    });
  }

  /**
   * Totals are adjusted optimistically because they head the section.
   *
   * This used to carry a note saying exercise had no expand-to-edit affordance
   * and was corrected in the journal instead. It was true and it was a dead
   * end: the journal had no tool that could change a logged session either, so
   * the only correction available anywhere in the product was this delete. The
   * row expands now, and a counted session reopens in the card that logged it.
   */
  function removeExercise(entry: ExerciseEntry) {
    const burn = Math.round(entry.kcal_burned);
    const before = fetched;
    if (before) {
      patchDay(before.local_date, (prev) => ({
        ...prev,
        exercise_entries: prev.exercise_entries.filter((e) => e.id !== entry.id),
        burned_kcal: prev.burned_kcal - burn,
        net_kcal: prev.net_kcal + burn,
      }));
    }

    undoably(tr('toast.removed')(entry.description), {
      commit: () => {
        void api
          .deleteExerciseEntry(entry.id)
          .then(() => entryRemoved(entry.id))
          .catch((e: Error) => toast.error(messageOf(e, tr)))
          .finally(() => void load(date));
      },
      restore: () => {
        if (before) patchDay(before.local_date, () => before);
      },
    });
  }

  /**
   * Clones a past entry to now — which is today, so jump back there to show it.
   *
   * Queued rather than sent directly, which makes the offline case identical to
   * the online one: the copy appears on today at once either way, and the only
   * difference is how long it takes the server to hear about it. The `client_id`
   * is what makes that safe to retry.
   */
  function repeatEntry(entry: FoodEntry) {
    void enqueue({
      kind: 'repeat',
      id: newId(),
      userId: profile?.id ?? '',
      // Repeat logs at the current time, so the copy lands on today whatever
      // day is being looked at — which is why the screen jumps back to it.
      localDate: today ?? '',
      entryId: entry.id,
      meal: entry.meal,
      preview: {
        description: entry.description,
        kcal: entry.kcal,
        protein_g: entry.protein_g,
        carbs_g: entry.carbs_g,
        fat_g: entry.fat_g,
      },
      queuedAt: new Date().toISOString(),
    });
    haptics.logged();
    toast.success(tr('toast.logged')(entry.description, formatNumber(Math.round(entry.kcal), locale)));
    go(null);
    void load(null);
  }

  /**
   * A meal typed in, handed to the queue rather than to the API.
   *
   * Always queued, online or not. The alternative is two paths that behave
   * differently on a good connection and only diverge where it is hardest to
   * test — and the queue sends immediately when it can, so the online case
   * costs a tick of the event loop and nothing else.
   */
  function logManually(draft: { description: string; meal: Meal; items: FoodItemInput[] }) {
    setComposing(false);
    void enqueue({
      kind: 'create',
      id: newId(),
      userId: profile?.id ?? '',
      localDate: day?.local_date ?? today ?? '',
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
  }

  const byMeal = MEAL_ORDER.map((meal) => ({
    meal,
    entries: day?.food_entries.filter((e) => e.meal === meal) ?? [],
  })).filter((group) => group.entries.length > 0);

  /** What stands in for a day that has not arrived: the reason, or its outline. */
  const placeholder = error ? (
    <Text style={[t.footnoteSemibold, styles.centred, styles.loading, { color: colors.destructive }]}>{error}</Text>
  ) : (
    <View style={styles.loading}>
      <Skeleton style={styles.loadingRing} />
      <Skeleton style={styles.loadingBar} />
    </View>
  );

  return (
    <>
    {/* Around the scroller and not inside it, so every row on the screen —
        including any added later — inherits the right to outrank the pan. */}
    <DeferToRows gesture={swipe}>
    <Animated.ScrollView
      ref={scrollRef}
      style={styles.flex}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.mutedForeground}
          onRefresh={() => {
            setRefreshing(true);
            void load(date).finally(() => setRefreshing(false));
          }}
        />
      }
    >
      {/*
        * The sky of the hour, behind the greeting, the days and the ring. It is
        * laid under the content and scrolls away with it; nothing in it is ever
        * drawn over a word. See `<Sky>` and GLOW-UP.md.
        */}
      <Sky sky={sky} height={insets.top + 520} hazeTop={insets.top + 330} />
      <View
        style={[styles.header, { paddingTop: insets.top + 14 }]}
        onLayout={(event) => {
          headerHeight.value = event.nativeEvent.layout.height;
        }}
      >
        {/* The greeting is the way to the calendar, as the date was: on the web a
            pointer finds History by hovering the heading, and a thumb has no such
            move, so the line under it wears the calendar mark at rest. */}
        <Pressable
          onPress={() => router.push('/history')}
          accessibilityRole="button"
          accessibilityLabel={tr('today.viewCalendar')}
          style={({ pressed }) => [styles.greeting, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Serif
            accessibilityRole="header"
            numberOfLines={2}
            style={[type.greeting, { color: sky.inkLight ? colors.skyInk : colors.foreground }]}
          >
            {onToday || !shownDate ? greetingFor(tr, profile?.display_name ?? null) : formatLocalDay(shownDate, locale)}
          </Serif>
          <View style={styles.headerSub}>
            <CalendarMark color={sky.inkLight ? colors.skyInk : colors.mutedForeground} />
            <Text
              style={[
                t.footnoteSemibold,
                { color: sky.inkLight ? colors.skyInk : colors.mutedForeground, opacity: sky.inkLight ? 0.85 : 1 },
              ]}
            >
              {onToday && today ? formatLocalDay(today, locale) : tr('today.viewCalendar')}
            </Text>
          </View>
        </Pressable>

        {today && (
          <DateStrip
            today={today}
            selected={shownDate ?? today}
            onSelect={choose}
            onSky={sky.inkLight ? 'dark' : 'light'}
          />
        )}

        {/* In the flow under the strip, never floating over it. */}
        {!onToday && (
          <View style={styles.backRow}>
            <Pressable
              onPress={() => {
                haptics.selected();
                go(null);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.backChip,
                { backgroundColor: colors.glassStrong, boxShadow: colors.shadow, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[t.footnoteBold, { color: colors.caloriesText }]}>{tr('today.backToToday')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/*
        * The day itself: the one part of the screen that belongs to the date
        * rather than to the hour, so the only part that moves when it changes.
        *
        * The pan sits on the frame and the transform on the view inside it, so
        * the gesture measures the finger against something that holds still.
        */}
      <GestureDetector gesture={swipe}>
      <View collapsable={false}>
      <Animated.View style={sliding} collapsable={false} pointerEvents={ready ? 'auto' : 'none'}>
      {!day ? (
        placeholder
      ) : (
        <View style={styles.page}>
          <CoachBanner />
          <View style={styles.summary}>
            {/* Hold the ring to replay the day. See `ReplayDay`. */}
            <Pressable
              onLongPress={isToday ? startReplay : undefined}
              delayLongPress={380}
              accessible={false}
            >
              <ReplayDrop current={replay.current} />
              <GlowRing
                consumed={replay.consumed}
                target={day.targets.kcal}
                burned={day.burned_kcal}
                day={day.local_date}
                announce={!replay.running && Date.now() > quietUntil.current}
              />
            </Pressable>
            <Total consumed={replay.consumed} target={day.targets.kcal} />
            {day.burned_kcal > 0 && (
              <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
                {tr('rail.netAfterExercise')(formatNumber(day.net_kcal, locale))}
              </Text>
            )}
            {/* Null on every day but today — see `DaySummary.streak`. A run
                counted against a Tuesday in March is not a thing anybody opened
                the calendar to find out. */}
            {day.streak && <StreakChip streak={day.streak} figure={false} />}
            {moment && isToday && <MomentCard days={moment.days} compact />}
          </View>

          {/* The three sit on the macro card, each over its own bar (CAST.md). The
              inset is the card's border and padding, and the gap is MacroBars'. */}
          <CastShelf
            inset={15}
            gap={10}
            moods={{
              // Hoping, when the run needs something logged today; asleep after
              // midnight, beside the note about where a 1am snack lands.
              ember: isToday && day.streak?.state === 'at_risk' ? 'hopeful' : undefined,
              plum: isToday && profile && beforeDayStart(profile) ? 'sleepy' : undefined,
            }}
            cues={shelfCues}
          >
            <MomentBurst trigger={moment?.key ?? null} />
            <Chunk contentStyle={[styles.macroCard, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
              <MacroBars consumed={day.consumed} targets={day.targets} />
            </Chunk>
          </CastShelf>

          {/* `logged` so a day with nothing in it keeps its own empty state
              rather than gaining a second one — see `DietQuality`. */}
          <DietQuality quality={day.quality} logged={byMeal.length > 0} />

          {/* Below the ring and the macros on purpose. A step count is context
              for the target, not an ingredient of it, and sitting it in the
              summary block would say otherwise. Draws nothing at all when there
              is no sensor, no permission or no reading — see `StepsCard`. */}
          <StepsCard
            steps={steps}
            average={day.steps_average}
            permission={stepPermission}
            empty={stepsEmpty}
            onEnable={enableSteps}
            onOpenSettings={() => void openStepsSettings()}
          />

          {/*
            * After midnight and before the day turns over, which is when a snack
            * lands on the evening before and somebody might wonder why. Plum
            * keeps late hours. In its own row, never over the words.
            */}
          {isToday && profile && beforeDayStart(profile) && (
            <View style={[styles.lateNote, { backgroundColor: tint(colors.fat, 0.1) }]}>
              <Text style={[t.footnoteSemibold, styles.lateText, { color: colors.foreground }]}>
                {tr('setup.dayFooter')}
              </Text>
            </View>
          )}

          {byMeal.length === 0 && day.exercise_entries.length === 0 && (
            <View style={styles.empty}>
              <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
                {tr('today.nothingLogged')}
                {'\n'}
                {tr('today.nothingLoggedHint')}
              </Text>
            </View>
          )}

          {/*
            * Typing a meal in.
            *
            * At the head of the log rather than the foot of the screen. It used
            * to sit under Repeat, on the argument that repeating something you
            * already eat is one tap and typing four macros per item is the
            * fallback — but a day with three meals, a run and a weight buried
            * the fallback a screen and a half down, and a fallback nobody can
            * reach is not one. The order still says which is which: this is a
            * line of muted text, and Repeat is a card of chunky Log buttons.
            */}
          {/*
            * The way into the journal, which is where meals are said (CAST.md,
            * fourth pass). Drawn as the composer's own field so it reads as the
            * same thing, one tab over; it opens the journal with the keyboard up.
            * Laid out at the head of the log, never floating over it.
            */}
          {isToday && (
            <Pressable
              onPress={() => {
                haptics.press();
                requestCompose();
                router.navigate('/');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.say,
                {
                  backgroundColor: colors.glassStrong,
                  borderColor: colors.glassEdge,
                  boxShadow: `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <ChatMark color={colors.caloriesText} />
              <Text numberOfLines={1} style={[t.body, styles.sayText, { color: colors.mutedForeground }]}>
                {tr('journal.emptyTitle')}
              </Text>
            </Pressable>
          )}

          {isToday &&
            (composing ? (
              <FoodEditor
                entryId={null}
                initialMeal={inferMeal(new Date(), profile?.timezone ?? 'UTC')}
                onCreate={logManually}
                onCancel={() => setComposing(false)}
              />
            ) : (
              <Pressable
                onPress={() => {
                  haptics.press();
                  setComposing(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.manual, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                  {tr('today.logItYourself')}
                </Text>
              </Pressable>
            ))}

          {byMeal.map(({ meal, entries }) => (
            <InsetGroup
              key={meal}
              title={tr(MEAL_LABEL[meal])}
              icon={<Glossy name={MEAL_ICON[meal]} size={18} />}
              trailing={
                <Text style={[t.footnoteBold, t.tnum, { color: colors.mutedForeground }]}>
                  {Math.round(entries.reduce((sum, e) => sum + e.kcal, 0))} kcal
                </Text>
              }
            >
              {entries.map((entry, i) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  unsent={unsent.has(entry.id)}
                  first={i === 0}
                  index={i}
                  open={expanded === entry.id}
                  onToggle={() => setExpanded((id) => (id === entry.id ? null : entry.id))}
                  onDelete={() => void removeEntry(entry)}
                  onRepeat={() => void repeatEntry(entry)}
                />
              ))}
            </InsetGroup>
          ))}

          {day.exercise_entries.length > 0 && (
            <InsetGroup
              title={tr('today.exerciseTitle')}
              icon={<Glossy name="steps" size={18} />}
              trailing={
                <Text style={[t.footnoteBold, t.tnum, { color: colors.exerciseText }]}>
                  −{day.burned_kcal} kcal
                </Text>
              }
              // §9: exercise is reported beside food, never netted off the target.
              footer={tr('today.exerciseFooter')}
            >
              {day.exercise_entries.map((entry, i) => (
                <ExerciseRow
                  key={entry.id}
                  entry={entry}
                  first={i === 0}
                  index={i}
                  open={openSession === entry.id}
                  editing={editingSession === entry.id}
                  onToggle={() => setOpenSession((id) => (id === entry.id ? null : entry.id))}
                  onEdit={() => setEditingSession(entry.id)}
                  onEdited={() => {
                    setEditingSession(null);
                    setOpenSession(null);
                    void load(date);
                  }}
                  onCancelEdit={() => setEditingSession(null)}
                  onDelete={() => removeExercise(entry)}
                  onError={setError}
                />
              ))}
            </InsetGroup>
          )}

          {day.weight && (
            <InsetGroup title={tr('today.weight')} icon={<Glossy name="weight" size={18} />}>
              <InsetRow first>
                <Text style={[t.bodySemibold, styles.rowBody, { color: colors.foreground }]}>
                  {tr('today.weighed')}
                </Text>
                <Text style={[t.figure, styles.figure, { color: colors.foreground }]}>
                  {formatBodyWeight(day.weight.weight_kg, units)}
                </Text>
              </InsetRow>
            </InsetGroup>
          )}

          {/* Repeating logs at the current time, so it only belongs on today. */}
          {isToday && <RepeatMeals localDate={day.local_date} onLogged={() => void load(null)} />}

          {/*
            * The offline footnote.
            *
            * A footnote and not a banner, because nothing is wrong: the numbers
            * above are the last true ones plus everything queued, which is the
            * same day the server will agree with shortly. An app that shouts
            * about connectivity teaches people to distrust a screen that is
            * currently correct. See OFFLINE.md §6.
            */}
          {waiting > 0 && (
            <Text style={[t.footnote, styles.centred, { color: colors.mutedForeground }]}>
              {tr('today.waitingToSync')(waiting)}
              {!live && tr('today.lastSavedDay')}
            </Text>
          )}

          {waiting === 0 && !live && (
            <Text style={[t.footnote, styles.centred, { color: colors.mutedForeground }]}>
              {tr('today.offlineDay')}
            </Text>
          )}

          {error && (
            <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
              {error}
            </Text>
          )}
        </View>
      )}
      </Animated.View>
      {!ready && day && (
        <View style={styles.waiting} pointerEvents="none">
          {placeholder}
        </View>
      )}
      </View>
      </GestureDetector>
    </Animated.ScrollView>
    </DeferToRows>

      {/*
        * The compact bar.
        *
        * Today is a long screen — ring, macros, diet quality, every meal, the
        * exercise, the weight, the log-again list — and the date at the top is
        * the *only* way to History as well as the only way to step a day. So
        * scrolling down used to put both out of reach, and getting back to
        * yesterday meant flicking to the top first.
        *
        * It carries exactly what the header it replaces carries, and nothing
        * more. A condensed header that grows a row of new controls is a second
        * header wearing the first one's clothes.
        */}
      <Animated.View
        style={[styles.compact, compact]}
        pointerEvents={stuck ? 'auto' : 'none'}
        accessibilityElementsHidden={!stuck}
        importantForAccessibility={stuck ? 'auto' : 'no-hide-descendants'}
      >
        {/* The inset goes inside the blur, not around it: padding on the
            wrapper would leave the status bar sitting on bare content. */}
        <Material
          style={[
            styles.compactBar,
            { paddingTop: insets.top + 10, borderBottomColor: colors.border },
          ]}
        >
          <StepButton direction="back" onPress={() => step(-1)} />
          <Pressable
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            accessibilityLabel={tr('today.viewCalendar')}
            style={({ pressed }) => [styles.headerLabel, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text numberOfLines={1} style={[t.bodyBold, { color: colors.foreground }]}>
              {onToday ? tr('today.title') : formatLocalDay(shownDate ?? undefined, locale)}
            </Text>
          </Pressable>
          <StepButton direction="forward" onPress={() => step(1)} disabled={onToday} />
        </Material>
      </Animated.View>

    </>
  );
}

/**
 * The line under the ring, extracted only so the count-up has somewhere to
 * live: it is the second-largest figure on the screen and it was the one that
 * swapped while the ring beside it travelled, which read as the two of them
 * disagreeing for a moment about what had just happened.
 */
function Total({ consumed, target }: { consumed: number; target: number }) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const shown = useCountUp(Math.round(consumed), 900);

  return (
    <Text style={[t.body, t.tnum, styles.total, { color: colors.mutedForeground }]}>
      <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
        {formatNumber(Math.round(shown), locale)}
      </Text>
      {` ${tr('today.ofTargetKcal')(formatNumber(target, locale))}`}
    </Text>
  );
}

function EntryRow({
  entry,
  unsent,
  first,
  index,
  open,
  onToggle,
  onDelete,
  onRepeat,
}: {
  entry: FoodEntry;
  /** Logged here but not yet on the server. Drawn faint, not disabled. */
  unsent: boolean;
  first: boolean;
  index: number;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRepeat: () => void;
}) {
  const tr = useT();
  const colors = useColors();
  const units = useUnits();
  const approx = entry.confidence !== 'high';

  return (
    <SwipeRow
      index={index}
      style={first ? null : { borderTopWidth: 1, borderTopColor: colors.hairline }}
      /*
       * Both of the things the expanded row already offers, reachable without
       * expanding it. The order matters: delete is furthest from the edge the
       * thumb comes in on, so the one that cannot be taken back is the one that
       * takes the longer pull.
       */
      actions={[
        repeatAction(colors, tr, entry.description, onRepeat),
        removeAction(colors, tr, entry.description, onDelete),
      ]}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        /*
         * Faint rather than badged. A queued meal counts toward the day in full
         * — the arithmetic above already includes it — so it is the same row,
         * not a lesser one; the opacity says "still on its way", which is all
         * there is to say. A pill reading "pending" on every row would turn a
         * tunnel into an incident.
         */
        style={({ pressed }) => [
          styles.entry,
          unsent ? styles.unsent : null,
          pressed ? { backgroundColor: colors.mutedWash } : null,
        ]}
      >
        <Text style={styles.rowEmoji}>{foodEmoji(entry.description, entry.meal)}</Text>
        <View style={styles.rowBody}>
          <Text numberOfLines={1} style={[t.bodySemibold, { color: colors.foreground }]}>
            {entry.description}
          </Text>
          <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
            {tr('today.macroLine')(
              String(Math.round(entry.protein_g)),
              String(Math.round(entry.carbs_g)),
              String(Math.round(entry.fat_g)),
            )}
            {entry.confidence === 'low' && ` · ${tr('today.roughEstimate')}`}
            {unsent && tr('today.unsent')}
          </Text>
        </View>
        <Text style={[t.figure, styles.figure, { color: colors.foreground }]}>
          {approx && '~'}
          {Math.round(entry.kcal)}
        </Text>
      </Pressable>

      {open && (
        <View style={[styles.details, { backgroundColor: colors.mutedWash }]}>
          <View style={styles.items}>
            {entry.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <Text
                  numberOfLines={1}
                  style={[t.footnote, styles.rowBody, { color: colors.foreground }]}
                >
                  {item.name}
                  {(item.quantity_desc || item.quantity_g !== null) && (
                    <Text style={{ color: colors.mutedForeground }}>
                      {' · '}
                      {item.quantity_desc ?? formatMass(item.quantity_g!, units)}
                    </Text>
                  )}
                </Text>
                <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
                  {Math.round(item.kcal)} kcal
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <Text style={[t.footnote, styles.rowBody, { color: colors.mutedForeground }]}>
              {tr('today.changeHint')}
            </Text>
            <TextButton icon="repeat" label={tr('today.logAgain')} onPress={onRepeat} />
            <TextButton icon="trash" label={tr('common.delete')} onPress={onDelete} tone={colors.destructive} />
          </View>
        </View>
      )}
    </SwipeRow>
  );
}

/**
 * A logged session, and the way back into it.
 *
 * The row used to be a burn figure and a bin. That made this screen a place a
 * workout could be destroyed and not one where it could be corrected, and the
 * comment above `removeExercise` sent anyone wanting the difference to the
 * journal — which could not do it either. So the row opens.
 *
 * What it opens onto is the sets, because "what did I actually log?" is the
 * question that comes before wanting to change it, and until now the only
 * screen that answered it was the receipt in the chat. Edit reopens the card
 * that logged the session, which already knows how to collect exactly this.
 *
 * Only for a session with sets under it. A run has none — its record is a
 * sentence and a distance — and handing that to a form built for exercises and
 * loads would quietly turn a 5km run into a strength session with nothing in
 * it. Those stay delete-only, which is what they were.
 */
function ExerciseRow({
  entry,
  first,
  index,
  open,
  editing,
  onToggle,
  onEdit,
  onEdited,
  onCancelEdit,
  onDelete,
  onError,
}: {
  entry: ExerciseEntry;
  first: boolean;
  index: number;
  open: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onEdited: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const tr = useT();
  const colors = useColors();
  const units = useUnits();
  const counted = entry.sets.length > 0;

  if (editing) {
    return (
      <View style={styles.sessionEditor}>
        <WorkoutCard
          editing={{
            id: entry.id,
            category: entry.category,
            duration_min: entry.duration_min,
            sets: entry.sets,
            performed_at: entry.performed_at,
          }}
          onLogged={onEdited}
          onError={onError}
        />
        <Pressable
          onPress={onCancelEdit}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.editCancel, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {tr('common.cancel')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SwipeRow
      index={index}
      // The divider stays out here so it holds still while the row slides out
      // from under it.
      style={first ? null : { borderTopWidth: 1, borderTopColor: colors.hairline }}
      actions={[removeAction(colors, tr, entry.description, onDelete)]}
    >
      <Pressable
        onPress={counted ? onToggle : undefined}
        disabled={!counted}
        accessibilityRole={counted ? 'button' : undefined}
        style={({ pressed }) => [
          styles.entry,
          pressed && counted ? { backgroundColor: colors.mutedWash } : null,
        ]}
      >
        <Text style={styles.rowEmoji}>{exerciseEmoji(entry.description)}</Text>
        <View style={styles.rowBody}>
          <Text numberOfLines={1} style={[t.bodySemibold, { color: colors.foreground }]}>
            {entry.description}
          </Text>
          {(entry.distance_km !== null || entry.duration_min !== null) && (
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>
              {[
                entry.distance_km !== null ? formatDistance(entry.distance_km, units) : null,
                entry.duration_min !== null ? `${Math.round(entry.duration_min)} min` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
        </View>
        <Text style={[t.bodyBold, t.tnum, { color: colors.exerciseText }]}>
          ~{Math.round(entry.kcal_burned)}
        </Text>
        <IconButton
          icon="trash"
          label={tr('a11y.delete')(entry.description)}
          onPress={onDelete}
        />
      </Pressable>

      {open && (
        <View style={[styles.details, { backgroundColor: colors.mutedWash }]}>
          <View style={styles.items}>
            {groupSets(entry.sets, units, tr).map((group) => (
              <View key={group.name} style={styles.item}>
                <Text
                  numberOfLines={1}
                  style={[t.footnote, styles.rowBody, { color: colors.foreground }]}
                >
                  {group.name}
                </Text>
                <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
                  {group.detail}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <View style={styles.rowBody} />
            <TextButton icon="pencil" label={tr('common.edit')} onPress={onEdit} />
            <TextButton
              icon="trash"
              label={tr('common.delete')}
              onPress={onDelete}
              tone={colors.destructive}
            />
          </View>
        </View>
      )}
    </SwipeRow>
  );
}

/* ---------------------------------------------------------------------------
 * Chrome. Drawn by hand for the same reason the tab icons are: `lucide-react`
 * is a DOM library, and four glyphs is not worth a dependency that has to track
 * the web one for shape.
 * ------------------------------------------------------------------------- */

/** `lucide-react`'s `calendar`, at the same 24-unit grid the web draws it on. */
/** The journal tab's own mark, on the strip that leads there. */
function ChatMark({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M7 9h10M7 13h6" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function CalendarMark({ color }: { color: string }) {
  const props = {
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="18" rx="2" {...props} />
      <Path d="M8 2v4M16 2v4M3 10h18" {...props} />
    </Svg>
  );
}

function StepButton({
  direction,
  onPress,
  disabled,
}: {
  direction: 'back' | 'forward';
  onPress: () => void;
  disabled?: boolean;
}) {
  const tr = useT();
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? tr('today.previousDay') : tr('today.nextDay')}
      hitSlop={8}
      style={({ pressed }) => [
        styles.step,
        { opacity: disabled ? 0.25 : pressed ? 0.5 : 1 },
      ]}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Polyline
          points={direction === 'back' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'}
          stroke={colors.mutedForeground}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

function IconButton({ icon, label, onPress }: { icon: 'trash' | 'repeat' | 'pencil'; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <Glyph icon={icon} color={colors.mutedForeground} />
    </Pressable>
  );
}

function TextButton({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: 'trash' | 'repeat' | 'pencil';
  label: string;
  onPress: () => void;
  tone?: string;
}) {
  const colors = useColors();
  const color = tone ?? colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Glyph icon={icon} color={color} />
      <Text style={[t.footnoteSemibold, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Named apart from the shared `formatDay` it wraps, which takes no undefined. */
const formatLocalDay = (isoDate: string | undefined, locale: Locale) =>
  isoDate ? formatDay(isoDate, locale) : '';

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  /* The card is a card, not a row — it gets the group's inset rather than the
     row padding, so the form does not sit flush against the divider. */
  sessionEditor: { padding: 12, gap: 10 },
  editCancel: { alignSelf: 'center', paddingVertical: 4 },
  header: { gap: 16, paddingBottom: 4 },
  greeting: { paddingHorizontal: 22, gap: 4 },
  backRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 18, marginTop: -4 },
  backChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  macroCard: { paddingVertical: 16, paddingHorizontal: 14, borderWidth: 1 },
  headerLabel: { flex: 1, alignItems: 'center' },
  /*
   * Over the scroll rather than in it, so the content passes underneath the
   * blur exactly as it does under the tab bar at the other end of the screen.
   */
  compact: { position: 'absolute', top: 0, left: 0, right: 0 },
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerSub: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  centred: { textAlign: 'center' },
  step: { padding: 10 },
  page: { paddingHorizontal: 16, paddingTop: 4, gap: 24 },
  summary: { alignItems: 'center' },
  total: { marginTop: 4, marginBottom: 6 },
  loading: { alignItems: 'center', gap: 24, paddingHorizontal: 16, paddingVertical: 32 },
  waiting: { position: 'absolute', top: 0, left: 0, right: 0 },
  loadingRing: { width: 176, height: 176, borderRadius: 88 },
  loadingBar: { height: 48, alignSelf: 'stretch', borderRadius: 16 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  lateNote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16 },
  say: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderWidth: 1, borderRadius: 24, paddingHorizontal: 16 },
  sayText: { flex: 1 },
  lateText: { flex: 1 },
  manual: { alignItems: 'center', paddingVertical: 12 },
  unsent: { opacity: 0.55 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowEmoji: { fontSize: 20, lineHeight: 24 },
  rowBody: { flex: 1 },
  figure: { fontSize: 16, lineHeight: 24 },
  details: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  items: { gap: 6 },
  item: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
