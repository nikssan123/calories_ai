import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';
import type { DaySummary, ExerciseEntry, FoodEntry, Meal } from '@ct/shared';
import { formatBodyWeight, formatDistance, formatMass } from '@ct/shared';
import { exerciseEmoji, foodEmoji } from '@ct/shared/food-emoji';
import { CalorieRing } from '@/components/CalorieRing';
import { DietQuality } from '@/components/DietQuality';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { MacroBars } from '@/components/MacroBars';
import { RepeatMeals } from '@/components/RepeatMeals';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors, type Palette } from '@/theme';
import { haptics } from '@/lib/haptics';
import { entryRemoved } from '@/lib/removals';
import { removeAction, repeatAction, SwipeRow } from '@/components/SwipeRow';
import { Glyph } from '@/components/Glyph';
import { Material } from '@/components/Material';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';
import { useCountUp } from '@/hooks/useCountUp';

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

  const [day, setDay] = useState<DaySummary | null>(null);
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

  /*
   * Which fetch is allowed to publish its result.
   *
   * Stepping through days quickly issues overlapping requests, and they do not
   * come back in the order they were sent. Without this the day on screen is
   * whichever response happened to be slowest rather than the one that was
   * asked for last.
   */
  const latest = useRef(0);

  const load = useCallback(async (target: string | null) => {
    const seq = ++latest.current;
    try {
      const summary = await api.day(target ?? undefined);
      if (seq !== latest.current) return;
      setDay(summary);
      setError(null);
      // Today is whatever the server says when asked without a date; it honours
      // day_start_hour, so it is not always the device's calendar date.
      if (target === null) setToday(summary.local_date);
    } catch (e) {
      if (seq !== latest.current) return;
      setError((e as Error).message);
    } finally {
      if (seq === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (requested === appliedParam.current) return;
    appliedParam.current = requested;
    if (requested) setDate(requested);
  }, [requested]);

  useEffect(() => {
    void load(date);
  }, [load, date]);

  const isToday = day !== null && today !== null && day.local_date === today;
  const step = (days: number) =>
    setDate((current) => shiftDate(current ?? day?.local_date ?? today ?? '', days));

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
    const before = day;
    setDay((prev) =>
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
        void api
          .deleteFoodEntry(entry.id)
          // The journal is mounted on the next tab with this meal's card in it,
          // and nothing there re-reads the conversation. Tell it.
          .then(() => entryRemoved(entry.id))
          .catch((e: Error) => toast.error(e.message))
          .finally(() => void load(date));
      },
      restore: () => setDay(before),
    });
  }

  /**
   * Exercise has no expand-to-edit affordance the way food does — there are no
   * items under it — so the burn is corrected in the journal and removed here.
   * Totals are adjusted optimistically because they head the section.
   */
  function removeExercise(entry: ExerciseEntry) {
    const burn = Math.round(entry.kcal_burned);
    const before = day;
    setDay((prev) =>
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
      restore: () => setDay(before),
    });
  }

  /** Clones a past entry to now — which is today, so jump back there to show it. */
  async function repeatEntry(entry: FoodEntry) {
    try {
      const copy = await api.repeatFoodEntry(entry.id);
      haptics.logged();
      toast.success(`Logged ${copy.description} — ${Math.round(copy.kcal)} kcal`);
      setDate(null);
      void load(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const byMeal = MEAL_ORDER.map((meal) => ({
    meal,
    entries: day?.food_entries.filter((e) => e.meal === meal) ?? [],
  })).filter((group) => group.entries.length > 0);

  return (
    <>
    <Animated.ScrollView
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
          {isToday && <RepeatMeals onLogged={() => void load(null)} />}

          {error && (
            <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
              {error}
            </Text>
          )}
        </View>
      )}
    </Animated.ScrollView>

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
  first,
  index,
  open,
  onToggle,
  onDelete,
  onRepeat,
}: {
  entry: FoodEntry;
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
        style={({ pressed }) => [
          styles.entry,
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
