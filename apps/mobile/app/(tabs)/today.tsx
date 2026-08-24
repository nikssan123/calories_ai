import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';
import type { DaySummary, ExerciseEntry, FoodEntry, FoodItemInput, Meal } from '@ct/shared';
import { formatBodyWeight, formatDistance, formatMass, inferMeal } from '@ct/shared';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';
import { CalorieRing } from '@/components/CalorieRing';
import { DietQuality } from '@/components/DietQuality';
import { FoodEditor } from '@/components/FoodEditor';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { MacroBars } from '@/components/MacroBars';
import { RepeatMeals } from '@/components/RepeatMeals';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadDay, localToday, pendingIds, withPending } from '@/lib/day';
import { drop, enqueue, newId, onRejected } from '@/lib/outbox';
import { useOutbox } from '@/hooks/useOutbox';
import { useUnits } from '@/lib/units';
import { duration, ease, font, type as t, useColors, type Palette } from '@/theme';
import { haptics } from '@/lib/haptics';
import { entryRemoved } from '@/lib/removals';
import { DeferToRows, removeAction, repeatAction, SwipeRow } from '@/components/SwipeRow';
import { Glyph } from '@/components/Glyph';
import { Material } from '@/components/Material';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';
import { useCountUp } from '@/hooks/useCountUp';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { writeDaySnapshot } from '@/lib/snapshot';

/** The `date` the calendar links here with. Anything else is ignored. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** The section headings get a picture too, so the day skims as a menu. */
const MEAL_EMOJI: Record<Meal, string> = {
  breakfast: '🌅',
  lunch: '🥪',
  dinner: '🌙',
  snack: '🍪',
};

export default function TodayScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const colors = useColors();
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
  const [fetched, setFetched] = useState<DaySummary | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
        if (seq !== latest.current) return;
        setFetched(summary);
        setLive(fresh);
        setError(null);
        // Today is whatever the server says when asked without a date; it
        // honours day_start_hour, so it is not always the device's calendar
        // date. Offline the phone's own answer stands in, computed the same way.
        if (target === null) setToday(summary.local_date);
      } catch (e) {
        if (seq !== latest.current) return;
        setError((e as Error).message);
      } finally {
        if (seq === latest.current) setLoading(false);
      }
    },
    [profile],
  );

  /*
   * What the screen actually draws: the day as fetched, plus everything still
   * in the queue, re-added up by the same function the API uses.
   */
  const day = fetched === null ? null : withPending(fetched, intents);
  const unsent = pendingIds(intents, fetched?.local_date ?? '');
  /** Everything queued, not just what shows on this day — deletes count too. */
  const waiting = intents.length;

  useEffect(() => {
    if (requested === appliedParam.current) return;
    appliedParam.current = requested;
    if (requested) setDate(requested);
  }, [requested]);

  useEffect(() => {
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
   * `load` only ever clears `loading`, never re-raises it, so this refills the
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
              : 'That change';
        toast.error(`${what} could not be saved. ${reason}`);
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
  useFocusEffect(
    useCallback(() => {
      if (left.current) void load(shown.current);
      return () => {
        left.current = true;
      };
    }, [load]),
  );

  const isToday = day !== null && today !== null && day.local_date === today;

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
    void writeDaySnapshot(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, day?.local_date, day?.consumed.kcal, day?.targets.kcal, day?.burned_kcal]);
  const step = (days: number) =>
    setDate((current) => shiftDate(current ?? day?.local_date ?? today ?? '', days));

  /*
   * Swipe the day across.
   *
   * MOBILE-UX §3 dropped this once, and the reason was sound: a screen-level
   * horizontal pan competes with swipe-to-delete on every row of this same
   * screen, and losing a shipped gesture to a convenience is a bad trade. What
   * has changed is that the arbitration turns out to be stateable rather than
   * guessy — a finger that lands on a meal is talking about that meal, and
   * `DeferToRows` says so to the gesture system, so the pan can only take over
   * where there is no row under the thumb. That is most of the screen: the
   * ring, the macros, the quality panel, the headings, the space beside them.
   *
   * The page follows the finger rather than waiting for the lift, because a
   * gesture that answers only on release is indistinguishable from one that is
   * not there — and this one has to be discoverable by trying it.
   */
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  /*
   * Mirrored into a shared value because the wall at today has to be felt on
   * the drag itself. Read off the JS thread it would arrive a frame late, which
   * on the one gesture the app refuses is exactly where it would be noticed.
   */
  const atToday = useSharedValue(true);
  useEffect(() => {
    atToday.value = isToday;
  }, [isToday, atToday]);

  /*
   * `step` closes over the day on screen, so it is a new function every render;
   * the gesture is not, and must not be, or the relation the rows hold against
   * it would be rebuilt on every scroll frame. The ref is the seam between the
   * two.
   */
  const stepper = useRef(step);
  useEffect(() => {
    stepper.current = step;
  });
  const stepBy = useCallback((days: number) => {
    haptics.selected();
    stepper.current(days);
  }, []);

  const days = useMemo(
    () =>
      Gesture.Pan()
        /*
         * Deliberate, and sideways. The activation offset is wide because this
         * is the longest screen in the app and almost every finger on it is
         * trying to scroll; `failOffsetY` gives the gesture up the moment one
         * of them turns out to be.
         */
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onChange((event) => {
          /*
           * Damped either way, and damped nearly flat past today. Tomorrow has
           * not happened, so the edge has to read as a wall the page is up
           * against rather than as a swipe that was ignored.
           */
          const wall = event.translationX < 0 && atToday.value;
          drift.value = event.translationX * (wall ? 0.08 : 0.32);
        })
        .onEnd((event) => {
          // Distance *or* speed, like the sheet's dismiss: a slow drag most of
          // the way and a quick flick both plainly mean "the next one".
          const decided = Math.abs(event.translationX) > 64 || Math.abs(event.velocityX) > 550;
          const forward = event.translationX < 0;
          if (decided && !(forward && atToday.value)) runOnJS(stepBy)(forward ? 1 : -1);
          /*
           * Home either way. The day itself is what changes; the page does not
           * travel to the new one, because `loadDay` goes to the network before
           * it answers — so for the length of that round trip the only thing
           * there is to slide in is the day you just swiped away from, and
           * sliding the old numbers in to have them change under the reader is
           * worse than a screen that simply settles.
           *
           * Settled with `ease.out` and not the spring: the spring is for a
           * number arriving somewhere, and its overshoot is the whole point of
           * it. Here there is nowhere to arrive — the page is going back where
           * it started — so an overshoot reads as the screen coming loose.
           */
          drift.value = withTiming(0, {
            duration: reduced ? 0 : duration.quick,
            easing: ease.out,
          });
        }),
    [atToday, drift, reduced, stepBy],
  );

  /*
   * Carried by the content and not by the scroller.
   *
   * On the `ScrollView` itself this moved the viewport — its own background and
   * its clip bounds went with it, so the drag slid the whole window sideways
   * off the screen behind it, and slid it *under* the compact bar, which is
   * outside the scroller and stayed exactly where it was. The frame is meant to
   * be the thing that holds still while the day inside it moves.
   */
  const sliding = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value }] }));

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
      undoably(`Removed ${entry.description}`, {
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
    setFetched((prev) =>
      prev
        ? {
            ...prev,
            food_entries: prev.food_entries.filter((e) => e.id !== entry.id),
            consumed: {
              kcal: prev.consumed.kcal - entry.kcal,
              protein_g: prev.consumed.protein_g - entry.protein_g,
              carbs_g: prev.consumed.carbs_g - entry.carbs_g,
              fat_g: prev.consumed.fat_g - entry.fat_g,
            },
            net_kcal: prev.net_kcal - entry.kcal,
          }
        : prev,
    );

    undoably(`Removed ${entry.description}`, {
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
      restore: () => setFetched(before),
    });
  }

  /**
   * Exercise has no expand-to-edit affordance the way food does — there are no
   * items under it — so the burn is corrected in the journal and removed here.
   * Totals are adjusted optimistically because they head the section.
   */
  function removeExercise(entry: ExerciseEntry) {
    const burn = Math.round(entry.kcal_burned);
    const before = fetched;
    setFetched((prev) =>
      prev
        ? {
            ...prev,
            exercise_entries: prev.exercise_entries.filter((e) => e.id !== entry.id),
            burned_kcal: prev.burned_kcal - burn,
            net_kcal: prev.net_kcal + burn,
          }
        : prev,
    );

    undoably(`Removed ${entry.description}`, {
      commit: () => {
        void api
          .deleteExerciseEntry(entry.id)
          .then(() => entryRemoved(entry.id))
          .catch((e: Error) => toast.error(e.message))
          .finally(() => void load(date));
      },
      restore: () => setFetched(before),
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
    toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
    setDate(null);
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
    toast.success(`Logged ${draft.description} — ${Math.round(kcal)} kcal`);
  }

  const byMeal = MEAL_ORDER.map((meal) => ({
    meal,
    entries: day?.food_entries.filter((e) => e.meal === meal) ?? [],
  })).filter((group) => group.entries.length > 0);

  return (
    <>
    {/* Around the scroller and not inside it, so every row on the screen —
        including any added later — inherits the right to outrank the pan. */}
    <DeferToRows gesture={days}>
    <GestureDetector gesture={days}>
    <Animated.ScrollView
      ref={scrollRef}
      style={styles.flex}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32 }}
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
      <Animated.View style={sliding}>
      <View
        style={styles.header}
        onLayout={(event) => {
          headerHeight.value = event.nativeEvent.layout.height;
        }}
      >
        <StepButton direction="back" onPress={() => step(-1)} />
        {/* The date is the way to the calendar, as on the web — and here it is
            the *only* way, since the bottom bar has no room for History. So it
            wears an outline and a calendar mark at rest: on the web a pointer
            finds it by hovering the heading, and a thumb has no such move. */}
        <Pressable
          onPress={() => router.push('/history')}
          accessibilityRole="button"
          accessibilityLabel="View calendar"
          style={({ pressed }) => [styles.headerLabel, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View
            style={[styles.headerChip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[t.title2, styles.centred, { color: colors.foreground }]}>
              {isToday ? 'Today' : formatDay(day?.local_date)}
            </Text>
            {/* Reserved even when empty: without it the header jumps a line every
                time you step off today. The mark rides this line rather than the
                heading above it — "Wednesday 23 September" already spends every
                pixel between the two chevrons, and a glyph up there pushed it
                into the arrows. */}
            <View style={styles.headerSub}>
              <CalendarMark color={colors.mutedForeground} />
              <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                {isToday && day ? formatDay(day.local_date) : 'View calendar'}
              </Text>
            </View>
          </View>
        </Pressable>
        <StepButton direction="forward" onPress={() => step(1)} disabled={isToday} />
      </View>

      {loading || !day ? (
        <View style={styles.loading}>
          <Skeleton style={styles.loadingRing} />
          <Skeleton style={styles.loadingBar} />
        </View>
      ) : (
        <View style={styles.page}>
          <View style={styles.summary}>
            <CalorieRing
              consumed={day.consumed.kcal}
              target={day.targets.kcal}
              burned={day.burned_kcal}
            />
            <Total consumed={day.consumed.kcal} target={day.targets.kcal} />
            {day.burned_kcal > 0 && (
              <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
                net {day.net_kcal.toLocaleString()} kcal after exercise
              </Text>
            )}
          </View>

          <MacroBars consumed={day.consumed} targets={day.targets} />

          <DietQuality quality={day.quality} />

          {byMeal.length === 0 && day.exercise_entries.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.mascot}>🍽️</Text>
              <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
                Nothing logged yet.{'\n'}Tell the journal what you ate.
              </Text>
            </View>
          )}

          {byMeal.map(({ meal, entries }) => (
            <InsetGroup
              key={meal}
              title={`${MEAL_EMOJI[meal]}  ${MEAL_LABEL[meal]}`}
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
              title="🏃  Exercise"
              trailing={
                <Text style={[t.footnoteBold, t.tnum, { color: colors.exerciseText }]}>
                  −{day.burned_kcal} kcal
                </Text>
              }
              // §9: exercise is reported beside food, never netted off the target.
              footer="Shown separately from your target — exercise burn is a rough estimate."
            >
              {day.exercise_entries.map((entry, i) => (
                <SwipeRow
                  key={entry.id}
                  index={i}
                  // The divider stays out here so it holds still while the row
                  // slides out from under it.
                  style={
                    i === 0 ? null : { borderTopWidth: 2, borderTopColor: colors.border }
                  }
                  actions={[removeAction(colors, entry.description, () => removeExercise(entry))]}
                >
                  <InsetRow first>
                    <Text style={styles.rowEmoji}>{exerciseEmoji(entry.description)}</Text>
                    <View style={styles.rowBody}>
                      <Text
                        numberOfLines={1}
                        style={[t.bodySemibold, { color: colors.foreground }]}
                      >
                        {entry.description}
                      </Text>
                      {(entry.distance_km !== null || entry.duration_min !== null) && (
                        <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                          {[
                            entry.distance_km !== null
                              ? formatDistance(entry.distance_km, units)
                              : null,
                            entry.duration_min !== null
                              ? `${Math.round(entry.duration_min)} min`
                              : null,
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
                      label={`Delete ${entry.description}`}
                      onPress={() => removeExercise(entry)}
                    />
                  </InsetRow>
                </SwipeRow>
              ))}
            </InsetGroup>
          )}

          {day.weight && (
            <InsetGroup title="⚖️  Weight">
              <InsetRow first>
                <Text style={[t.bodySemibold, styles.rowBody, { color: colors.foreground }]}>
                  Weighed
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
            * Typing a meal in.
            *
            * Below Repeat rather than above it, and that order is the whole
            * argument of the offline work: repeating something you already eat
            * is one tap, and typing four macros per item is the fallback for
            * when it is genuinely a new meal. Putting the form first would make
            * the expensive path look like the intended one.
            */}
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
                  + Log it yourself
                </Text>
              </Pressable>
            ))}

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
              {waiting === 1 ? '1 change waiting to sync' : `${waiting} changes waiting to sync`}
              {!live && ' · showing your last saved day'}
            </Text>
          )}

          {waiting === 0 && !live && (
            <Text style={[t.footnote, styles.centred, { color: colors.mutedForeground }]}>
              Offline — showing your last saved day.
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
    </Animated.ScrollView>
    </GestureDetector>
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
            accessibilityLabel="View calendar"
            style={({ pressed }) => [styles.headerLabel, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text numberOfLines={1} style={[t.bodyBold, { color: colors.foreground }]}>
              {isToday ? 'Today' : formatDay(day?.local_date)}
            </Text>
          </Pressable>
          <StepButton direction="forward" onPress={() => step(1)} disabled={isToday} />
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
  const shown = useCountUp(Math.round(consumed), 900);

  return (
    <Text style={[t.body, t.tnum, styles.total, { color: colors.mutedForeground }]}>
      <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
        {Math.round(shown).toLocaleString()}
      </Text>
      {` of ${target.toLocaleString()} kcal`}
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
  const colors = useColors();
  const units = useUnits();
  const approx = entry.confidence !== 'high';

  return (
    <SwipeRow
      index={index}
      style={first ? null : { borderTopWidth: 2, borderTopColor: colors.border }}
      /*
       * Both of the things the expanded row already offers, reachable without
       * expanding it. The order matters: delete is furthest from the edge the
       * thumb comes in on, so the one that cannot be taken back is the one that
       * takes the longer pull.
       */
      actions={[
        repeatAction(colors, entry.description, onRepeat),
        removeAction(colors, entry.description, onDelete),
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
            {Math.round(entry.protein_g)}P · {Math.round(entry.carbs_g)}C ·{' '}
            {Math.round(entry.fat_g)}F
            {entry.confidence === 'low' && ' · rough estimate'}
            {unsent && ' · waiting to sync'}
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
              To change this, say so in the journal — “there was more rice”.
            </Text>
            <TextButton icon="repeat" label="Log again" onPress={onRepeat} />
            <TextButton icon="trash" label="Delete" onPress={onDelete} tone={colors.destructive} />
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous day' : 'Next day'}
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

function IconButton({ icon, label, onPress }: { icon: 'trash' | 'repeat'; label: string; onPress: () => void }) {
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
  icon: 'trash' | 'repeat';
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

function formatDay(isoDate?: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
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
    borderBottomWidth: 2,
  },
  headerChip: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 3 },
  headerSub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  centred: { textAlign: 'center' },
  step: { padding: 10 },
  page: { paddingHorizontal: 16, paddingTop: 16, gap: 28 },
  summary: { alignItems: 'center' },
  total: { marginTop: 20, marginBottom: 4 },
  loading: { alignItems: 'center', gap: 24, paddingHorizontal: 16, paddingVertical: 32 },
  loadingRing: { width: 176, height: 176, borderRadius: 88 },
  loadingBar: { height: 48, alignSelf: 'stretch', borderRadius: 16 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  manual: { alignItems: 'center', paddingVertical: 12 },
  unsent: { opacity: 0.55 },
  mascot: { fontSize: 40, lineHeight: 46 },
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
