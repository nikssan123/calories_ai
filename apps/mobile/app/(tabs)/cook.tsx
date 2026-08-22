import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { DaySummary, LibraryRecipe, Recipe, RecipeAllowance } from '@ct/shared';
import { untilWords } from '@ct/shared/words';
import { foodEmoji } from '@ct/shared/food-emoji';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { RecipeTile } from '@/components/kitchen/RecipeTile';
import { Skeleton } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { font, type as t, useColors } from '@/theme';

/**
 * Cook — what you could make, from what you have, that fits what is left.
 *
 * The screen is the recipes. Everything above the grid is a control, and on the
 * web controls had once eaten the whole page: a kitchen card, an ask card and a
 * week row, four things asking for input before a single answer. What is left
 * is one button, the sentence saying what it will do, and the two tabs.
 *
 * The budget line is doing more work than it looks like it is: it is the reason
 * the suggestions are any good, and saying it out loud is what separates this
 * from a recipe search that happens to live inside a food app.
 *
 * Three of the web's ways in are not here yet and are named where they would
 * be: the kitchen list itself, a photograph of a shelf, and a pasted recipe.
 * The first two want `<Pantry>` and `<FridgeScan>`; the run works without any
 * of them, because the pantry reaches the model from the server either way.
 */
export default function CookScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [day, setDay] = useState<DaySummary | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [library, setLibrary] = useState<LibraryRecipe[] | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [message, setMessage] = useState('');
  const [wants, setWants] = useState('');
  const [thinking, setThinking] = useState(false);
  const [thinkingNote, setThinkingNote] = useState('');
  const [allowance, setAllowance] = useState<RecipeAllowance | null>(null);
  const [tab, setTab] = useState<'ideas' | 'library'>('ideas');
  const [error, setError] = useState<string | null>(null);

  /**
   * The same fact as `thinking`, readable synchronously.
   *
   * Every control that can start a run is disabled on `thinking`, which is
   * correct and not sufficient: `setThinking(true)` schedules a render, so two
   * taps landing in the same tick both see a live button and both start a run.
   * The second costs a full run out of a three-a-day budget, so the guard is a
   * ref rather than a nicety.
   */
  const running = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        setDay(await api.day());
      } catch {
        // The screen works without it; the sentence below simply says less.
      }
      try {
        const { recipes, allowance } = await api.recipes({ limit: 6 });
        setRecipes(recipes);
        setAllowance(allowance);
      } catch {
        // Not worth reporting: whatever went wrong will say so again the
        // moment they ask for something new.
      }
    })();
  }, []);

  const loadLibrary = useCallback(async (search: string) => {
    try {
      const { recipes } = await api.library({ q: search || undefined, limit: 12 });
      setLibrary(recipes);
    } catch (e) {
      setError((e as Error).message);
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadLibrary(librarySearch), librarySearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadLibrary, librarySearch]);

  const remaining = day
    ? {
        kcal: Math.max(0, Math.round(day.targets.kcal - day.consumed.kcal)),
        protein: Math.max(0, Math.round(day.targets.protein_g - day.consumed.protein_g)),
      }
    : null;

  /*
   * Spent, and therefore the reason every button that starts a run is shut.
   * Null while it is still loading — an unknown budget is not a spent one, and
   * disabling on "do not know yet" would make the screen start broken.
   */
  const spent = allowance !== null && allowance.used >= allowance.allowed;

  /**
   * What pressing the button will do, in a sentence, before it is pressed.
   *
   * The box above it is optional and looks it, and you are meant to be able to
   * press the button having typed nothing — so the line says both halves out
   * loud: what it is going to write, and the budget it is writing against,
   * which is the part no recipe site could say.
   */
  const plan = (() => {
    if (spent && allowance) {
      const back = allowance.resets_at
        ? ` You'll have another ${untilWords(allowance.resets_at)}.`
        : '';
      return `That's your ${allowance.allowed === 1 ? 'one recipe run' : `${allowance.allowed} recipe runs`} for today.${back}`;
    }
    const from = wants.trim()
      ? `I'll work from what you asked for and what's in your kitchen`
      : `I'll invent a recipe from what's in your kitchen`;
    if (!remaining) return `${from}.`;
    if (remaining.kcal === 0) return `${from} — and you're at your target today, so I'll keep it light.`;
    return `${from}, aiming at the ${remaining.kcal} kcal and ${remaining.protein}g protein you have left.`;
  })();

  /*
   * Saving is the one thing done from the grid, because it is the one thing you
   * do *while* choosing rather than after. Both write through optimistically
   * and put the flag back if the request fails — a bookmark that silently did
   * not save is worse than one that visibly bounces.
   */
  async function toggleRecipeSaved(id: string, next: boolean) {
    const flip = (value: boolean) =>
      setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, saved: value } : r)));
    flip(next);
    try {
      await api.saveRecipe(id, next);
    } catch (e) {
      flip(!next);
      setError((e as Error).message);
    }
  }

  async function toggleLibrarySaved(slug: string, next: boolean) {
    const flip = (value: boolean) =>
      setLibrary((prev) => prev?.map((r) => (r.slug === slug ? { ...r, saved: value } : r)) ?? prev);
    flip(next);
    try {
      await api.saveLibraryRecipe(slug, next);
    } catch (e) {
      flip(!next);
      setError((e as Error).message);
    }
  }

  async function suggest() {
    // Claimed before the first await, so a second tap in the same tick turns
    // into nothing rather than into a second run against the same budget.
    if (running.current) return;
    running.current = true;
    const asked = wants.trim();

    /*
     * Say what is being done, and where the answer will appear, before any of
     * it exists. A verb and an object beats a verb: "Thinking…" on the button
     * says nothing about what it was asked or where the reply will land.
     */
    setThinkingNote(
      asked
        ? `Writing a recipe for “${asked}”, from what's in your kitchen…`
        : "Writing a recipe from what's in your kitchen…",
    );
    // Moved to the front: the skeletons are the answer to "what is it doing",
    // and they are no use on a tab you cannot see.
    setTab('ideas');
    setThinking(true);
    try {
      const result = await api.suggestRecipes({ wants: asked || undefined });
      setRecipes(result.recipes);
      setMessage(result.message);
      setAllowance(result.allowance);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setThinking(false);
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[t.largeTitle, { color: colors.foreground }]}>Cook</Text>

      <View style={styles.ask}>
        <TextInput
          value={wants}
          onChangeText={setWants}
          onSubmitEditing={() => void suggest()}
          returnKeyType="search"
          placeholder="What do you fancy?"
          placeholderTextColor={colors.mutedForeground}
          editable={!thinking && !spent}
          style={[
            t.body,
            styles.wants,
            { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground },
          ]}
        />

        <PressableChunk
          radius={999}
          color={spent ? undefined : colors.caloriesDeep}
          onPress={() => void suggest()}
          disabled={thinking || spent}
          accessibilityRole="button"
          contentStyle={[
            styles.find,
            spent
              ? { backgroundColor: colors.secondary, borderWidth: 2, borderColor: colors.border }
              : { backgroundColor: colors.primary },
          ]}
        >
          {thinking ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Sparkles color={spent ? colors.secondaryForeground : colors.primaryForeground} />
          )}
          <Text
            style={[
              styles.findLabel,
              { color: spent ? colors.secondaryForeground : colors.primaryForeground },
            ]}
          >
            {thinking ? 'Thinking…' : spent ? 'Nothing left today' : 'Find me something'}
          </Text>
        </PressableChunk>

        {/*
          The budget, said out loud. It is the reason the suggestions are any
          good, and saying it is what separates this from a recipe search that
          happens to live inside a food app.
        */}
        <Text
          style={[t.footnote, styles.plan, { color: spent ? colors.fatText : colors.mutedForeground }]}
        >
          {plan}
        </Text>
      </View>

      <View style={styles.tabs}>
        <Chunk
          depth={2}
          radius={999}
          contentStyle={[
            styles.switcher,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {(['ideas', 'library'] as const).map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.switcherItem, active ? { backgroundColor: colors.primary } : null]}
              >
                <Text
                  style={[
                    styles.switcherLabel,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {key === 'ideas'
                    ? `For you${recipes.length > 0 ? ` · ${recipes.length}` : ''}`
                    : 'Library'}
                </Text>
              </Pressable>
            );
          })}
        </Chunk>
      </View>

      {/* The shelf's own filter, in the row that switches to the shelf. */}
      {tab === 'library' && (
        <TextInput
          value={librarySearch}
          onChangeText={setLibrarySearch}
          placeholder="Search the library"
          placeholderTextColor={colors.mutedForeground}
          style={[
            t.body,
            styles.search,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
          ]}
        />
      )}

      {tab === 'ideas' && thinking ? (
        /*
          The wait, shown where the answer is going to be rather than on the
          button that started it — and the sentence above it repeats what it was
          asked, which is the thing a spinner cannot say.
        */
        <>
          <Text style={[t.body, styles.aside, { color: colors.mutedForeground }]}>
            {thinkingNote}
          </Text>
          <Skeleton style={styles.tileSkeleton} />
          <Skeleton style={styles.tileSkeleton} />
        </>
      ) : tab === 'ideas' ? (
        <>
          {message.length > 0 && (
            <Text style={[t.body, styles.aside, { color: colors.mutedForeground }]}>{message}</Text>
          )}

          {recipes.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.mascot}>👩‍🍳</Text>
              <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
                Nothing yet. Press{' '}
                <Text style={{ color: colors.foreground }}>Find me something</Text> and I&rsquo;ll
                invent a recipe from what&rsquo;s in your kitchen.
              </Text>
            </View>
          ) : (
            recipes.map((recipe) => (
              <RecipeTile
                key={recipe.id}
                title={recipe.title}
                summary={recipe.summary}
                kcal={recipe.kcal}
                protein_g={recipe.protein_g}
                servingLabel="per portion"
                emoji={foodEmoji(recipe.title)}
                needs={recipe.ingredients.filter((i) => i.missing).map((i) => i.name)}
                minutes={recipe.minutes}
                steps={recipe.steps.length}
                saved={recipe.saved}
                onPress={() => router.push(`/recipe/${recipe.id}`)}
                onToggleSave={() => void toggleRecipeSaved(recipe.id, !recipe.saved)}
              />
            ))
          )}
        </>
      ) : library === null ? (
        <>
          <Skeleton style={styles.tileSkeleton} />
          <Skeleton style={styles.tileSkeleton} />
        </>
      ) : library.length === 0 ? (
        <Text style={[t.body, styles.centred, styles.aside, { color: colors.mutedForeground }]}>
          Nothing matching &ldquo;{librarySearch}&rdquo;.
        </Text>
      ) : (
        <>
          {library.map((recipe) => (
            <RecipeTile
              key={recipe.slug}
              title={recipe.title}
              summary={recipe.summary}
              kcal={recipe.kcal}
              protein_g={recipe.protein_g}
              servingLabel={`per ${recipe.serving_size ?? 'portion'}`}
              photo={recipe.image_path ? api.photoUrl(recipe.image_path) : null}
              fitsToday={recipe.fits_today}
              have={recipe.have}
              steps={recipe.steps.length}
              saved={recipe.saved}
              onPress={() => router.push(`/library/${recipe.slug}`)}
              onToggleSave={() => void toggleLibrarySaved(recipe.slug, !recipe.saved)}
            />
          ))}
          <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
            Real recipes from the USDA&rsquo;s public-domain collection, sorted by how much of one
            you already have.
          </Text>
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

function Sparkles({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  ask: { gap: 10, marginTop: 4 },
  wants: {
    height: 48,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 0,
  },
  find: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 999,
    paddingHorizontal: 24,
  },
  findLabel: { fontFamily: font.bold, fontSize: 15, lineHeight: 20 },
  plan: { paddingHorizontal: 4, lineHeight: 20 },
  tabs: { flexDirection: 'row', marginTop: 8 },
  switcher: { flexDirection: 'row', borderWidth: 2, borderRadius: 999, padding: 4 },
  switcherItem: {
    height: 32,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherLabel: { fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
  search: {
    height: 40,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  aside: { paddingHorizontal: 4, lineHeight: 24 },
  tileSkeleton: { height: 288, borderRadius: 24 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  mascot: { fontSize: 40, lineHeight: 48, marginBottom: 12 },
  centred: { textAlign: 'center' },
});
