import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { Allowance, DaySummary, LibraryRecipe, PantryItem, Recipe, RecipeBrief } from '@ct/shared';
import { formatNumber, meterLocked, meterSpent } from '@ct/shared';
import { listWords, untilWords } from '@ct/shared/words';
import { foodEmoji } from '@ct/shared/food-emoji';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { Brief, BriefToggle } from '@/components/kitchen/Brief';
import { FridgeScan } from '@/components/kitchen/FridgeScan';
import { daysSince, Pantry, STALE_DAYS } from '@/components/kitchen/Pantry';
import { RecipeTile } from '@/components/kitchen/RecipeTile';
import { LockedPanel } from '@/components/PlanWall';
import { Sheet } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { api, planLimitOf } from '@/lib/api';
import { recipeImageUrl } from '@/lib/links';
import { useEntitlements } from '@/lib/entitlements';
import { font, type as t, useColors } from '@/theme';
import { useScrollToTop } from '@/hooks/useScrollToTop';
import { useLocale, useT } from '@/lib/i18n';

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
 * The kitchen is a chip in the title row, opening the sheet that `<Pantry>`
 * fills — a precondition rather than an answer, and not worth the top third of
 * the screen for something checked ten seconds a week.
 */
export default function CookScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();

  const [day, setDay] = useState<DaySummary | null>(null);
  const [items, setItems] = useState<PantryItem[] | null>(null);
  /*
   * Never opened for you: a sheet that appears because you arrived is an
   * interruption, and an empty kitchen is not an emergency — the ask works
   * without one, and the chip already says the list is empty.
   */
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [library, setLibrary] = useState<LibraryRecipe[] | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [message, setMessage] = useState('');
  /*
   * The per-request filters, `wants` among them. It lives in here rather than
   * in a box on the screen because out there it read as a second search box
   * with no explicable purpose; in the sheet its company makes its job obvious.
   */
  const [brief, setBrief] = useState<RecipeBrief>({});
  const [briefOpen, setBriefOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingNote, setThinkingNote] = useState('');
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  /*
   * The plan a wall would be argued from, and the re-read that shuts the
   * controls when one is hit. See `refused` below.
   */
  const { adopt } = useEntitlements();
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

  const loadKitchen = useCallback(async () => {
    try {
      const pantry = await api.pantry();
      setItems(pantry.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void loadKitchen();
  }, [loadKitchen]);

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
  const spent = allowance !== null && meterSpent(allowance);
  /*
   * Not sold on this plan at all, which is a different screen and not merely a
   * different sentence.
   *
   * This is what the free tier is: `recipe`, `pantry_scan` and `meal_plan` are
   * all `allowed: null` there. The check used to be `used >= allowed` alone,
   * which against a null ceiling is `0 >= null` — *false* — so this screen drew
   * a live "Find me something" button, a live fridge scanner and a live week
   * planner, and every one of them died on a 402 the moment it was pressed.
   * That is the exact failure the nullable ceiling exists to prevent; see
   * `meterSpent`.
   */
  const locked = allowance !== null && meterLocked(allowance);

  const fresh = (items ?? []).filter((i) => !i.is_staple);
  const staleCount = fresh.filter((i) => daysSince(i.last_seen_at) >= STALE_DAYS).length;

  /**
   * What pressing the button will do, in a sentence, before it is pressed.
   *
   * The box above it is optional and looks it, and you are meant to be able to
   * press the button having typed nothing — so the line says both halves out
   * loud: what it is going to write, and the budget it is writing against,
   * which is the part no recipe site could say.
   */
  const plan = (() => {
    if (spent && allowance?.allowed != null) {
      const back = allowance.resets_at
        ? tr('cook.planSpentBack')(untilWords(allowance.resets_at, locale))
        : '';
      return `${tr('cook.planSpent')(tr('cook.runs')(allowance.allowed))}${back}`;
    }
    /*
     * An empty kitchen is a different promise, not a smaller one. Saying "from
     * what's in your kitchen" when the kitchen is empty is the screen telling
     * an obvious lie in its first sentence — and it is the first sentence a new
     * account ever reads.
     */
    if (items !== null && items.length === 0) {
      return tr('cook.planEmptyKitchen');
    }
    const from = brief.wants?.trim() ? tr('cook.planFromWants') : tr('cook.planFromKitchen');
    if (!remaining) return `${from}.`;
    if (remaining.kcal === 0) return tr('cook.planAtTarget')(from);
    return tr('cook.planAiming')(
      from,
      formatNumber(remaining.kcal, locale),
      formatNumber(remaining.protein, locale),
    );
  })();

  /**
   * A failure, sorted into the two kinds this screen has.
   *
   * A 402 is not a fault and must not be drawn as one — but it also means this
   * screen's copy of the allowance is out of date, and that is the part worth
   * acting on: the button that was just pressed should be shut before it can be
   * pressed a second time. Adopting the allowance the refusal carried does
   * both, because every control here is disabled off `spent` and `locked`.
   *
   * The panel it turns into does the talking, so nothing is set on `error` —
   * a red sentence *and* a wall would be the same news told twice, once
   * wrongly.
   */
  function refused(e: unknown): void {
    const limit = planLimitOf(e);
    if (limit?.allowance) {
      setAllowance(limit.allowance);
      adopt(limit.allowance);
      return;
    }
    setError((e as Error).message);
  }

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

  /*
   * A scan started to cook rather than to tidy the list. The finds are already
   * in the pantry by the time this runs — <FridgeScan> commits them either way
   * — so the reload is what keeps the kitchen chip honest while the recipe is
   * being written.
   */
  async function cookFromPhoto(found: string[]) {
    await suggest(found, true);
  }

  async function importRecipe() {
    setImporting(true);
    try {
      const { recipes } = await api.importRecipe({ text: importText.trim() });
      const [recipe] = recipes;
      if (!recipe) throw new Error("I couldn't read that as a recipe.");
      setRecipes((prev) => [recipe, ...prev]);
      setMessage('');
      setTab('ideas');
      setImportText('');
      setImportOpen(false);
      setError(null);
    } catch (e) {
      setImportOpen(false);
      refused(e);
    } finally {
      setImporting(false);
    }
  }

  async function suggest(focus?: string[], reloadKitchenFirst = false) {
    // Claimed before the first await, so a second tap in the same tick turns
    // into nothing rather than into a second run against the same budget.
    if (running.current) return;
    running.current = true;
    const asked = brief.wants?.trim() ?? '';

    /*
     * Say what is being done, and where the answer will appear, before any of
     * it exists. A verb and an object beats a verb: "Thinking…" on the button
     * says nothing about what it was asked or where the reply will land.
     */
    setThinkingNote(
      focus?.length
        ? tr('cook.writingAround')(listWords(focus.slice(0, 4), locale))
        : asked
          ? tr('cook.writingFor')(asked)
          : "Writing a recipe from what's in your kitchen…",
    );
    // Moved to the front: the skeletons are the answer to "what is it doing",
    // and they are no use on a tab you cannot see.
    setTab('ideas');
    setThinking(true);
    try {
      // Inside the guard rather than before the call, so the screen is locked
      // for the round trip too.
      if (reloadKitchenFirst) await loadKitchen();
      const result = await api.suggestRecipes({
        ...brief,
        wants: asked || undefined,
        focus: focus?.length ? focus : undefined,
      });
      setRecipes(result.recipes);
      setMessage(result.message);
      setAllowance(result.allowance);
      adopt(result.allowance);
      setError(null);
    } catch (e) {
      refused(e);
    } finally {
      running.current = false;
      setThinking(false);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/*
        The title, and the kitchen as one chip beside it. The kitchen is a
        precondition, not an answer — it does not get the top third of the
        screen for something checked ten seconds a week.
      */}
      <View style={styles.titleRow}>
        <Text style={[t.largeTitle, { color: colors.foreground }]}>{tr('cook.title')}</Text>
        {items !== null && (
          <Chunk
            depth={2}
            radius={999}
            contentStyle={[
              styles.chip,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              onPress={() => setKitchenOpen(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chipInner, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.chipGlyph}>🧺</Text>
              <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>
                {fresh.length === 0 ? tr('cook.kitchenEmpty') : tr('cook.things')(fresh.length)}
              </Text>
              {staleCount > 0 && (
                <Text style={[t.footnoteSemibold, { color: colors.fatText }]}>
                  {tr('cook.toCheck')(staleCount)}
                </Text>
              )}
            </Pressable>
          </Chunk>
        )}
      </View>

      <Sheet open={kitchenOpen} title={tr('cook.yourKitchen')} onClose={() => setKitchenOpen(false)}>
        {items && (
          <Pantry
            items={items}
            onChanged={loadKitchen}
            onCook={async (found) => {
              setKitchenOpen(false);
              await cookFromPhoto(found);
            }}
            onError={refused}
          />
        )}
      </Sheet>

      {/*
        The kitchen, when the kitchen is not on this plan.
        
        It replaces the controls rather than disabling them, and that is the
        decision worth stating: a row of greyed buttons is a screen telling you
        what you cannot have, four times, with no way to act on it. One panel
        says the same thing once and has somewhere to go.
        
        The library below stays exactly as it is — it is a static collection and
        costs nothing to serve, so there is no reason to lock it and every
        reason not to: it is the part of this tab a free account can actually
        use, and hiding it would make the whole tab dead weight.
      */}
      {locked ? (
        <LockedPanel
          style={styles.ask}
          meter="recipe"
          title={tr('cook.kitchenLocked')}
          body={tr('cook.kitchenLockedBody')}
        />
      ) : (
      <View style={styles.ask}>
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
            {thinking
              ? tr('cook.thinking')
              : spent
                ? tr('cook.nothingLeftToday')
                : tr('cook.findMeSomething')}
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

        {/* The other three ways in. All the same size, nothing hidden behind a
            menu — "photograph your fridge" is the one thing here nobody would
            think to go looking for. */}
        <View style={styles.ways}>
          <FridgeScan
            onSaved={loadKitchen}
            onCook={cookFromPhoto}
            canCook={!spent && !thinking}
            onError={refused}
          />
          <BriefToggle value={brief} onPress={() => setBriefOpen(true)} />
          <Pressable
            onPress={() => setImportOpen(true)}
            disabled={spent || thinking}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.way,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: spent || thinking ? 0.4 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z"
                stroke={colors.mutedForeground}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>
              {tr('import.chip')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/plan')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.way,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path
                d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
                stroke={colors.mutedForeground}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>
              {tr('cook.planTheWeek')}
            </Text>
          </Pressable>
        </View>
      </View>
      )}

      {/*
        The filters, with the button repeated at the foot — so setting one and
        running is a single gesture rather than set, close, then go looking for
        the button again.
      */}
      <Sheet open={briefOpen} title={tr('cook.anythingSpecific')} onClose={() => setBriefOpen(false)}>
        <Brief value={brief} onChange={setBrief} />
        <View style={[styles.sheetFoot, { borderTopColor: colors.border }]}>
          <PressableChunk
            radius={999}
            color={spent ? undefined : colors.caloriesDeep}
            onPress={() => {
              setBriefOpen(false);
              void suggest();
            }}
            disabled={thinking || spent}
            accessibilityRole="button"
            contentStyle={[
              styles.find,
              spent
                ? { backgroundColor: colors.secondary, borderWidth: 2, borderColor: colors.border }
                : { backgroundColor: colors.primary },
            ]}
          >
            <Sparkles color={spent ? colors.secondaryForeground : colors.primaryForeground} />
            <Text
              style={[
                styles.findLabel,
                { color: spent ? colors.secondaryForeground : colors.primaryForeground },
              ]}
            >
              {spent ? tr('cook.nothingLeftToday') : tr('cook.findMeSomething')}
            </Text>
          </PressableChunk>
        </View>
      </Sheet>

      <Sheet
        open={importOpen}
        title={tr('import.title')}
        onClose={() => !importing && setImportOpen(false)}
      >
        <View style={styles.importBody}>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            {tr('import.desc')}
          </Text>
          <TextInput
            value={importText}
            onChangeText={setImportText}
            multiline
            placeholder={tr('import.placeholder')}
            placeholderTextColor={colors.mutedForeground}
            style={[
              t.body,
              styles.importInput,
              {
                backgroundColor: colors.mutedField,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
          />
          <PressableChunk
            radius={999}
            color={colors.caloriesDeep}
            onPress={() => void importRecipe()}
            disabled={!importText.trim() || importing}
            accessibilityRole="button"
            style={{ opacity: !importText.trim() || importing ? 0.4 : 1 }}
            contentStyle={[styles.find, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.findLabel, { color: colors.primaryForeground }]}>
              {importing ? tr('cook.readingIt') : tr('cook.workOutCalories')}
            </Text>
          </PressableChunk>
        </View>
      </Sheet>

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
                    ? `${tr('cook.forYou')}${recipes.length > 0 ? ` · ${recipes.length}` : ''}`
                    : tr('cook.library')}
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
          placeholder={tr('cook.searchLibrary')}
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
              {/* Which sentence depends on whether the button it names is on
                  the screen. Pointing somebody at "Find me something" on a plan
                  where that control has been replaced by a lock is the kind of
                  copy that makes an app feel broken rather than limited. */}
              <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
                {locked ? (
                  <>
                    {tr('cook.emptyLockedBefore')}{' '}
                    <Text style={{ color: colors.foreground }}>{tr('cook.library')}</Text>{' '}
                    {tr('cook.emptyLockedAfter')}
                  </>
                ) : (
                  <>
                    {tr('cook.emptyBefore')}{' '}
                    <Text style={{ color: colors.foreground }}>{tr('cook.findMeSomething')}</Text>{' '}
                    {tr('cook.emptyAfterShort')}
                  </>
                )}
              </Text>
            </View>
          ) : (
            recipes.map((recipe, i) => (
              <Arriving key={recipe.id} index={i}>
                <RecipeTile
                  title={recipe.title}
                  summary={recipe.summary}
                  kcal={recipe.kcal}
                  protein_g={recipe.protein_g}
                  servingLabel={tr('cook.perPortion')}
                  emoji={foodEmoji(recipe.title)}
                  needs={recipe.ingredients.filter((i) => i.missing).map((i) => i.name)}
                  minutes={recipe.minutes}
                  steps={recipe.steps.length}
                  saved={recipe.saved}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                  onToggleSave={() => void toggleRecipeSaved(recipe.id, !recipe.saved)}
                />
              </Arriving>
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
            {tr('cook.nothingMatching')(librarySearch)}
          </Text>
        ) : (
          <>
            {library.map((recipe, i) => (
              <Arriving key={recipe.slug} index={i}>
                <RecipeTile
                  title={recipe.title}
                  summary={recipe.summary}
                  kcal={recipe.kcal}
                  protein_g={recipe.protein_g}
                  servingLabel={
                    recipe.serving_size
                      ? tr('cook.per')(recipe.serving_size)
                      : tr('cook.perPortion')
                  }
                  photo={recipeImageUrl(recipe.image_path)}
                  fitsToday={recipe.fits_today}
                  have={recipe.have}
                  steps={recipe.steps.length}
                  saved={recipe.saved}
                  onPress={() => router.push(`/library/${recipe.slug}`)}
                  onToggleSave={() => void toggleLibrarySaved(recipe.slug, !recipe.saved)}
                />
              </Arriving>
          ))}
          <Text style={[t.footnote, styles.aside, { color: colors.mutedForeground }]}>
            {tr('cook.libraryNote')}
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

/**
 * A tile taking its turn.
 *
 * Cook is the one screen where a whole grid lands at once — a run finishes and
 * four recipes appear together — and the stagger is what turns that from a
 * flash into a list being dealt out. The same 70ms `MacroBars` uses, and the
 * same cap: past the seventh tile the delay is longer than anyone waits before
 * scrolling.
 *
 * A wrapper rather than a prop on `RecipeTile`, because the tile is also drawn
 * inside a chat card, where things arrive one at a time and there is nothing to
 * stagger against.
 */
function Arriving({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(260)
        .delay(Math.min(index, 6) * 70)
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
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
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chip: { borderWidth: 2, borderRadius: 999 },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  chipGlyph: { fontSize: 14, lineHeight: 18 },
  ask: { gap: 10, marginTop: 4 },
  /*
   * No separators between these.
   *
   * The web sets a `·` between each, which is fine on one line and wrong the
   * moment the row wraps — a dot is a sibling like any other, so a wrap can
   * leave one stranded at the end of a line with nothing after it to separate.
   * Four chips at a phone's width wrap every time. Spacing does the same job
   * and cannot dangle.
   */
  ways: { flexDirection: 'row', alignItems: 'center', columnGap: 8, rowGap: 8, flexWrap: 'wrap' },
  /*
   * A surface at rest, which the web's version does not have.
   *
   * On the web these are bare muted text and grow a background on hover — and
   * that hover is what says "this is a control". A phone has no hover, so four
   * lines of small grey text under a large green button read as a caption, not
   * as four things you can press. Worse, four of them do not fit one line at
   * this width, so they wrap into a ragged two-by-two and the raggedness is
   * what makes it look broken: discrete objects can wrap untidily and still
   * look deliberate, loose text cannot.
   */
  way: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sheetFoot: { borderTopWidth: 2, padding: 12 },
  importBody: { paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  importInput: {
    minHeight: 180,
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
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
