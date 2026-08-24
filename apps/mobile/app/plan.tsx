import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { MealPlan, MealPlanSlot, ShoppingList } from '@ct/shared';
import { formatMass, meterLocked } from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { PressableChunk } from '@/components/Chunk';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { LockedPanel } from '@/components/PlanWall';
import { NumberField } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { removeAction, SwipeRow } from '@/components/SwipeRow';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';
import { useEntitlements } from '@/lib/entitlements';

/**
 * The week's dinners, and the shop that follows from them.
 *
 * A week is read down rather than acted on one item at a time, which is why
 * this is a list of nights and not seven recipe tiles — seven of those is a
 * screen and a half of scrolling to answer "what is Thursday?".
 *
 * The shopping list is the half that justifies planning at all. It is derived
 * from the nights, minus whatever the kitchen already has — and it says what it
 * left out, because a list that silently omits butter is one you find out about
 * at the till.
 */
export default function PlanScreen() {
  const colors = useColors();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const units = useUnits();

  const [plan, setPlan] = useState<MealPlan | null>(null);
  const undoably = useUndoableRemoval();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Whether a week can be planned at all on this account. `meal_plan` is
   * `allowed: null` outside Coach, and the button below spends the single most
   * expensive action in the product — roughly $0.63 of model — so it is the
   * last one that should be live on a plan that does not carry it.
   *
   * Through `meterLocked` rather than testing `allowed` directly, because an
   * unmetered account has a null ceiling for the opposite reason: nobody is
   * billed for its turns, so there is nothing to lock.
   */
  const { allowances } = useEntitlements();
  const planLocked = allowances ? meterLocked(allowances.meal_plan) : false;

  const [wants, setWants] = useState('');
  const [servings, setServings] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [batch, setBatch] = useState(true);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    try {
      const { plan: found, week_start } = await api.mealPlan();
      setPlan(found);
      // Always worth a request. The list holds written lines too, and those
      // exist whether or not anybody has planned anything.
      setList(await api.shoppingList(week_start));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function planWeek() {
    setThinking(true);
    try {
      const { plan: next } = await api.planWeek({
        wants: wants.trim() || undefined,
        minutes,
        servings,
        batch,
      });
      setPlan(next);
      setList(await api.shoppingList(next.week_start));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function cook(slot: MealPlanSlot) {
    try {
      const entry = await api.cookSlot(slot.id);
      haptics.logged();
      // The plan draws the week, never the day, so logging a night's dinner
      // from here changes nothing anybody can see on this screen.
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function clear(slot: MealPlanSlot) {
    try {
      setPlan(await api.updateSlot(slot.id, { recipe_id: null }));
      if (plan) setList(await api.shoppingList(plan.week_start));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addLine() {
    const name = draft.trim();
    if (!name || !list) return;
    setDraft('');
    try {
      setList(await api.addShoppingItems([{ name }], list.week_start));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function tick(extraId: string, bought: boolean) {
    // Optimistic: a tick that waits for a round trip in a supermarket aisle is
    // a tick you press twice.
    setList((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.extra_id === extraId ? { ...i, bought } : i)) }
        : prev,
    );
    try {
      await api.updateShoppingItem(extraId, { bought });
    } catch (e) {
      setError((e as Error).message);
      await load();
    }
  }

  function removeLine(extraId: string, name: string) {
    const before = list;
    setList((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.extra_id !== extraId) } : prev,
    );

    undoably(`Removed ${name}`, {
      commit: () => {
        void api.deleteShoppingItem(extraId).catch((e: Error) => {
          setError(e.message);
          void load();
        });
      },
      restore: () => setList(before),
    });
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 12 }]}
      keyboardShouldPersistTaps="handled"
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
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>Cook</Text>
        </Pressable>
      </View>

      <Text style={[t.largeTitle, { color: colors.foreground }]}>The week</Text>

      {loading ? (
        <>
          <Skeleton style={{ height: 200, borderRadius: 24 }} />
          <Skeleton style={{ height: 160, borderRadius: 24 }} />
        </>
      ) : (
        <>
          {/*
            The form, or the reason there is no form. Same slot in the page —
            a locked feature that leaves a dead form behind is a screen inviting
            somebody to fill in four fields for a button that will refuse them.
            
            Everything below stays: a week already planned, its dinners and its
            shopping list are theirs, and they do not stop being theirs because
            a subscription lapsed.
          */}
          {planLocked ? (
            <LockedPanel
              meter="meal_plan"
              title="Planning a week is part of Coach"
              body="Seven dinners against your targets and what's already in your kitchen, batched where it helps, with the shopping list written for you."
            />
          ) : (
          <InsetGroup
            title="🗓  Plan it"
            footer="Seven dinners against your targets and what's already in the kitchen. Batching means one cook covering two nights."
          >
            <View style={styles.form}>
              <TextInput
                value={wants}
                onChangeText={setWants}
                placeholder="Anything in mind? — “nothing with fish”"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  t.body,
                  styles.wants,
                  {
                    backgroundColor: colors.mutedField,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />

              <View style={styles.numbers}>
                <View style={styles.number}>
                  <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
                    Cooking for
                  </Text>
                  <NumberField
                    value={servings}
                    onChange={setServings}
                    unit="people"
                    style={styles.numberField}
                  />
                </View>
                <View style={styles.number}>
                  <Text style={[t.footnote, styles.label, { color: colors.mutedForeground }]}>
                    At most
                  </Text>
                  <NumberField
                    value={minutes}
                    onChange={setMinutes}
                    unit="min"
                    style={styles.numberField}
                  />
                </View>
              </View>

              <View style={styles.batchRow}>
                <View style={styles.flex}>
                  <Text style={[t.body, { color: colors.foreground }]}>Batch where it helps</Text>
                  <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                    One cook covering two nights.
                  </Text>
                </View>
                <Switch value={batch} onValueChange={setBatch} accessibilityLabel="Batch cooking" />
              </View>

              <PressableChunk
                radius={999}
                color={colors.caloriesDeep}
                onPress={() => void planWeek()}
                disabled={thinking}
                accessibilityRole="button"
                contentStyle={[styles.plan, { backgroundColor: colors.primary }]}
              >
                {thinking && <ActivityIndicator size="small" color={colors.primaryForeground} />}
                <Text style={[styles.planLabel, { color: colors.primaryForeground }]}>
                  {thinking ? 'Planning…' : plan ? 'Plan it again' : 'Plan the week'}
                </Text>
              </PressableChunk>
            </View>
          </InsetGroup>
          )}

          {plan && (
            <InsetGroup title="🍽  Dinners">
              {plan.slots.map((slot, i) => (
                <Night
                  key={slot.id}
                  slot={slot}
                  first={i === 0}
                  onOpen={() => slot.recipe && router.push(`/recipe/${slot.recipe.id}`)}
                  onCook={() => void cook(slot)}
                  onClear={() => void clear(slot)}
                />
              ))}
            </InsetGroup>
          )}

          {list && (
            <InsetGroup
              title="🧾  Shopping"
              footer={
                list.have_already.length > 0
                  ? `Left off because you already have them: ${list.have_already.join(', ')}.`
                  : undefined
              }
            >
              <View style={[styles.addRow, { borderBottomColor: colors.border }]}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={() => void addLine()}
                  returnKeyType="done"
                  placeholder="Add something else"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    t.body,
                    styles.addInput,
                    {
                      backgroundColor: colors.mutedField,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                />
                <Pressable
                  onPress={() => void addLine()}
                  disabled={!draft.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Add"
                  style={({ pressed }) => [
                    styles.addButton,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      opacity: !draft.trim() ? 0.4 : pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24">
                    <Path
                      d="M12 5v14M5 12h14"
                      stroke={colors.mutedForeground}
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                </Pressable>
              </View>

              {list.items.length === 0 ? (
                <Text style={[t.body, styles.empty, { color: colors.mutedForeground }]}>
                  Nothing to buy yet.
                </Text>
              ) : (
                list.items.map((item, i) => (
                  <SwipeRow
                    key={item.extra_id ?? `${item.name}-${i}`}
                    index={i}
                    style={i === 0 ? null : { borderTopWidth: 2, borderTopColor: colors.border }}
                    actions={
                      item.extra_id
                        ? [
                            removeAction(colors, item.name, () =>
                              removeLine(item.extra_id!, item.name),
                            ),
                          ]
                        : []
                    }
                  >
                    <InsetRow first>
                      {/* Only a line somebody wrote can be ticked or removed. The
                          rest is derived from the week — the way to settle one is
                          to cook the night or change it, not to argue with the
                          list. */}
                      {item.extra_id ? (
                        <Pressable
                          onPress={() => void tick(item.extra_id!, !item.bought)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: item.bought }}
                          hitSlop={6}
                          style={[
                            styles.box,
                            {
                              backgroundColor: item.bought ? colors.primary : 'transparent',
                              borderColor: item.bought ? colors.caloriesDeep : colors.border,
                            },
                          ]}
                        >
                          {item.bought && (
                            <Svg width={13} height={13} viewBox="0 0 24 24">
                              <Path
                                d="M20 6 9 17l-5-5"
                                stroke={colors.primaryForeground}
                                strokeWidth={3.2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                              />
                            </Svg>
                          )}
                        </Pressable>
                      ) : (
                        <View style={[styles.dot, { backgroundColor: colors.border }]} />
                      )}

                      <View style={styles.flex}>
                        <Text
                          style={[
                            t.body,
                            item.bought ? styles.bought : null,
                            { color: item.bought ? colors.mutedForeground : colors.foreground },
                          ]}
                        >
                          {item.name}
                        </Text>
                        {(item.quantity_g !== null || item.quantity_descs.length > 0) && (
                          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                            {item.quantity_g !== null
                              ? formatMass(item.quantity_g, units)
                              : item.quantity_descs.join(' · ')}
                          </Text>
                        )}
                      </View>

                      {item.extra_id && (
                        <Pressable
                          onPress={() => removeLine(item.extra_id!, item.name)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.name}`}
                          hitSlop={8}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                        >
                          <Svg width={15} height={15} viewBox="0 0 24 24">
                            <Path
                              d="M18 6 6 18M6 6l12 12"
                              stroke={colors.mutedForeground}
                              strokeWidth={2.4}
                              strokeLinecap="round"
                              fill="none"
                            />
                          </Svg>
                        </Pressable>
                      )}
                    </InsetRow>
                  </SwipeRow>
                ))
              )}
            </InsetGroup>
          )}
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

function Night({
  slot,
  first,
  onOpen,
  onCook,
  onClear,
}: {
  slot: MealPlanSlot;
  first: boolean;
  onOpen: () => void;
  onCook: () => void;
  onClear: () => void;
}) {
  const colors = useColors();
  const cooked = slot.cooked_at !== null;

  return (
    <InsetRow first={first}>
      <Text style={[t.footnoteBold, styles.weekday, { color: colors.mutedForeground }]}>
        {slot.weekday.slice(0, 3).toUpperCase()}
      </Text>

      {slot.recipe ? (
        <>
          <Text style={styles.emoji}>{foodEmoji(slot.recipe.title)}</Text>
          <Pressable onPress={onOpen} style={styles.flex} accessibilityRole="button">
            <Text
              numberOfLines={1}
              style={[
                t.bodySemibold,
                cooked ? styles.cooked : null,
                { color: cooked ? colors.mutedForeground : colors.foreground },
              ]}
            >
              {slot.recipe.title}
            </Text>
            <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
              {Math.round(slot.recipe.kcal)} kcal
              {slot.covers.length > 0 && ` · covers ${slot.covers.length + 1} nights`}
            </Text>
          </Pressable>

          {/* Cooked is history: the row stops offering the two verbs and simply
              records what happened. */}
          {!cooked && (
            <>
              <Pressable
                onPress={onCook}
                accessibilityRole="button"
                accessibilityLabel={`Cooked ${slot.recipe.title}`}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.cookButton,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: colors.border,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[t.footnoteBold, { color: colors.secondaryForeground }]}>Cooked</Text>
              </Pressable>
              <Pressable
                onPress={onClear}
                accessibilityRole="button"
                accessibilityLabel={`Clear ${slot.weekday}`}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <Svg width={15} height={15} viewBox="0 0 24 24">
                  <Path
                    d="M18 6 6 18M6 6l12 12"
                    stroke={colors.mutedForeground}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    fill="none"
                  />
                </Svg>
              </Pressable>
            </>
          )}
        </>
      ) : (
        <Text style={[t.body, styles.flex, { color: colors.mutedForeground }]}>Nothing planned</Text>
      )}
    </InsetRow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  page: { paddingHorizontal: 16, paddingBottom: 40, gap: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  form: { padding: 12, gap: 12 },
  wants: {
    height: 44,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  numbers: { flexDirection: 'row', gap: 12 },
  number: { flex: 1 },
  numberField: { width: '100%' },
  label: { marginBottom: 6 },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 999,
  },
  planLabel: { fontFamily: font.bold, fontSize: 15, lineHeight: 20 },
  weekday: { width: 36 },
  emoji: { fontSize: 20, lineHeight: 24 },
  cooked: { textDecorationLine: 'line-through' },
  cookButton: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 2,
  },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
  bought: { textDecorationLine: 'line-through' },
  empty: { paddingHorizontal: 16, paddingVertical: 16 },
  centred: { textAlign: 'center' },
});
