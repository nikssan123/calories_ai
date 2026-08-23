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
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';

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

  async function removeEntry(entry: FoodEntry) {
    setDay((prev) =>
      prev ? { ...prev, food_entries: prev.food_entries.filter((e) => e.id !== entry.id) } : prev,
    );
    try {
      await api.deleteFoodEntry(entry.id);
    } catch (e) {
      setError((e as Error).message);
    }
    void load(date);
  }

  /**
   * Exercise has no expand-to-edit affordance the way food does — there are no
   * items under it — so the burn is corrected in the journal and removed here.
   * Totals are adjusted optimistically because they head the section.
   */
  async function removeExercise(entry: ExerciseEntry) {
    const burn = Math.round(entry.kcal_burned);
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
    try {
      await api.deleteExerciseEntry(entry.id);
    } catch (e) {
      setError((e as Error).message);
    }
    void load(date);
  }

  /** Clones a past entry to now — which is today, so jump back there to show it. */
  async function repeatEntry(entry: FoodEntry) {
    try {
      await api.repeatFoodEntry(entry.id);
      setDate(null);
      void load(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const byMeal = MEAL_ORDER.map((meal) => ({
    meal,
    entries: day?.food_entries.filter((e) => e.meal === meal) ?? [],
  })).filter((group) => group.entries.length > 0);

  return (
    <ScrollView
      style={styles.flex}
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
      <View style={styles.header}>
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
            <Text style={[t.body, t.tnum, styles.total, { color: colors.mutedForeground }]}>
              <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
                {Math.round(day.consumed.kcal).toLocaleString()}
              </Text>
              {` of ${day.targets.kcal.toLocaleString()} kcal`}
            </Text>
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
                <InsetRow key={entry.id} first={i === 0}>
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
                    onPress={() => void removeExercise(entry)}
                  />
                </InsetRow>
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
    </ScrollView>
  );
}

function EntryRow({
  entry,
  first,
  open,
  onToggle,
  onDelete,
  onRepeat,
}: {
  entry: FoodEntry;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRepeat: () => void;
}) {
  const colors = useColors();
  const units = useUnits();
  const approx = entry.confidence !== 'high';

  return (
    <View style={first ? null : { borderTopWidth: 2, borderTopColor: colors.border }}>
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
    </View>
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

function Glyph({ icon, color, size = 15 }: { icon: 'trash' | 'repeat'; color: string; size?: number }) {
  const props = {
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icon === 'trash' ? (
        <Path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...props} />
      ) : (
        <Path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3H21m0 0V3m0 3h-2.3M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3H3m0 0v3m0-3h2.3" {...props} />
      )}
    </Svg>
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
