import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { MealTemplate } from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { PressableChunk } from '@/components/Chunk';
import { InsetGroup } from '@/components/InsetGroup';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { font, type as t, useColors } from '@/theme';

/**
 * The eight things you actually eat.
 *
 * `search_food_history` already makes "my usual breakfast" work in the journal;
 * this is the same idea for the screen, for the mornings when typing a sentence
 * is more than the porridge deserves.
 *
 * Both halves of pressing "Log" are reported over the screen rather than in it,
 * which is the opposite of the rule everywhere else here and is the case that
 * argued the toast into existence. This sits at the foot of Today; the ring and
 * the totals it moves are at the head of it, a screen and a half away. Saying
 * nothing meant tapping Log and watching nothing happen, and saying it in the
 * card meant a receipt pinned next to the button instead of next to the number
 * it changed.
 *
 * The list failing to load is still reported inline, because that one is about
 * this card and nothing else.
 */
export function RepeatMeals({ onLogged }: { onLogged: () => void }) {
  const colors = useColors();
  const toast = useToast();
  const [meals, setMeals] = useState<MealTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    try {
      const { meals } = await api.mealTemplates({ query: search || undefined, limit: 8 });
      setMeals(meals);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setMeals([]);
    }
  }, []);

  useEffect(() => {
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function repeat(template: MealTemplate) {
    setBusy(template.entry_id);
    try {
      const entry = await api.repeatFoodEntry(template.entry_id);
      setError(null);
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      onLogged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Nothing to repeat yet, and no search running: stay out of the way entirely.
  if (meals !== null && meals.length === 0 && !query) return null;

  return (
    <InsetGroup
      title="Log again"
      footer="Logs it at today's time. If the portion was different, just say so in the journal and I'll fix it."
    >
      <View style={styles.search}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your meals"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[
            t.body,
            styles.input,
            { backgroundColor: colors.mutedField, borderColor: colors.border, color: colors.foreground },
          ]}
        />
      </View>

      {meals === null ? (
        <Text style={[t.body, styles.notice, { color: colors.mutedForeground }]}>Loading…</Text>
      ) : meals.length === 0 ? (
        <Text style={[t.body, styles.notice, { color: colors.mutedForeground }]}>
          Nothing matching “{query}”.
        </Text>
      ) : (
        meals.map((template) => (
          <View key={template.entry_id} style={styles.row}>
            <Text style={styles.emoji}>{foodEmoji(template.description)}</Text>
            <View style={styles.body}>
              <Text numberOfLines={1} style={[t.bodySemibold, { color: colors.foreground }]}>
                {template.description}
              </Text>
              {/* A row rather than one string, because the repeat count is
                  introduced by an icon and RN will not set an SVG inline in a
                  run of text the way `inline-flex` does on the web. */}
              <View style={styles.subLine}>
                <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
                  {Math.round(template.kcal)} kcal · {Math.round(template.protein_g)}g protein
                  {template.times > 1 ? ' · ' : ''}
                </Text>
                {template.times > 1 && (
                  <>
                    <RotateCcw color={colors.mutedForeground} />
                    <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
                      {template.times}×
                    </Text>
                  </>
                )}
              </View>
            </View>
            <PressableChunk
              depth={3}
              radius={999}
              onPress={() => void repeat(template)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`Log ${template.description} again`}
              contentStyle={[
                styles.log,
                { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Plus color={colors.secondaryForeground} />
              <Text style={[styles.logLabel, { color: colors.secondaryForeground }]}>
                {busy === template.entry_id ? 'Adding…' : 'Log'}
              </Text>
            </PressableChunk>
          </View>
        ))
      )}

      {error && (
        <Text style={[t.footnoteSemibold, styles.notice, { color: colors.destructive }]}>
          {error}
        </Text>
      )}
    </InsetGroup>
  );
}

/** lucide's `rotate-ccw`, at the 11px the web sets it in. */
function RotateCcw({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path
        d="M3 12a9 9 0 1 0 3-6.7L3 8m0 0V3m0 5h5"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function Plus({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  search: { padding: 12 },
  input: {
    height: 40,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    // Android centres single-line input by default; iOS pads from the top.
    paddingVertical: 0,
  },
  notice: { paddingHorizontal: 16, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  emoji: { fontSize: 20, lineHeight: 24 },
  body: { flex: 1 },
  subLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  log: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderRadius: 999,
  },
  // `text-[0.8rem]` at the web's 16px root, and bold — not the body scale.
  logLabel: { fontFamily: font.bold, fontSize: 13, lineHeight: 16 },
});
