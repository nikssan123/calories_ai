import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  type EnergyAdjustment,
  formatNumber,
  type FoodEntry,
  type FoodItemInput,
  type Meal,
  parseGrams,
} from '@ct/shared';
import { foodEmoji } from '@ct/shared/food-emoji';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useLocale, useT, type StringKey } from '@/lib/i18n';

/**
 * A meal as the form that could have collected it — whether or not it exists.
 *
 * The journal's card is a receipt, and until recently a receipt was final: the
 * only way to fix "that was a bigger portion" was to say it in the conversation
 * and spend a model call re-estimating a meal the user could already describe
 * exactly. This is the other door — the numbers themselves, typed.
 *
 * It now opens both ways. With an `entryId` it corrects; with null it creates,
 * which is the manual log path an offline phone needs — see OFFLINE.md §5.
 * Correcting a meal and entering one are the same act with a different starting
 * state, so they are the same form rather than two that must be kept in step.
 *
 * It edits *items*, not the meal's totals, because the totals are not stored:
 * they are summed from the items on the way out. A form that let somebody set
 * the calories directly would be writing a figure the next read would overwrite
 * with the sum of the parts it disagrees with.
 *
 * The entry is fetched rather than taken from the card. The card carries item
 * names and the meal's totals but not what each item is worth, and widening it
 * would put a full nutrition table in every turn to serve the rare correction.
 */

const MEALS: { key: Meal; label: StringKey }[] = [
  { key: 'breakfast', label: 'meal.breakfast' },
  { key: 'lunch', label: 'meal.lunch' },
  { key: 'dinner', label: 'meal.dinner' },
  { key: 'snack', label: 'meal.snackOne' },
];

/** Held as strings so a half-typed number is not rounded out from under them. */
interface DraftItem {
  name: string;
  /**
   * The grouping key the item came in with, carried through the form so a
   * correction does not cost the food its identity — the portion somebody fixes
   * here is exactly the observation `usualPortions` most wants to keep.
   *
   * Dropped the moment they rename the row: a key that says "rice" on something
   * they have retyped as "quinoa" is worse than no key at all.
   */
  canonical: string | null;
  /**
   * The weight the item already had, kept so that opening a meal and saving it
   * does not quietly throw the weight away.
   *
   * The quantity box holds prose, and most of what the model writes into it —
   * "~200g", "1 medium banana" — is not something `parseGrams` will read back.
   * Without this, every pass through this form would null `quantity_g`, and
   * `usualPortions` skips items that have none: correcting a meal would delete
   * the very observation the correction was worth making.
   *
   * Cleared when they edit the box, because at that point the old weight is a
   * claim about a portion they have just told us was different.
   */
  quantity_g: number | null;
  quantity: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

export function FoodEditor({
  entryId,
  initialMeal,
  initialDescription,
  onSaved,
  onCreate,
  onCancel,
}: {
  /** Null to compose a new meal rather than correct an existing one. */
  entryId: string | null;
  /** Which slot a new meal starts in. Ignored when correcting. */
  initialMeal?: Meal;
  /**
   * What to put in the name field. Ignored when correcting, where the entry
   * supplies it.
   *
   * This exists for the wall in the journal. Somebody who typed "chicken and
   * rice for lunch", was told their free messages are gone and is then handed
   * an empty form has been asked to type their dinner twice — which is the
   * moment a limit stops reading as a plan and starts reading as a punishment.
   * The sentence they already wrote is the one thing that must survive the
   * refusal.
   */
  initialDescription?: string;
  /** The corrected entry, so the card above can redraw without a reload. */
  onSaved?: (entry: FoodEntry) => void;
  /**
   * A new meal, handed over rather than sent.
   *
   * The form does not know whether there is a network and should not: its
   * caller decides whether this goes straight out or into the outbox, which is
   * what lets the same component serve the journal and an offline Today.
   */
  onCreate?: (draft: { description: string; meal: Meal; items: FoodItemInput[] }) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const creating = entryId === null;
  const [entry, setEntry] = useState<FoodEntry | null>(null);
  const [description, setDescription] = useState(creating ? (initialDescription ?? '') : '');
  const [meal, setMeal] = useState<Meal>(initialMeal ?? 'lunch');
  // One blank row to type into. An empty form with an "add item" link is a form
  // that asks to be started before it can be filled in.
  const [items, setItems] = useState<DraftItem[]>(creating ? [blank()] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entryId === null) return;
    let cancelled = false;
    api
      .foodEntry(entryId)
      .then((found) => {
        if (cancelled) return;
        setEntry(found);
        setDescription(found.description);
        setMeal(found.meal);
        setItems(found.items.map(toDraft));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  /*
   * What the log would not store as typed, from the last save.
   *
   * Not an error — the meal is saved — but it must be said. This form's
   * contract is that a figure somebody typed on purpose is not second-guessed,
   * and an arithmetic impossibility is the one thing that overrides it;
   * overriding it in silence would be the indefensible part.
   */
  const [adjusted, setAdjusted] = useState<EnergyAdjustment[]>([]);

  function patch(index: number, next: Partial<DraftItem>) {
    // Renaming a row makes it a different food, and the key it inherited was
    // about the old one.
    const renamed = next.name !== undefined ? { canonical: null } : {};
    // Same for the weight: once they retype the quantity, the grams that came
    // with the old text are about a portion they are in the middle of changing.
    const reweighed = next.quantity !== undefined ? { quantity_g: null } : {};
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...next, ...renamed, ...reweighed } : item)),
    );
  }

  async function save() {
    const payload = items.map(fromDraft).filter((item) => item.name.trim().length > 0);
    // The API refuses an empty meal, and rightly — a meal with nothing in it is
    // a deletion, which is a different button with a different confirmation.
    if (payload.length === 0) {
      setError(tr('editor.needsAnItem'));
      return;
    }

    const label = description.trim();
    if (creating && label.length === 0) {
      // The API refuses this too, but the sentence it answers with is about a
      // field rather than about a meal, and this form knows what it is asking.
      setError(tr('editor.needsAName'));
      return;
    }

    if (creating) {
      haptics.logged();
      onCreate?.({ description: label, meal, items: payload });
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateFoodEntry(entryId, {
        description: label || undefined,
        meal,
        items: payload,
      });
      haptics.logged();
      setAdjusted(updated.adjusted ?? []);
      // Held open when something was changed, so the sentence saying so is not
      // torn off the screen by the caller redrawing behind it.
      if ((updated.adjusted ?? []).length > 0) {
        setItems(updated.items.map(toDraft));
        return;
      }
      onSaved?.(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error !== null && entry === null) {
    return (
      <Chunk contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
        <Quiet label={tr('common.close')} onPress={onCancel} />
      </Chunk>
    );
  }

  if (entry === null && !creating) {
    return (
      <Chunk contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('common.loading')}</Text>
      </Chunk>
    );
  }

  // Shown live off the drafts, because the figure people are correcting *to* is
  // usually the total — they adjust an item and watch this land on the number
  // they remember from the packet.
  const total = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);
  // The receipt's own bar, redrawn off the drafts. The card this replaces shows
  // the meal as a macro split, so the form that corrects it shows the same
  // split, moving — which is also the only thing here that reports on four
  // typed numbers at once. Split by energy, not by grams, for the reason
  // written on the card: a gram of fat is not a gram of carbohydrate.
  const energy = [
    { key: 'p', kcal: grams(items, 'protein') * 4, fill: colors.protein },
    { key: 'c', kcal: grams(items, 'carbs') * 4, fill: colors.carbs },
    { key: 'f', kcal: grams(items, 'fat') * 9, fill: colors.fat },
  ];
  const split = energy.reduce((a, band) => a + band.kcal, 0);

  return (
    <Chunk contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* What this card is, kept to the weight of a caption — the meal's name is
          the title here, and a bold heading above it said the same thing twice.
          The total sits where the receipt puts it, and counts while you type. */}
      <View style={styles.head}>
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
          {creating ? tr('editor.logItYourself') : tr('editor.fixWhatsWrong')}
        </Text>
        <Text style={[t.figure, styles.figure, { color: colors.foreground }]}>
          {formatNumber(Math.round(total), locale)}
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}> kcal</Text>
        </Text>
      </View>

      {/* The receipt's head, made editable: the same picture, the same line of
          bold text. Ruled underneath rather than boxed, so the title reads as
          the card's name and the boxes below it are the data being corrected. */}
      <View style={[styles.title, { borderBottomColor: colors.border }]}>
        <Text style={styles.emoji}>{foodEmoji(description, meal)}</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          accessibilityLabel={tr('editor.whatThisWas')}
          placeholder={tr('editor.whatWasIt')}
          placeholderTextColor={colors.mutedForeground}
          style={[t.bodyBold, styles.titleInput, { color: colors.foreground }]}
        />
      </View>

      {split > 0 && (
        <View style={[styles.split, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {energy.map((band) => (
            <View
              key={band.key}
              style={{ width: `${(band.kcal / split) * 100}%`, backgroundColor: band.fill }}
            />
          ))}
        </View>
      )}

      <View style={styles.meals}>
        {MEALS.map(({ key, label }) => {
          const on = meal === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                haptics.press();
                setMeal(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.meal,
                {
                  backgroundColor: on ? colors.primary : colors.muted,
                  borderColor: on ? 'transparent' : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[
                  t.footnoteSemibold,
                  { color: on ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {tr(label)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {items.map((item, i) => (
        <View key={i} style={[styles.item, { borderTopColor: colors.border }]}>
          {/* Name and portion on one line, the way the receipt writes them:
              "chicken 180g". They were two full-width boxes stacked, which made
              a two-item meal eight boxes tall before a number was typed. */}
          <View style={styles.itemHead}>
            <TextInput
              value={item.name}
              onChangeText={(name) => patch(i, { name })}
              accessibilityLabel={`Item ${i + 1} name`}
              placeholder={tr('editor.itemPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              style={[
                t.bodySemibold,
                styles.name,
                styles.field,
                { backgroundColor: colors.mutedField, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            {/* The words, kept as words. "1 medium banana" is the assumption the
                estimate was built on, and it is the thing a reader checks first. */}
            <TextInput
              value={item.quantity}
              onChangeText={(quantity) => patch(i, { quantity })}
              accessibilityLabel={`Item ${i + 1} quantity`}
              placeholder={tr('editor.howMuch')}
              placeholderTextColor={colors.mutedForeground}
              style={[
                t.body,
                styles.quantity,
                styles.field,
                { backgroundColor: colors.mutedField, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <Pressable
              onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name || `item ${i + 1}`}`}
              hitSlop={8}
            >
              <Svg width={13} height={13} viewBox="0 0 24 24">
                <Path
                  d="M6 6l12 12M18 6L6 18"
                  stroke={colors.mutedForeground}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          </View>

          {/* The macros wear the card's colours, so the row of cells reads as
              the row of figures it will be saved back into. */}
          <View style={styles.numbers}>
            <Cell value={item.kcal} onChange={(kcal) => patch(i, { kcal })} label={`Item ${i + 1} calories`} unit="kcal" />
            <Cell value={item.protein} onChange={(protein) => patch(i, { protein })} label={`Item ${i + 1} protein`} unit={tr('macro.proteinInitial')} tint={colors.proteinText} />
            <Cell value={item.carbs} onChange={(carbs) => patch(i, { carbs })} label={`Item ${i + 1} carbs`} unit={tr('macro.carbsInitial')} tint={colors.carbsText} />
            <Cell value={item.fat} onChange={(fat) => patch(i, { fat })} label={`Item ${i + 1} fat`} unit={tr('macro.fatInitial')} tint={colors.fatText} />
          </View>
        </View>
      ))}

      <Quiet
        label={tr('editor.anotherItemLabel')}
        plus
        onPress={() => {
          haptics.press();
          setItems((prev) => [...prev, blank()]);
        }}
      />

      {error !== null && (
        <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
      )}

      {adjusted.length > 0 && (
        <View>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
            {tr('editor.adjustedHeading')}
          </Text>
          {adjusted.map((item, i) => (
            <Text key={`${item.name}-${i}`} style={[t.footnote, { color: colors.mutedForeground }]}>
              {adjustmentLine(item, tr)}
            </Text>
          ))}
        </View>
      )}

      <View style={[styles.foot, { borderTopColor: colors.border }]}>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('common.cancel')}</Text>
        </Pressable>
        <PressableChunk
          depth={3}
          radius={999}
          color={colors.caloriesDeep}
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          style={{ opacity: saving ? 0.4 : 1 }}
          contentStyle={[styles.save, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
            {saving ? tr('setup.saving') : creating ? tr('editor.log') : tr('common.save')}
          </Text>
        </PressableChunk>
      </View>
    </Chunk>
  );
}

/** One macro across the drafts, in grams. Half-typed cells count as nothing. */
function grams(items: DraftItem[], key: 'protein' | 'carbs' | 'fat'): number {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function Quiet({ label, onPress, plus }: { label: string; onPress: () => void; plus?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.6 : 1 }]}
    >
      {plus && (
        <Svg width={13} height={13} viewBox="0 0 24 24">
          <Path
            d="M12 5v14M5 12h14"
            stroke={colors.mutedForeground}
            strokeWidth={2.6}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      )}
      <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

function Cell({
  value,
  onChange,
  label,
  unit,
  tint,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  unit: string;
  /** The macro's text cut, so P, C and F read as the card's own colours. */
  tint?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.cell,
        { backgroundColor: colors.mutedField, borderColor: colors.border },
      ]}
    >
      <TextInput
        value={value}
        // A half-typed "12." has to survive until they finish.
        onChangeText={(next) => onChange(next.replace(/[^0-9.]/g, ''))}
        accessibilityLabel={label}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
        style={[t.footnote, styles.cellInput, { color: colors.foreground }]}
      />
      <Text style={[t.footnoteBold, { color: tint ?? colors.mutedForeground }]}>{unit}</Text>
    </View>
  );
}

/**
 * One line about a figure the log declined to store, in their language.
 *
 * The reasons are ordered as they were applied, and the first is the one worth
 * saying: a mass correction that then dragged the calories to a new floor is
 * one thing that happened to the item, not two.
 */
function adjustmentLine(
  item: EnergyAdjustment,
  tr: (key: 'editor.adjustedMass' | 'editor.adjustedCeiling' | 'editor.adjustedFloor') => (name: string) => string,
): string {
  const reason = item.reasons[0] ?? 'floor';
  const key =
    reason === 'mass'
      ? 'editor.adjustedMass'
      : reason === 'ceiling'
        ? 'editor.adjustedCeiling'
        : 'editor.adjustedFloor';
  return tr(key)(item.name);
}

const blank = (): DraftItem => ({
  name: '',
  // A row somebody is about to type into is not yet any food in particular.
  canonical: null,
  quantity_g: null,
  quantity: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
});

function toDraft(item: FoodEntry['items'][number]): DraftItem {
  return {
    name: item.name,
    canonical: item.canonical,
    quantity_g: item.quantity_g,
    // The words if there are any, the weight if not — the same fallback the
    // card draws, so reopening a meal shows what reading it showed.
    quantity: item.quantity_desc ?? (item.quantity_g === null ? '' : `${Math.round(item.quantity_g)}g`),
    kcal: String(Math.round(item.kcal)),
    protein: String(Math.round(item.protein_g)),
    carbs: String(Math.round(item.carbs_g)),
    fat: String(Math.round(item.fat_g)),
  };
}

/**
 * A draft, back in the shape the API takes.
 *
 * The diet-quality fields are deliberately not carried: they are per-item
 * estimates nobody is being asked for here, and sending stale ones would claim
 * a corrected item still has the fibre the original was guessed to have. Null
 * is "nobody estimated this", which is the honest answer after a hand edit.
 */
function fromDraft(draft: DraftItem) {
  const quantity = draft.quantity.trim();
  return {
    name: draft.name.trim(),
    canonical: draft.canonical,
    // A weight when they typed one; otherwise the one the item already had,
    // which `patch` has already cleared if they touched the box at all.
    quantity_g: parseGrams(quantity) ?? draft.quantity_g,
    quantity_desc: quantity.length > 0 ? quantity : null,
    kcal: Number(draft.kcal) || 0,
    protein_g: Number(draft.protein) || 0,
    carbs_g: Number(draft.carbs) || 0,
    fat_g: Number(draft.fat) || 0,
    fiber_g: null,
    sodium_mg: null,
    sat_fat_g: null,
    sugar_g: null,
  };
}

const styles = StyleSheet.create({
  // The shell of the card this replaces, to the pixel: tapping Edit should
  // open a receipt, not swap it for a differently shaped box.
  card: { borderWidth: 2, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  figure: { fontSize: 16, lineHeight: 24 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 2, paddingBottom: 6 },
  titleInput: { flex: 1, padding: 0 },
  emoji: { fontSize: 22, lineHeight: 28 },
  split: { flexDirection: 'row', gap: 1, height: 10, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  field: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  meals: { flexDirection: 'row', gap: 6 },
  meal: { flex: 1, borderWidth: 2, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  item: { borderTopWidth: 2, paddingTop: 10, gap: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The portion is short — "180g", "1 cup" — and the name is not, so the row
  // is split rather than halved.
  name: { flex: 1.6 },
  quantity: { flex: 1 },
  numbers: { flexDirection: 'row', gap: 6 },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cellInput: { flex: 1, padding: 0, minWidth: 20 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    paddingTop: 10,
  },
  save: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
});
