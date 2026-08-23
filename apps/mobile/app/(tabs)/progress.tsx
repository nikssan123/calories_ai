import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import type { Progress } from '@ct/shared';
import {
  QUALITY_COVERAGE_FLOOR,
  bodyWeightToKg,
  bodyWeightUnit,
  formatBodyWeight,
  formatWeightDelta,
  toBodyWeight,
} from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Skeleton } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { Stat, Stats } from '@/components/Stat';
import { WeeklyReview } from '@/components/WeeklyReview';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useScrollToTop } from '@/hooks/useScrollToTop';

const WINDOWS = [14, 30, 90] as const;

/**
 * The four quality nutrients, in the order the Today panel draws them, and the
 * words each needs when it is the one on the chart. A ceiling is not aimed for
 * — "aim for 2,300mg of sodium" is advice nobody should be given — so the
 * direction picks the phrasing rather than a single line covering both.
 */
const NUTRIENTS = [
  { key: 'fiber_g', label: 'Fiber', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg' },
  { key: 'sat_fat_g', label: 'Sat fat', unit: 'g' },
  { key: 'sugar_g', label: 'Sugar', unit: 'g' },
] as const;

type NutrientKey = (typeof NUTRIENTS)[number]['key'];

export default function ProgressScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();

  const [progress, setProgress] = useState<Progress | null>(null);
  const [days, setDays] = useState<number>(30);
  /**
   * Which nutrient the quality chart is drawing. Fiber to start with: it is the
   * only floor of the four and the only one whose shape over time is worth
   * watching unprompted — the ceilings are questions you go looking for.
   */
  const [nutrient, setNutrient] = useState<NutrientKey>('fiber_g');
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setProgress(await api.progress(days));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [days]);

  async function submitWeight() {
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      // Typed in whatever they read, stored in kilograms. The API has one unit
      // and does not need to be told which one the keyboard was in.
      await api.logWeight(bodyWeightToKg(value, units));
      haptics.logged();
      setWeightInput('');
      setProgress(await api.progress(days));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[t.largeTitle, { color: colors.foreground }]}>Progress</Text>
        <Chunk
          depth={2}
          radius={999}
          contentStyle={[
            styles.windows,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {WINDOWS.map((w) => {
            const active = days === w;
            return (
              <Pressable
                key={w}
                onPress={() => setDays(w)}
                accessibilityRole="button"
                accessibilityLabel={`${w} days`}
                accessibilityState={{ selected: active }}
                style={[styles.window, active ? { backgroundColor: colors.primary } : null]}
              >
                <Text
                  style={[
                    styles.windowLabel,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {w}d
                </Text>
              </Pressable>
            );
          })}
        </Chunk>
      </View>

      {!progress ? (
        <>
          <Skeleton style={{ height: 160, borderRadius: 24 }} />
          <Skeleton style={{ height: 128, borderRadius: 24 }} />
        </>
      ) : (
        <>
          {/* §12: lead with the trend, not any individual day. */}
          <InsetGroup title="⚖️  Weight">
            <View style={styles.pad}>
              {progress.weight.current_kg === null ? (
                <Text style={[t.body, styles.empty, { color: colors.mutedForeground }]}>
                  No weigh-ins yet. Log one below, or just tell the journal.
                </Text>
              ) : (
                <>
                  <View style={styles.headline}>
                    <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
                      {formatBodyWeight(progress.weight.current_kg, units)}
                    </Text>
                    {progress.weight.change_7d_kg !== null &&
                      progress.weight.change_7d_kg !== 0 && (
                        <View style={styles.delta}>
                          <Arrow
                            up={progress.weight.change_7d_kg > 0}
                            color={
                              progress.weight.change_7d_kg < 0
                                ? colors.positive
                                : colors.caloriesText
                            }
                          />
                          <Text
                            style={[
                              t.footnoteBold,
                              t.tnum,
                              {
                                color:
                                  progress.weight.change_7d_kg < 0
                                    ? colors.positive
                                    : colors.caloriesText,
                              },
                            ]}
                          >
                            {formatWeightDelta(
                              Math.abs(progress.weight.change_7d_kg),
                              units,
                              false,
                            )}{' '}
                            this week
                          </Text>
                        </View>
                      )}
                  </View>
                  <Sparkline
                    points={progress.weight.series}
                    stroke={colors.foreground}
                    style={styles.chart}
                  />
                </>
              )}
            </View>

            <Stats>
              <Stat
                first
                label="7-day avg"
                value={
                  progress.weight.average_7d_kg === null
                    ? '—'
                    : String(toBodyWeight(progress.weight.average_7d_kg, units))
                }
                unit={bodyWeightUnit(units)}
              />
              <Stat
                label="Since start"
                value={
                  progress.weight.change_since_start_kg === null
                    ? '—'
                    : `${progress.weight.change_since_start_kg > 0 ? '+' : ''}${toBodyWeight(progress.weight.change_since_start_kg, units)}`
                }
                unit={bodyWeightUnit(units)}
              />
              <Stat
                label="To target"
                value={
                  progress.weight.to_target_kg === null
                    ? '—'
                    : String(Math.abs(toBodyWeight(progress.weight.to_target_kg, units)))
                }
                unit={bodyWeightUnit(units)}
              />
            </Stats>

            <View style={styles.logRow}>
              <TextInput
                value={weightInput}
                onChangeText={(v) => setWeightInput(v.replace(/[^0-9.]/g, ''))}
                onSubmitEditing={() => void submitWeight()}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={`Log today's weight (${bodyWeightUnit(units)})`}
                placeholderTextColor={colors.mutedForeground}
                style={[
                  t.body,
                  styles.logInput,
                  {
                    backgroundColor: colors.mutedField,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              <PressableChunk
                depth={3}
                radius={999}
                color={colors.caloriesDeep}
                onPress={() => void submitWeight()}
                disabled={!weightInput || saving}
                accessibilityRole="button"
                style={{ opacity: !weightInput || saving ? 0.3 : 1 }}
                contentStyle={[styles.logSave, { backgroundColor: colors.primary }]}
              >
                <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>Save</Text>
              </PressableChunk>
            </View>
          </InsetGroup>

          <InsetGroup title="🔥  Calories">
            <View style={styles.pad}>
              <View style={styles.headline}>
                <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
                  {progress.calories.average_kcal === null
                    ? '—'
                    : progress.calories.average_kcal.toLocaleString()}
                </Text>
                <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
                  avg/day · target {progress.calories.target_kcal.toLocaleString()}
                </Text>
              </View>
              <Sparkline
                points={progress.calories.series}
                stroke={colors.calories}
                target={progress.calories.target_kcal}
                style={styles.chart}
              />
            </View>
          </InsetGroup>

          <InsetGroup title="💪  Protein">
            <View style={styles.pad}>
              <View style={styles.headline}>
                <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
                  {progress.protein.average_g === null ? '—' : `${progress.protein.average_g}g`}
                </Text>
                <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
                  avg/day · target {progress.protein.target_g}g
                </Text>
              </View>
              {progress.protein.days_logged > 0 && (
                <Text style={[t.footnote, styles.note, { color: colors.mutedForeground }]}>
                  {'Hit the target on '}
                  <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>
                    {progress.protein.days_target_hit} of {progress.protein.days_logged}
                  </Text>
                  {' logged days.'}
                </Text>
              )}
            </View>
          </InsetGroup>

          {progress.quality.days_measured > 0 && (
            <InsetGroup
              title="🥦  Diet quality"
              footer={
                progress.quality.coverage < QUALITY_COVERAGE_FLOOR
                  ? `Averaged over ${progress.quality.days_measured} day${progress.quality.days_measured === 1 ? '' : 's'} — ${Math.round(progress.quality.coverage * 100)}% of what you logged carries these figures.`
                  : undefined
              }
            >
              {/*
                One line at a time, and you choose whose. Four sparklines at
                once would be a dashboard nobody opens twice, but the question
                "is my sodium creeping up?" deserves an answer here rather than
                a trip to the journal — so the chips promote a nutrient into the
                chart and the row underneath keeps the other three's averages
                where they were.
              */}
              <View style={styles.chips}>
                {NUTRIENTS.map((n) => {
                  const active = nutrient === n.key;
                  return (
                    <Pressable
                      key={n.key}
                      onPress={() => setNutrient(n.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Chart ${n.label.toLowerCase()}`}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: active ? colors.muted : colors.mutedWash,
                          borderColor: active ? colors.caloriesText : 'transparent',
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          t.footnote,
                          { color: active ? colors.foreground : colors.mutedForeground },
                        ]}
                      >
                        {n.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <QualityChart quality={progress.quality} nutrient={nutrient} />

              <Stats>
                {NUTRIENTS.filter((n) => n.key !== nutrient).map((n, index) => {
                  const value = progress.quality.average[n.key];
                  return (
                    <Stat
                      key={n.key}
                      first={index === 0}
                      label={n.label}
                      value={value === null ? '—' : value.toLocaleString()}
                      unit={n.unit}
                    />
                  );
                })}
              </Stats>
            </InsetGroup>
          )}

          {/* Exercise has its own tab; this is the pointer, not the data. */}
          <InsetGroup
            title="🏃  Exercise"
            footer="Ask the journal anything about this data — “why haven’t I lost weight this week?”"
          >
            <Pressable
              onPress={() => router.navigate('/exercise')}
              accessibilityRole="button"
              accessibilityLabel="Open the exercise tab"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <InsetRow first style={styles.pointer}>
                <View style={styles.flex}>
                  <View style={styles.headline}>
                    <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
                      {progress.exercise.sessions}
                    </Text>
                    <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
                      sessions · ~{progress.exercise.total_kcal.toLocaleString()} kcal over {days}{' '}
                      days
                    </Text>
                  </View>
                </View>
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Polyline
                    points="9 18 15 12 9 6"
                    stroke={colors.mutedForeground}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
              </InsetRow>
            </Pressable>
          </InsetGroup>

          <WeeklyReview onError={setError} />
        </>
      )}

      {error && (
        <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

/**
 * The headline figure and the line, for whichever nutrient is showing.
 *
 * Fiber is a floor and takes the app's positive green, exactly as its bar does
 * on Today. The other three are ceilings, which have no good news in them — a
 * high sodium line is not an achievement — so they run in plain ink, and the
 * aside says "keep under" rather than "aim for". Never red: crossing a ceiling
 * is worth seeing and is still not an alarm.
 */
function QualityChart({
  quality,
  nutrient,
}: {
  quality: Progress['quality'];
  nutrient: NutrientKey;
}) {
  const colors = useColors();
  const { label, unit } = NUTRIENTS.find((n) => n.key === nutrient)!;
  const average = quality.average[nutrient];
  const target = quality.targets[nutrient];
  const floor = target.direction === 'floor';

  return (
    <View style={styles.qualityPad}>
      <View style={styles.headline}>
        <Text style={[t.largeTitle, t.tnum, { color: colors.foreground }]}>
          {average === null ? '—' : `${average.toLocaleString()}${unit}`}
        </Text>
        <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
          {label.toLowerCase()} avg/day · {floor ? 'aim for' : 'keep under'}{' '}
          {target.value.toLocaleString()}
          {unit}
        </Text>
      </View>
      <Sparkline
        points={quality.series[nutrient]}
        stroke={floor ? colors.calories : colors.foreground}
        target={target.value}
        style={styles.chart}
      />
    </View>
  );
}

function Arrow({ up, color }: { up: boolean; color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d={up ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'}
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, paddingBottom: 40, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  windows: { flexDirection: 'row', borderWidth: 2, borderRadius: 999, padding: 4 },
  window: {
    height: 32,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowLabel: { fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
  pad: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 14 },
  // The chips already own the space above, so the figure sits closer to them
  // than a card's first row normally would.
  qualityPad: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  empty: { paddingVertical: 8 },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  aside: { flexShrink: 1 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chart: { marginTop: 16 },
  note: { marginTop: 6, lineHeight: 20 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  logInput: {
    flex: 1,
    height: 44,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  logSave: {
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointer: { paddingVertical: 16 },
  centred: { textAlign: 'center' },
});
