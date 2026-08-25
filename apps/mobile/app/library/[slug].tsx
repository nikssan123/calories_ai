import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatNumber, type LibraryRecipe } from '@ct/shared';
import { listWords } from '@ct/shared/words';
import { PressableChunk } from '@/components/Chunk';
import { RecipeReader } from '@/components/kitchen/RecipeReader';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { recipeImageUrl } from '@/lib/links';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useLocale, useT } from '@/lib/i18n';

/**
 * A recipe off the shelf.
 *
 * The same reader as a generated one, with the halves swapped: this has a
 * photograph and a source to credit, and no per-ingredient numbers — the
 * published figures are for the finished dish. The list says so, because a
 * reader who has just seen per-ingredient macros on a generated recipe will
 * notice they are absent here and assume something is broken.
 *
 * "Make it fit me" is the bridge between the two: it spends a recipe run
 * rewriting this against today's budget and the kitchen, and lands on the
 * result rather than dropping it in a tab behind you.
 */
export default function LibraryRecipeScreen() {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [recipe, setRecipe] = useState<LibraryRecipe | null>(null);
  const [missing, setMissing] = useState(false);
  const [servings, setServings] = useState(1);
  const [saved, setSaved] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .libraryRecipe(slug)
      .then((r) => {
        if (!live) return;
        setRecipe(r);
        setSaved(r.saved);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [slug]);

  async function cook() {
    if (!recipe) return;
    setCooking(true);
    try {
      const entry = await api.cookLibraryRecipe(recipe.slug, { portions: servings });
      haptics.logged();
      // The screen leaves with the press, so the receipt has to outlive it.
      toast.success(
        tr('recipe.logged')(entry.description, formatNumber(Math.round(entry.kcal), locale)),
      );
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setCooking(false);
    }
  }

  async function adapt() {
    if (!recipe) return;
    setAdapting(true);
    try {
      const { recipes } = await api.adaptLibraryRecipe(recipe.slug);
      const [adapted] = recipes;
      if (!adapted) throw new Error(tr('recipe.nothingCameBack'));
      // Straight to the rework, replacing this screen: going "back" from the
      // adaptation should reach Cook, not the original it was made from.
      router.replace(`/recipe/${adapted.id}`);
    } catch (e) {
      setError((e as Error).message);
      setAdapting(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      await api.saveLibraryRecipe(slug, next);
    } catch (e) {
      setSaved(!next);
      setError((e as Error).message);
    }
  }

  if (missing) {
    return (
      <View style={[styles.centre, { paddingTop: insets.top + 64 }]}>
        <Text style={[t.body, { color: colors.foreground }]}>
          {tr('recipe.notInLibrary')}
        </Text>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + 16 }]}>
        <Skeleton style={{ height: 240, borderRadius: 24 }} />
        <Skeleton style={{ height: 40, width: '66%', borderRadius: 999 }} />
        <Skeleton style={{ height: 96, borderRadius: 24 }} />
      </View>
    );
  }

  const unit = recipe.serving_size ?? tr('recipe.portion');

  return (
    <RecipeReader
      backLabel={tr('cook.title')}
      eyebrow={tr('recipe.fromLibrary')}
      title={recipe.title}
      summary={recipe.summary}
      photo={recipeImageUrl(recipe.image_path)}
      kcal={scale(recipe.kcal, servings)}
      protein_g={scale(recipe.protein_g, servings)}
      carbs_g={scale(recipe.carbs_g, servings)}
      fat_g={scale(recipe.fat_g, servings)}
      servingLabel={
        servings === 1
          ? tr('cook.per')(unit)
          : tr('recipe.forServings')(formatServings(servings), unit)
      }
      portions={recipe.portions}
      ingredients={recipe.ingredients.map((i) => ({ text: i.text, note: i.note }))}
      ingredientsNote={tr('recipe.ingredientsNote')}
      steps={recipe.steps}
      saved={saved}
      onToggleSave={() => void toggleSaved()}
      footnote={
        <>
          {recipe.source} · {tr('recipe.publicDomain')}
          {recipe.have.length > 0 &&
            ` · ${tr('recipe.usesYour')(listWords(recipe.have, locale)).toLocaleLowerCase(locale)}`}
          {error && ` — ${error}`}
        </>
      }
      actions={
        <View style={styles.actions}>
          <Servings value={servings} onChange={setServings} unit={unit} />
          <View style={styles.buttons}>
            <PressableChunk
              radius={999}
              onPress={() => void adapt()}
              disabled={adapting || cooking}
              accessibilityRole="button"
              style={styles.flex}
              contentStyle={[
                styles.button,
                { backgroundColor: colors.secondary, borderWidth: 2, borderColor: colors.border },
              ]}
            >
              {adapting && <ActivityIndicator size="small" color={colors.secondaryForeground} />}
              <Text style={[styles.buttonLabel, { color: colors.secondaryForeground }]}>
                {adapting ? tr('recipe.reworking') : tr('recipe.makeItFit')}
              </Text>
            </PressableChunk>

            <PressableChunk
              radius={999}
              color={colors.caloriesDeep}
              onPress={() => void cook()}
              disabled={cooking || adapting}
              accessibilityRole="button"
              style={styles.flex}
              contentStyle={[styles.button, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.buttonLabel, { color: colors.primaryForeground }]}>
                {cooking
                  ? tr('recipe.logging')
                  : tr('recipe.iAteThisPlain')(
                      formatNumber(Math.round(scale(recipe.kcal, servings)), locale),
                    )}
              </Text>
            </PressableChunk>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  loading: { flex: 1, paddingHorizontal: 16, gap: 16 },
  actions: { gap: 12 },
  buttons: { flexDirection: 'row', gap: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  buttonLabel: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
});
