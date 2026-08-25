import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PantryFind, PantryScanProposal } from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { Sheet } from '@/components/Field';
import { api } from '@/lib/api';
import { pickPhoto, takePhoto, uploadPhotoFile } from '@/lib/image';
import { useT } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';

/**
 * A photograph of a shelf, and the two things it can turn into.
 *
 * The fork is at the *end* rather than the start. Photographing a fridge can
 * end in a stocked list or in dinner, and the web learned the hard way that
 * asking which before the photo is taken means two cameras on one screen and a
 * choice nobody can make yet — you do not know whether there is anything worth
 * cooking until the model has looked. So one camera, then a list to correct,
 * then two buttons.
 *
 * Nothing is written until it is confirmed. The model is reading a blurry
 * photograph of a crowded shelf; it will invent a lemon occasionally, and a
 * pantry that silently gains one is worse than one that asks.
 */
export function FridgeScan({
  onSaved,
  onCook,
  canCook = true,
  onError,
  variant = 'chip',
}: {
  /** Called once the accepted finds are in the pantry. */
  onSaved: () => void;
  /** Hands the accepted names to the recipe run. */
  onCook: (names: string[]) => Promise<void>;
  /** False when there is no recipe budget left to cook with. */
  canCook?: boolean;
  /**
   * Something went wrong. The error itself rather than its message, because a
   * 402 is a price rather than a fault and the caller is the one that knows
   * what to do about it — see `refused` on the Cook screen. Anything else is
   * still just a sentence.
   */
  onError: (error: unknown) => void;
  /**
   * Where it is being drawn. A chip in Cook's quiet row of ways in; a
   * full-width button where photographing a shelf is the whole offer; a bare
   * camera square inside the kitchen sheet, where it stands beside the add
   * field as the second of two ways to fill the list.
   *
   * The icon keeps its label in `accessibilityLabel` only. That is affordable
   * for exactly one glyph — a camera is understood without a word — and it is
   * what lets the field, the plus and the camera share one line instead of
   * stacking into three blocks.
   *
   * All three open the same thing, and that is a repeat rather than the
   * duplicate it looks like — no two are ever on screen together, because the
   * kitchen is shut until you ask for it.
   */
  variant?: 'chip' | 'button' | 'icon';
}) {
  const colors = useColors();
  const tr = useT();
  const [choosing, setChoosing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [proposal, setProposal] = useState<PantryScanProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<null | 'stock' | 'cook'>(null);

  async function scan(source: 'camera' | 'library') {
    setChoosing(false);
    const prepared = source === 'camera' ? await takePhoto() : await pickPhoto();
    if (!prepared) return;

    setScanning(true);
    try {
      // Phone-to-bucket where there is one; the data URL is the fallback for a
      // local-disk deployment and for a bucket that refused the write.
      let key: string | null = null;
      try {
        const ticket = await api.photoUploadTicket(prepared.mediaType);
        if (ticket.url && ticket.key) {
          const ok = await uploadPhotoFile(prepared.uri, prepared.mediaType, ticket.url);
          if (ok) key = ticket.key;
        }
      } catch {
        key = null;
      }

      const found = await api.scanFridge(
        key ? { key } : { base64: prepared.dataUrl },
        prepared.mediaType,
      );
      // Low-confidence finds start unticked rather than absent: the model saw
      // something, and hiding its guess is worse than showing it unchosen.
      setChosen(new Set(found.found.filter((f) => f.confidence !== 'low').map((f) => f.name)));
      if (found.found.length === 0) {
        onError(new Error(found.note ?? "I couldn't make out any food in that photo."));
      } else {
        setProposal(found);
      }
    } catch (e) {
      onError(e);
    } finally {
      setScanning(false);
    }
  }

  async function commit(then: 'stock' | 'cook') {
    if (!proposal) return;
    const items = proposal.found.filter((f) => chosen.has(f.name));
    if (items.length === 0) {
      setProposal(null);
      return;
    }

    setSaving(then);
    try {
      await api.addPantryItems(
        items.map((f) => ({
          name: f.name,
          quantity_desc: f.quantity_desc,
          source: 'photo' as const,
        })),
      );
      setProposal(null);
      onSaved();
      if (then === 'cook') await onCook(items.map((f) => f.name));
    } catch (e) {
      onError(e);
    } finally {
      setSaving(null);
    }
  }

  function toggle(find: PantryFind) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(find.name)) next.delete(find.name);
      else next.add(find.name);
      return next;
    });
  }

  const busy = saving !== null;

  return (
    <>
      <Pressable
        onPress={() => setChoosing(true)}
        disabled={scanning}
        accessibilityRole="button"
        accessibilityLabel={variant === 'icon' ? tr('scan.photographShelf') : undefined}
        style={({ pressed }) => [
          variant === 'chip' ? styles.chip : variant === 'icon' ? styles.square : styles.wide,
          {
            backgroundColor: variant === 'icon' ? colors.secondary : colors.card,
            borderColor: colors.border,
            opacity: scanning || pressed ? 0.6 : 1,
          },
        ]}
      >
        {scanning ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <Svg
            width={variant === 'chip' ? 13 : 17}
            height={variant === 'chip' ? 13 : 17}
            viewBox="0 0 24 24"
          >
            <Path
              d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
              stroke={variant === 'icon' ? colors.secondaryForeground : colors.mutedForeground}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        )}
        {variant !== 'icon' && (
          <Text
            style={[
              variant === 'chip' ? t.footnote : t.bodySemibold,
              { color: variant === 'chip' ? colors.mutedForeground : colors.foreground },
            ]}
          >
            {scanning
              ? tr('scan.looking')
              : variant === 'chip'
                ? tr('scan.scanYourFridge')
                : tr('scan.photographShelf')}
          </Text>
        )}
      </Pressable>

      <Sheet open={choosing} title={tr('scan.photographShelf')} onClose={() => setChoosing(false)}>
        <Choice label={tr('composer.takePhoto')} onPress={() => void scan('camera')} />
        <Choice label={tr('composer.choosePhoto')} onPress={() => void scan('library')} />
      </Sheet>

      <Sheet
        open={proposal !== null}
        title={tr('scan.isThisIt')}
        onClose={() => !busy && setProposal(null)}
      >
        {proposal && (
          <>
            {proposal.note && (
              <Text style={[t.footnote, styles.note, { color: colors.mutedForeground }]}>
                {proposal.note}
              </Text>
            )}

            <ScrollView style={styles.finds}>
              {proposal.found.map((find) => {
                const on = chosen.has(find.name);
                return (
                  <Pressable
                    key={find.name}
                    onPress={() => toggle(find)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [
                      styles.find,
                      { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <View
                      style={[
                        styles.box,
                        {
                          backgroundColor: on ? colors.primary : 'transparent',
                          borderColor: on ? colors.caloriesDeep : colors.border,
                        },
                      ]}
                    >
                      {on && (
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
                    </View>

                    <View style={styles.findBody}>
                      <Text style={[t.body, { color: colors.foreground }]}>{find.name}</Text>
                      {(find.quantity_desc || find.confidence === 'low') && (
                        <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                          {[find.quantity_desc, find.confidence === 'low' ? tr('scan.notSure') : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.foot, { borderTopColor: colors.border }]}>
              <PressableChunk
                radius={999}
                onPress={() => void commit('stock')}
                disabled={busy}
                accessibilityRole="button"
                style={styles.flex}
                contentStyle={[
                  styles.button,
                  { backgroundColor: colors.secondary, borderWidth: 2, borderColor: colors.border },
                ]}
              >
                <Text style={[t.bodyBold, { color: colors.secondaryForeground }]}>
                  {saving === 'stock' ? tr('scan.adding') : tr('scan.addToKitchenShort')}
                </Text>
              </PressableChunk>

              {canCook && (
                <PressableChunk
                  radius={999}
                  color={colors.caloriesDeep}
                  onPress={() => void commit('cook')}
                  disabled={busy}
                  accessibilityRole="button"
                  style={styles.flex}
                  contentStyle={[styles.button, { backgroundColor: colors.primary }]}
                >
                  <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
                    {saving === 'cook' ? tr('scan.cooking') : tr('scan.cookFromThese')}
                  </Text>
                </PressableChunk>
              )}
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.choice,
        { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[t.body, { fontFamily: font.semibold, color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Matches Cook's other ways in — see the note on `way` there.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  note: { paddingHorizontal: 20, paddingBottom: 10, lineHeight: 20 },
  finds: { maxHeight: 320 },
  find: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findBody: { flex: 1 },
  foot: { flexDirection: 'row', gap: 8, borderTopWidth: 2, padding: 12 },
  button: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  choice: { borderTopWidth: 2, paddingHorizontal: 20, paddingVertical: 16 },
  // Inside the kitchen sheet: a row on the list rather than a chip beside it.
  wide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  /* Square rather than round, and the same 44 as the field it stands beside —
     a target smaller than that is one a thumb has to aim at. */
  square: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderWidth: 2,
    borderRadius: 999,
  },
});
