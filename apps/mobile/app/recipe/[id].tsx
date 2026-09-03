import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recipe } from '@ct/shared';
import { formatDay, formatMass, formatNumber } from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { PressableChunk } from '@/components/Chunk';
import { RecipeReader } from '@/components/kitchen/RecipeReader';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useLocale, useT, type StringKey } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';

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

const ORIGIN_EYEBROW: Record<Recipe['origin'], StringKey> = {
  invented: 'recipe.madeForKitchen',
  adapted: 'recipe.adaptedForYou',
  imported: 'recipe.yourOwn',
};

const CONFIDENCE_NOTE: Record<Recipe['confidence'], StringKey> = {
  high: 'recipe.confidenceHigh',
  medium: 'recipe.confidenceMedium',
  low: 'recipe.confidenceLow',
};

export default function GeneratedRecipeScreen() {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const toast = useToast();
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
      const entry = await api.cookRecipe(recipe.id, { portions: servings });
      haptics.logged();
      // Back to Cook, which re-ranks itself against the day that just moved.
      // Staying here would leave the button that was just pressed under the
      // thumb, inviting a double log.
      //
      // Which is exactly why the receipt is a toast: this screen is on its way
      // out, so anything said on it would be said to nobody.
      toast.success(
        tr('recipe.logged')(entry.description, formatNumber(Math.round(entry.kcal), locale)),
      );
      router.back();
    } catch (e) {
      setError(messageOf(e, tr));
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
      setError(messageOf(e, tr));
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
      backLabel={tr('cook.title')}
      eyebrow={tr(ORIGIN_EYEBROW[recipe.origin])}
      title={recipe.title}
      summary={recipe.summary}
      emoji={foodEmoji(recipe.title)}
      kcal={scale(recipe.kcal, servings)}
      protein_g={scale(recipe.protein_g, servings)}
      carbs_g={scale(recipe.carbs_g, servings)}
      fat_g={scale(recipe.fat_g, servings)}
      servingLabel={
        servings === 1 ? tr('cook.perPortion') : tr('recipe.forPortions')(formatServings(servings))
      }
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
          {tr(CONFIDENCE_NOTE[recipe.confidence])}
          {recipe.generated_for &&
            tr('recipe.writtenAgainst')(
              formatNumber(Math.round(recipe.generated_for.kcal_remaining), locale),
              formatDay(recipe.generated_for.local_date, locale),
            )}
          {error && ` ${error}`}
        </>
      }
      actions={
        <View style={styles.actions}>
          <Servings value={servings} onChange={setServings} unit={tr('recipe.portion')} />
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
                ? tr('recipe.logging')
                : tr('recipe.iAteThis')(
                    formatNumber(Math.round(scale(recipe.kcal, servings)), locale),
                  )}
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
