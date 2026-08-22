import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe } from '@ct/shared';
import { formatMass } from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { PressableChunk } from '@/components/Chunk';
import { RecipeReader } from '@/components/kitchen/RecipeReader';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { Skeleton } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';

/**
 * A recipe written for this person, on its own screen.
 *
 * The same reader as the library's, given a different set of facts. This half
 * has no photograph and no source to credit, and instead has the two things the
 * library cannot have: per-ingredient macros, because the model priced every
 * line and the food entry is built from them, and a note of which lines are
 * already in the kitchen.
 *
 * `origin` is drawn rather than hidden. "Adapted from Baked Trout" and "your
 * recipe, as you gave it" earn different amounts of trust, and the numbers
 * underneath them were arrived at differently.
 */

const ORIGIN_EYEBROW: Record<Recipe['origin'], string> = {
  invented: 'Made for your kitchen',
  adapted: 'Adapted for you',
  imported: 'Your own recipe',
};

const CONFIDENCE_NOTE: Record<Recipe['confidence'], string> = {
  high: 'The numbers here are as good as this app gets without weighing anything.',
  medium: 'The numbers are an estimate — close enough to log, worth a second look if it matters.',
  low: 'These numbers are a rough guess. Weigh what you can if the day is tight.',
};

export default function GeneratedRecipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [missing, setMissing] = useState(false);
  const [servings, setServings] = useState(1);
  const [saved, setSaved] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .recipe(id)
      .then((r) => {
        if (!live) return;
        setRecipe(r);
        setSaved(r.saved);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [id]);

  async function cook() {
    if (!recipe) return;
    setCooking(true);
    try {
      await api.cookRecipe(recipe.id, { portions: servings });
      // Back to Cook, which re-ranks itself against the day that just moved.
      // Staying here would leave the button that was just pressed under the
      // thumb, inviting a double log.
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setCooking(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      await api.saveRecipe(id, next);
    } catch (e) {
      setSaved(!next);
      setError((e as Error).message);
    }
  }

  if (missing) {
    return (
      <View style={[styles.centre, { paddingTop: insets.top + 64 }]}>
        <Text style={[t.body, { color: colors.foreground }]}>
          That recipe isn&rsquo;t here any more.
        </Text>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + 16 }]}>
        <Skeleton style={{ height: 128, borderRadius: 24 }} />
        <Skeleton style={{ height: 40, width: '66%', borderRadius: 999 }} />
        <Skeleton style={{ height: 96, borderRadius: 24 }} />
      </View>
    );
  }

  return (
    <RecipeReader
      backLabel="Cook"
      eyebrow={ORIGIN_EYEBROW[recipe.origin]}
      title={recipe.title}
      summary={recipe.summary}
      emoji={foodEmoji(recipe.title)}
      kcal={scale(recipe.kcal, servings)}
      protein_g={scale(recipe.protein_g, servings)}
      carbs_g={scale(recipe.carbs_g, servings)}
      fat_g={scale(recipe.fat_g, servings)}
      servingLabel={servings === 1 ? 'per portion' : `for ${formatServings(servings)} portions`}
      portions={recipe.portions}
      minutes={recipe.minutes}
      ingredients={recipe.ingredients.map((i) => ({
        text: i.name,
        amount: i.quantity_desc ?? (i.quantity_g === null ? null : formatMass(i.quantity_g, units)),
        missing: i.missing,
      }))}
      steps={recipe.steps}
      saved={saved}
      onToggleSave={() => void toggleSaved()}
      footnote={
        <>
          {CONFIDENCE_NOTE[recipe.confidence]}
          {recipe.generated_for &&
            ` Written against the ${Math.round(recipe.generated_for.kcal_remaining)} kcal you had left on ${recipe.generated_for.local_date}.`}
          {error && ` ${error}`}
        </>
      }
      actions={
        <View style={styles.actions}>
          <Servings value={servings} onChange={setServings} unit="portion" />
          <PressableChunk
            radius={999}
            color={colors.caloriesDeep}
            onPress={() => void cook()}
            disabled={cooking}
            accessibilityRole="button"
            contentStyle={[styles.cook, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.cookLabel, { color: colors.primaryForeground }]}>
              {cooking
                ? 'Logging…'
                : `I ate this · ${Math.round(scale(recipe.kcal, servings))} kcal`}
            </Text>
          </PressableChunk>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  loading: { flex: 1, paddingHorizontal: 16, gap: 16 },
  actions: { gap: 12 },
  cook: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  cookLabel: { fontFamily: font.bold, fontSize: 15, lineHeight: 20 },
});
