import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PantryItem } from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { FridgeScan } from '@/components/kitchen/FridgeScan';
import { api } from '@/lib/api';
import { type as t, useColors, type Palette } from '@/theme';
import { removeAction, SwipeRow } from '@/components/SwipeRow';
import { Glyph } from '@/components/Glyph';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';

/**
 * What is in the kitchen.
 *
 * The job is to make the list easy to *correct*, not easy to maintain: nobody
 * keeps an inventory current, so everything here is built around a ten-second
 * pass before asking for ideas. A stale item is one tap from confirmed or gone,
 * and staples fold away because "do you still have salt" is not a question
 * worth anyone's screen space.
 *
 * In a sheet, and that is the important part. The kitchen is a *precondition*
 * for the question Cook exists to answer, not the answer — and being somewhere
 * else is the clearest possible statement that it is something else.
 *
 * # Shaped like a kitchen, not like a ledger
 *
 * The version before this was a stack of full-width rows: label, field, hint, a
 * full-width camera button, then one bordered row per ingredient carrying a
 * name and a second line of prose underneath it. Twelve tins of things became
 * twenty-four lines of text and a sheet you had to scroll three times, and the
 * reaction it got — "a lot of text and just a list" — is the correct reading of
 * that shape. A ledger is for things you audit. This is a bag of shopping.
 *
 * So three changes, each removing something rather than decorating it:
 *
 *   1. **One compose row.** The field, the add and the camera sit on a single
 *      line. The label above the field said "Add to the list" over a field
 *      whose placeholder already read "chicken, rice, peppers", and the hint
 *      below it said the list only has to be roughly right. Two sentences of
 *      chrome around one 44pt input.
 *
 *   2. **Ingredients are chips.** A name is one or two words; giving each one a
 *      48pt row, a rule and a subtitle was spending a whole line on a word.
 *      Wrapped chips put a stocked kitchen inside one sheet-height and, more
 *      importantly, make it look like a quantity of *food* rather than a table
 *      of records.
 *
 *   3. **The age moved to where it does something.** "Added today" under every
 *      single item was the bulk of the text and none of the information: the
 *      age only matters once it is old enough to doubt. Anything past
 *      STALE_DAYS is lifted into its own group at the top, with the age spelled
 *      out and both answers beside it; everything fresher just shows its name.
 *      The list stops narrating and starts asking.
 *
 * Swipe-to-delete survives only on the group that still has rows, which is the
 * one trade here worth naming. A chip is too small a target to swipe and too
 * close to its neighbours to swipe *accurately*, so the chips carry a visible ×
 * instead — and either way removal goes through `useUndoableRemoval`, so the
 * cost of getting it wrong is one tap on a toast.
 */

/** Past this many days an item is old enough to be worth a second look. */
export const STALE_DAYS = 10;

export function Pantry({
  items,
  onChanged,
  onCook,
  onError,
}: {
  items: PantryItem[];
  onChanged: () => void;
  /**
   * Passed straight through to the scanner, so a scan started here can still
   * end in dinner rather than dead-ending at a list.
   */
  onCook: (names: string[]) => Promise<void>;
  /** The error, not its message — see `FridgeScan`, which this forwards to. */
  onError: (error: unknown) => void;
}) {
  const colors = useColors();
  const undoably = useUndoableRemoval();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showStaples, setShowStaples] = useState(false);

  /*
   * The list is a prop, so the row cannot be taken out of it here — but it can
   * be hidden, which is the same thing to look at and undoes without asking the
   * parent for anything. Once the delete goes through, `onChanged` refetches
   * without the item and the id left behind here is inert.
   */
  const [hidden, setHidden] = useState<string[]>([]);

  const shown = items.filter((i) => !hidden.includes(i.id));
  const staples = shown.filter((i) => i.is_staple);
  const fresh = shown.filter((i) => !i.is_staple);
  const stale = fresh.filter((i) => daysSince(i.last_seen_at) >= STALE_DAYS);
  const current = fresh.filter((i) => daysSince(i.last_seen_at) < STALE_DAYS);

  async function add() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      // Comma-separated in one go: typing "chicken, rice, peppers" is how people
      // actually empty a shopping bag, and three round trips would be three
      // chances to lose one.
      const names = name
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      await api.addPantryItems(names.map((n) => ({ name: n, source: 'typed' as const })));
      setDraft('');
      onChanged();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(item: PantryItem) {
    try {
      await api.updatePantryItem(item.id, { seen: true });
      onChanged();
    } catch (e) {
      onError(e);
    }
  }

  function remove(item: PantryItem) {
    setHidden((prev) => [...prev, item.id]);

    undoably(`Removed ${item.name}`, {
      commit: () => {
        void api
          .deletePantryItem(item.id)
          .then(onChanged)
          .catch(onError);
      },
      restore: () => setHidden((prev) => prev.filter((id) => id !== item.id)),
    });
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      {/*
        One line: what you type, the verb, and the camera. A pill rather than
        the squared box it was — the squaring existed to tell this field apart
        from the ask box on the screen behind it, and inside a sheet there is
        no longer a pair to tell apart.
      */}
      <View style={styles.compose}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => void add()}
          returnKeyType="done"
          placeholder="chicken, rice, peppers"
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel="Add to the list"
          style={[
            t.body,
            styles.composeInput,
            {
              backgroundColor: colors.mutedField,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
        />
        <PressableChunk
          depth={3}
          radius={999}
          onPress={() => void add()}
          disabled={!draft.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Add to the list"
          style={{ opacity: !draft.trim() || busy ? 0.4 : 1 }}
          contentStyle={[
            styles.composeButton,
            { backgroundColor: colors.secondary, borderColor: colors.border },
          ]}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              d="M12 5v14M5 12h14"
              stroke={colors.secondaryForeground}
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </PressableChunk>
        <FridgeScan variant="icon" onSaved={onChanged} onCook={onCook} onError={onError} />
      </View>

      {/*
        The only part of the list that is asking you something, in the only
        shape that can ask: a group of its own, at the top, with both answers
        beside each item.

        These used to be ordinary rows told apart by the colour of their
        subtitle, which is a distinction nobody makes while scanning — and the
        "Still have it" button came and went row by row, so the column of
        controls had holes in it. Lifted out, it is a short, finite job you can
        finish, and every chip below it is something you have already vouched
        for.
      */}
      {stale.length > 0 && (
        <View
          style={[
            styles.asking,
            { borderColor: colors.border, backgroundColor: colors.mutedWash },
          ]}
        >
          <Text style={[t.eyebrow, styles.askingHeading, { color: colors.fatText }]}>
            Still there? · {stale.length}
          </Text>
          {stale.map((item, i) => (
            <SwipeRow
              key={item.id}
              index={i}
              actions={[removeAction(colors, item.name, () => remove(item))]}
            >
              <View
                style={[
                  styles.row,
                  { backgroundColor: colors.card, borderTopColor: colors.border },
                ]}
              >
                <View style={styles.rowBody}>
                  <Text numberOfLines={1} style={[t.body, { color: colors.foreground }]}>
                    {item.name}
                    {item.quantity_desc && (
                      <Text style={{ color: colors.mutedForeground }}>
                        {' · '}
                        {item.quantity_desc}
                      </Text>
                    )}
                  </Text>
                </View>
                <Text style={[t.footnote, t.tnum, { color: colors.mutedForeground }]}>
                  {daysSince(item.last_seen_at)}d
                </Text>
                <Pressable
                  onPress={() => void confirm(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`I still have ${item.name}`}
                  style={({ pressed }) => [
                    styles.still,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: colors.border,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={[t.footnoteBold, { color: colors.secondaryForeground }]}>Yes</Text>
                </Pressable>
                <Pressable
                  onPress={() => remove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <Glyph icon="trash" color={colors.mutedForeground} />
                </Pressable>
              </View>
            </SwipeRow>
          ))}
        </View>
      )}

      {/* Everything you have vouched for, as a quantity rather than a table. */}
      {fresh.length === 0 ? (
        <Text style={[t.body, styles.empty, { color: colors.mutedForeground }]}>
          Nothing here yet. Type a few things above, or photograph your shelf.
        </Text>
      ) : (
        current.length > 0 && (
          <View style={styles.section}>
            <Text style={[t.eyebrow, styles.heading, { color: colors.mutedForeground }]}>
              In the kitchen · {current.length}
            </Text>
            <View style={styles.chips}>
              {current.map((item) => (
                <Chip
                  key={item.id}
                  item={item}
                  colors={colors}
                  onRemove={() => remove(item)}
                  fill={colors.secondary}
                />
              ))}
            </View>
          </View>
        )
      )}

      {/*
        Staples, still folded. They are the least interesting entries in the
        list — you own salt — and unfolded they doubled its length for no
        decision. The toggle is a heading now rather than a stray link at the
        bottom, so it reads as the third section of the sheet.
      */}
      {staples.length > 0 && (
        <View style={styles.section}>
          <Pressable
            onPress={() => setShowStaples((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showStaples }}
            hitSlop={6}
            style={({ pressed }) => [styles.staplesToggle, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>
              Staples · {staples.length}
            </Text>
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path
                d={showStaples ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}
                stroke={colors.mutedForeground}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Pressable>

          {showStaples && (
            <View style={[styles.chips, styles.staplesChips]}>
              {staples.map((item) => (
                <Chip
                  key={item.id}
                  item={item}
                  colors={colors}
                  onRemove={() => remove(item)}
                  fill={colors.muted}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

/**
 * One ingredient.
 *
 * The × is its own target inside the chip rather than the chip itself being
 * one. Staples used to work the other way — tap the word, it is gone — which is
 * survivable for six condiments you barely look at and not for the list the
 * recipe is written from. Giving the destructive half a visible target also
 * lets the chip stay inert, which is what stops a block of thirty reading as
 * thirty buttons.
 */
function Chip({
  item,
  colors,
  onRemove,
  fill,
}: {
  item: PantryItem;
  colors: Palette;
  onRemove: () => void;
  fill: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: fill, borderColor: colors.border }]}>
      <Text
        numberOfLines={1}
        style={[t.footnoteSemibold, styles.chipText, { color: colors.foreground }]}
      >
        {item.name}
        {item.quantity_desc && (
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            {' · '}
            {item.quantity_desc}
          </Text>
        )}
      </Text>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.name}`}
        hitSlop={8}
        style={({ pressed }) => [styles.chipX, { opacity: pressed ? 0.4 : 1 }]}
      >
        <Svg width={11} height={11} viewBox="0 0 24 24">
          <Path
            d="M6 6l12 12M18 6L6 18"
            stroke={colors.mutedForeground}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 16 },

  compose: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composeInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  composeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 999,
  },

  section: { gap: 8 },
  heading: { paddingHorizontal: 2 },

  /* The one group that is a question rather than an inventory, so it gets the
     one enclosure — a panel is how you say "these belong together and the rest
     do not" without repeating it on every row.

     Rows run full-bleed inside it and the panel clips them, which is what keeps
     swipe-to-delete looking deliberate: the red slides out under the rounded
     edge rather than a square corner appearing beside a rounded card. */
  asking: { borderWidth: 2, borderRadius: 20, overflow: 'hidden' },
  askingHeading: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: 2,
  },
  rowBody: { flex: 1, minWidth: 0 },
  still: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  staplesChips: { marginTop: 2 },
  staplesToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    borderWidth: 2,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
  },
  chipText: { flexShrink: 1 },
  chipX: { alignItems: 'center', justifyContent: 'center', width: 18, height: 18 },

  empty: { paddingVertical: 4 },
});
