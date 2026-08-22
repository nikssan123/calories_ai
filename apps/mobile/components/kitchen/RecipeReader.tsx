import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { Chunk } from '@/components/Chunk';
import { Material } from '@/components/Material';
import { font, type as t, useColors } from '@/theme';

/**
 * A recipe, laid out to be cooked from.
 *
 * The ingredients in a column you can check against the counter, the steps in
 * numbered blocks big enough to find your place in with wet hands, and the
 * actions pinned to the bottom so "I ate this" is reachable from step nine
 * without scrolling back up.
 *
 * Both kinds of recipe come through here. What differs between them is real and
 * is not smoothed over: the library has a photograph and a source to credit, a
 * generated one has neither but knows which of its ingredients are already in
 * your kitchen. Each passes what it has; the shell draws what it is given.
 *
 * The web's two-column layout is not ported, because it never applied to a
 * phone — there it stacks, photo first, list before method, which is the order
 * you need them in and the only order there is room for.
 */

/** One line of the list, normalised from either kind of recipe. */
export type ReaderIngredient = {
  /** The food, as the cook reads it. */
  text: string;
  /** The quantity, when it is a column of its own rather than part of the line. */
  amount?: string | null;
  /** The source's parenthetical — "thawed", "about 2 cups". */
  note?: string | null;
  /** Generated recipes only: this one is not in the kitchen. */
  missing?: boolean;
};

export function RecipeReader({
  backLabel,
  eyebrow,
  title,
  summary,
  photo,
  emoji,
  kcal,
  protein_g,
  carbs_g,
  fat_g,
  servingLabel,
  portions,
  minutes,
  ingredients,
  ingredientsNote,
  steps,
  footnote,
  saved,
  onToggleSave,
  actions,
}: {
  backLabel: string;
  /** "From the library", "Made for you" — which kind of thing this is. */
  eyebrow: string;
  title: string;
  summary: string | null;
  photo?: string | null;
  emoji?: string;
  /** Already scaled to the servings the screen is showing. */
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  servingLabel: string;
  portions: number;
  minutes?: number | null;
  ingredients: ReaderIngredient[];
  /** Why the list looks the way it does, where that needs saying. */
  ingredientsNote?: string;
  steps: string[];
  /** Attribution, provenance, whatever has to travel with the recipe. */
  footnote?: React.ReactNode;
  saved: boolean;
  onToggleSave: () => void;
  /** The servings stepper and the buttons, pinned to the bottom. */
  actions: React.ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Svg width={15} height={15} viewBox="0 0 24 24">
              <Path
                d="M19 12H5M11 18l-6-6 6-6"
                stroke={colors.mutedForeground}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{backLabel}</Text>
          </Pressable>

          <Chunk
            depth={2}
            radius={999}
            contentStyle={[
              styles.saveFace,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              onPress={onToggleSave}
              accessibilityRole="button"
              accessibilityState={{ selected: saved }}
              accessibilityLabel={saved ? 'Unsave this recipe' : 'Save this recipe'}
              style={({ pressed }) => [styles.saveInner, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path
                  d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                  stroke={saved ? colors.caloriesText : colors.mutedForeground}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={saved ? colors.caloriesText : 'none'}
                />
              </Svg>
              <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>
                {saved ? 'Saved' : 'Save'}
              </Text>
            </Pressable>
          </Chunk>
        </View>

        {photo ? (
          <Chunk contentStyle={[styles.hero, { borderColor: colors.border }]}>
            <Image source={{ uri: photo }} style={styles.heroImage} resizeMode="cover" />
          </Chunk>
        ) : (
          emoji && (
            <Chunk
              contentStyle={[
                styles.hero,
                styles.heroStandIn,
                { backgroundColor: colors.mutedWash, borderColor: colors.border },
              ]}
            >
              <Text style={styles.heroGlyph}>{emoji}</Text>
            </Chunk>
          )
        )}

        <View>
          <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{eyebrow}</Text>
          <Text style={[t.largeTitle, styles.title, { color: colors.foreground }]}>{title}</Text>
          {summary && (
            <Text style={[t.body, styles.summary, { color: colors.mutedForeground }]}>
              {summary}
            </Text>
          )}

          <View style={styles.meta}>
            <Fact label={`Makes ${portions} ${portions === 1 ? 'portion' : 'portions'}`} icon="users" />
            {typeof minutes === 'number' && <Fact label={`${minutes} min`} icon="clock" />}
            <Fact label={`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`} icon="check" />
          </View>
        </View>

        {/* What it costs, at the size the decision deserves. */}
        <Chunk
          contentStyle={[styles.cost, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View>
            <Text style={[t.figure, styles.costFigure, { color: colors.foreground }]}>
              {Math.round(kcal)}
            </Text>
            <Text style={[t.footnote, styles.costUnit, { color: colors.mutedForeground }]}>
              kcal · {servingLabel}
            </Text>
          </View>
          <View style={styles.macros}>
            <Macro label="Protein" value={protein_g} color={colors.protein} />
            <Macro label="Carbs" value={carbs_g} color={colors.carbs} />
            <Macro label="Fat" value={fat_g} color={colors.fat} />
          </View>
        </Chunk>

        <View>
          <Text style={[t.eyebrow, styles.sectionTitle, { color: colors.mutedForeground }]}>
            Ingredients
          </Text>
          <Chunk
            contentStyle={[
              styles.list,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {ingredients.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.ingredient,
                  index === 0 ? null : { borderTopWidth: 2, borderTopColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    t.body,
                    styles.ingredientText,
                    { color: item.missing ? colors.fatText : colors.foreground },
                  ]}
                >
                  {item.text}
                  {item.note && (
                    <Text style={{ color: colors.mutedForeground }}> ({item.note})</Text>
                  )}
                  {item.missing && (
                    <Text style={[t.footnote, { color: colors.fatText }]}>
                      {' '}
                      · not in your kitchen
                    </Text>
                  )}
                </Text>
                {item.amount && (
                  <Text style={[t.footnote, t.tnum, styles.amount, { color: colors.mutedForeground }]}>
                    {item.amount}
                  </Text>
                )}
              </View>
            ))}
          </Chunk>
          {ingredientsNote && (
            <Text style={[t.footnote, styles.note, { color: colors.mutedForeground }]}>
              {ingredientsNote}
            </Text>
          )}
        </View>

        <View>
          <Text style={[t.eyebrow, styles.sectionTitle, { color: colors.mutedForeground }]}>
            Method
          </Text>
          <View style={styles.steps}>
            {steps.map((step, index) => (
              <Chunk
                key={index}
                contentStyle={[
                  styles.step,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {/* Numbered as an object rather than a superscript: this is the
                    thing you look back at the screen to find again. */}
                <View
                  style={[
                    styles.stepNumber,
                    { backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                >
                  <Text style={[t.figure, styles.stepNumberText, { color: colors.foreground }]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[t.body, styles.stepText, { color: colors.foreground }]}>{step}</Text>
              </Chunk>
            ))}
          </View>
        </View>

        {footnote && (
          <Text style={[t.footnote, styles.footnote, { color: colors.mutedForeground, borderTopColor: colors.border }]}>
            {footnote}
          </Text>
        )}
      </ScrollView>

      {/* Pinned, because the decision to log is made at the end of the method
          and the method is longer than a screen. */}
      <Material style={[styles.actions, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        {actions}
      </Material>
    </View>
  );
}

function Fact({ label, icon }: { label: string; icon: 'users' | 'clock' | 'check' }) {
  const colors = useColors();
  const paths: Record<typeof icon, string> = {
    users: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    check: 'M20 6 9 17l-5-5',
  };
  return (
    <View style={styles.fact}>
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Path
          d={paths[icon]}
          stroke={colors.mutedForeground}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = useColors();
  return (
    <View>
      <View style={styles.macroValue}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={[t.figure, styles.macroFigure, { color: colors.foreground }]}>
          {Math.round(value)}g
        </Text>
      </View>
      <Text style={[t.footnote, styles.costUnit, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, paddingBottom: 32, gap: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  saveFace: { borderWidth: 2, borderRadius: 999 },
  saveInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
  },
  hero: { borderWidth: 2, borderRadius: 24, overflow: 'hidden' },
  heroImage: { width: '100%', aspectRatio: 4 / 3 },
  heroStandIn: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center' },
  heroGlyph: { fontSize: 96, lineHeight: 112, opacity: 0.9 },
  title: { marginTop: 6 },
  summary: { marginTop: 8, lineHeight: 26 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cost: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 24,
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  costFigure: { fontSize: 34, lineHeight: 42 },
  costUnit: { marginTop: 4 },
  macros: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 20 },
  macroValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
  macroFigure: { fontSize: 19, lineHeight: 24 },
  sectionTitle: { paddingHorizontal: 4, marginBottom: 8 },
  list: { borderWidth: 2, borderRadius: 24, overflow: 'hidden' },
  ingredient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ingredientText: { flexShrink: 1, lineHeight: 22 },
  amount: { paddingTop: 2 },
  note: { paddingHorizontal: 4, marginTop: 8, lineHeight: 20 },
  steps: { gap: 10 },
  step: {
    flexDirection: 'row',
    gap: 14,
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: 15, lineHeight: 20 },
  stepText: { flex: 1, lineHeight: 26 },
  footnote: { borderTopWidth: 2, paddingTop: 16, marginTop: 4, lineHeight: 20 },
  actions: { borderTopWidth: 2, paddingHorizontal: 16, paddingTop: 12 },
});
