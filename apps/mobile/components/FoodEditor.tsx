import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { FoodEntry, FoodItemInput, Meal } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';

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

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

/** Held as strings so a half-typed number is not rounded out from under them. */
interface DraftItem {
  name: string;
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

  function patch(index: number, next: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...next } : item)));
  }

  async function save() {
    const payload = items.map(fromDraft).filter((item) => item.name.trim().length > 0);
    // The API refuses an empty meal, and rightly — a meal with nothing in it is
    // a deletion, which is a different button with a different confirmation.
    if (payload.length === 0) {
      setError('A meal needs at least one item. Delete it instead?');
      return;
    }

    const label = description.trim();
    if (creating && label.length === 0) {
      // The API refuses this too, but the sentence it answers with is about a
      // field rather than about a meal, and this form knows what it is asking.
      setError('What was it? A meal needs a name.');
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
        <Quiet label="Close" onPress={onCancel} />
      </Chunk>
    );
  }

  if (entry === null && !creating) {
    return (
      <Chunk contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>Loading…</Text>
      </Chunk>
    );
  }

  // Shown live off the drafts, because the figure people are correcting *to* is
  // usually the total — they adjust an item and watch this land on the number
  // they remember from the packet.
  const total = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);

  return (
    <Chunk contentStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[t.bodyBold, { color: colors.foreground }]}>
        {creating ? 'Log it yourself' : 'Fix what’s wrong'}
      </Text>

      <TextInput
        value={description}
        onChangeText={setDescription}
        accessibilityLabel="What this was"
        placeholder="What was it?"
        placeholderTextColor={colors.mutedForeground}
        style={[
          t.bodySemibold,
          styles.field,
          { backgroundColor: colors.mutedField, borderColor: colors.border, color: colors.foreground },
        ]}
      />

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
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {items.map((item, i) => (
        <View key={i} style={[styles.item, { borderTopColor: colors.border }]}>
          <View style={styles.itemHead}>
            <TextInput
              value={item.name}
              onChangeText={(name) => patch(i, { name })}
              accessibilityLabel={`Item ${i + 1} name`}
              placeholder="Item"
              placeholderTextColor={colors.mutedForeground}
              style={[
                t.bodySemibold,
                styles.flex,
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

          {/* The words, kept as words. "1 medium banana" is the assumption the
              estimate was built on, and it is the thing a reader checks first. */}
          <Cell
            value={item.quantity}
            onChange={(quantity) => patch(i, { quantity })}
            label={`Item ${i + 1} quantity`}
            unit=""
            placeholder="how much"
            wide
          />

          <View style={styles.numbers}>
            <Cell value={item.kcal} onChange={(kcal) => patch(i, { kcal })} label={`Item ${i + 1} calories`} unit="kcal" />
            <Cell value={item.protein} onChange={(protein) => patch(i, { protein })} label={`Item ${i + 1} protein`} unit="P" />
            <Cell value={item.carbs} onChange={(carbs) => patch(i, { carbs })} label={`Item ${i + 1} carbs`} unit="C" />
            <Cell value={item.fat} onChange={(fat) => patch(i, { fat })} label={`Item ${i + 1} fat`} unit="F" />
          </View>
        </View>
      ))}

      <Quiet
        label="another item"
        plus
        onPress={() => {
          haptics.press();
          setItems((prev) => [...prev, blank()]);
        }}
      />

      {error !== null && (
        <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
      )}

      <View style={[styles.foot, { borderTopColor: colors.border }]}>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
          <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>Cancel</Text>
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
            {saving ? 'Saving…' : `${creating ? 'Log' : 'Save'} · ${Math.round(total).toLocaleString()} kcal`}
          </Text>
        </PressableChunk>
      </View>
    </Chunk>
  );
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
  placeholder,
  wide,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  unit: string;
  placeholder?: string;
  wide?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.cell,
        wide ? styles.cellWide : styles.flex,
        { backgroundColor: colors.mutedField, borderColor: colors.border },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={(next) =>
          // The quantity is prose; everything else is a number being typed, and
          // a half-typed "12." has to survive until they finish.
          onChange(unit === '' ? next : next.replace(/[^0-9.]/g, ''))
        }
        accessibilityLabel={label}
        placeholder={placeholder ?? '—'}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={unit === '' ? 'default' : 'decimal-pad'}
        style={[styles.cellInput, { color: colors.foreground }]}
      />
      {unit !== '' && (
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{unit}</Text>
      )}
    </View>
  );
}

const blank = (): DraftItem => ({
  name: '',
  quantity: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
});

function toDraft(item: FoodEntry['items'][number]): DraftItem {
  return {
    name: item.name,
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
    quantity_g: null,
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
  card: { borderWidth: 2, borderRadius: 18, padding: 14, gap: 10 },
  flex: { flex: 1 },
  field: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  meals: { flexDirection: 'row', gap: 6 },
  meal: { flex: 1, borderWidth: 2, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  item: { borderTopWidth: 2, paddingTop: 10, gap: 8 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numbers: { flexDirection: 'row', gap: 6 },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cellWide: { alignSelf: 'stretch' },
  cellInput: { flex: 1, padding: 0, minWidth: 24 },
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
