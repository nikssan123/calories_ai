import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PantryItem } from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { FridgeScan } from '@/components/kitchen/FridgeScan';
import { api } from '@/lib/api';
import { font, type as t, useColors } from '@/theme';
import { removeAction, SwipeRow } from '@/components/SwipeRow';
import { Glyph } from '@/components/Glyph';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';

/**
 * What is in the kitchen.
 *
 * The job is to make the list easy to *correct*, not easy to maintain: nobody
 * keeps an inventory current, so everything here is built around a ten-second
 * pass before asking for ideas. Ages are shown out loud, a stale item is one tap
 * from confirmed or gone, and staples fold away because "do you still have
 * salt" is not a question worth anyone's screen space.
 *
 * In a sheet, and that is the important part. The kitchen is a *precondition*
 * for the question Cook exists to answer, not the answer — and its "add
 * ingredients" field and the ask box are the same pill two hundred points
 * apart, which reads as one feature implemented twice. They are not remotely
 * the same: this writes rows to a list that outlives the visit, and that one is
 * a phrase steering a single question. Being somewhere else is the clearest
 * possible statement that it is something else.
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
  onError: (message: string) => void;
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
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(item: PantryItem) {
    try {
      await api.updatePantryItem(item.id, { seen: true });
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  function remove(item: PantryItem) {
    setHidden((prev) => [...prev, item.id]);

    undoably(`Removed ${item.name}`, {
      commit: () => {
        void api
          .deletePantryItem(item.id)
          .then(onChanged)
          .catch((e: Error) => onError(e.message));
      },
      restore: () => setHidden((prev) => prev.filter((id) => id !== item.id)),
    });
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      {/*
        Squared off, labelled, and with a button that says the verb — shaped
        like the list editor it is rather than like the ask box it is not.
      */}
      <View style={[styles.add, { borderBottomColor: colors.border }]}>
        <Text style={[t.footnote, styles.addLabel, { color: colors.mutedForeground }]}>
          Add to the list
        </Text>
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void add()}
            returnKeyType="done"
            placeholder="chicken, rice, peppers"
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
          <PressableChunk
            depth={3}
            radius={12}
            onPress={() => void add()}
            disabled={!draft.trim() || busy}
            accessibilityRole="button"
            style={{ opacity: !draft.trim() || busy ? 0.4 : 1 }}
            contentStyle={[
              styles.addButton,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path
                d="M12 5v14M5 12h14"
                stroke={colors.secondaryForeground}
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
            <Text style={[t.bodyBold, { color: colors.secondaryForeground }]}>Add</Text>
          </PressableChunk>
        </View>
        <Text style={[t.footnote, styles.hint, { color: colors.mutedForeground }]}>
          A rough list is plenty — it only has to be close enough to cook from.
        </Text>
      </View>

      {/* Photographing a shelf is a way of *filling* this list, so the button
          for it belongs on the list — not only in the row of ways in on Cook,
          which is somewhere you are not when you are looking at the kitchen. */}
      <FridgeScan variant="button" onSaved={onChanged} onCook={onCook} onError={onError} />

      {fresh.length === 0 ? (
        <Text style={[t.body, styles.empty, { color: colors.mutedForeground }]}>
          Nothing here yet. Add a few things and I&rsquo;ll cook from them.
        </Text>
      ) : (
        fresh.map((item) => {
          const days = daysSince(item.last_seen_at);
          const stale = days >= STALE_DAYS;
          return (
            <SwipeRow
              key={item.id}
              actions={[removeAction(colors, item.name, () => remove(item))]}
            >
              <View style={[styles.item, { borderBottomColor: colors.border }]}>
                <View style={styles.itemBody}>
                  <Text numberOfLines={1} style={[t.body, { color: colors.foreground }]}>
                    {item.name}
                    {item.quantity_desc && (
                      <Text style={{ color: colors.mutedForeground }}> · {item.quantity_desc}</Text>
                    )}
                  </Text>
                  <Text
                    style={[t.footnote, { color: stale ? colors.fatText : colors.mutedForeground }]}
                  >
                    {describeAge(days)}
                  </Text>
                </View>

                {/* Only offered once an item is old enough to doubt. Before that
                    it is a button that changes nothing, which teaches people to
                    ignore it for the fortnight when it starts to matter. */}
                {stale && (
                  <Pressable
                    onPress={() => void confirm(item)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.still,
                      {
                        backgroundColor: colors.secondary,
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={[t.footnoteBold, { color: colors.secondaryForeground }]}>
                      Still have it
                    </Text>
                  </Pressable>
                )}

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
          );
        })
      )}

      {staples.length > 0 && (
        <View style={styles.staples}>
          <Pressable
            onPress={() => setShowStaples((v) => !v)}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={[t.footnote, { color: colors.mutedForeground }]}>
              {showStaples ? 'Hide' : `and ${staples.length} staples`}
            </Text>
          </Pressable>

          {showStaples && (
            <View style={styles.stapleTags}>
              {staples.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => remove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                  style={({ pressed }) => [
                    styles.stapleTag,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}

function describeAge(days: number): string {
  if (days === 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < STALE_DAYS) return `${days} days ago`;
  return `${days} days ago — still there?`;
}

const styles = StyleSheet.create({
  add: { padding: 12, borderBottomWidth: 2 },
  addLabel: { marginBottom: 6 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  hint: { marginTop: 6, lineHeight: 20 },
  empty: { paddingHorizontal: 16, paddingVertical: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  itemBody: { flex: 1, minWidth: 0 },
  still: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  staples: { paddingHorizontal: 16, paddingVertical: 12 },
  stapleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  stapleTag: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
});
