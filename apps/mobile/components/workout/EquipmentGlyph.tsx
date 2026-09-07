import { memo, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Equipment } from '@ct/shared';
import { equipmentLabel } from '@ct/shared';
import { font, useColors } from '@/theme';

/**
 * What you pick up, as six line drawings.
 *
 * The second axis of an exercise's identity, and the one the muscle map cannot
 * carry: a barbell curl, a cable curl and a preacher curl light exactly the same
 * arm, and telling them apart is most of what somebody is doing when they scroll
 * a list of curls looking for the one they did.
 *
 * Six glyphs rather than two hundred and twenty illustrations is the whole
 * argument. Between the muscles it works and the thing you hold, an exercise is
 * near enough identified, and neither costs an asset pipeline.
 *
 * Drawn on a 24-unit grid at a 1.9 stroke so they sit at the weight of the rest
 * of the app's iconography — the same as the ✕ and ＋ in the card.
 */

const PATHS: Record<Equipment, () => ReactElement> = {
  /* A long bar, plates out at the ends. */
  barbell: () => <Path d="M3 9v6M6.5 6v12M17.5 6v12M21 9v6M6.5 12h11" />,
  /* Short bar, bells close in — the same drawing at a different proportion,
     which is exactly how you tell them apart in a rack. */
  dumbbell: () => <Path d="M5 7.5v9M8 9.5v5M16 9.5v5M19 7.5v9M8 12h8" />,
  cable: () => (
    <>
      <Circle cx={12} cy={5} r={2.6} />
      <Path d="M12 7.6v6.9M8 14.5h8M10.5 17.5h3" />
    </>
  ),
  /* A pin-loaded stack beside its post. The stack is the distinguishing
     feature: a machine is the one where you choose the weight with a pin. */
  machine: () => (
    <>
      <Rect x={4} y={4.5} width={8} height={15} rx={1.6} />
      <Path d="M4 9h8M4 13.5h8M17 4.5v15" />
    </>
  ),
  bodyweight: () => (
    <>
      <Circle cx={12} cy={5} r={2.3} />
      <Path d="M12 7.3v6.4M12 13.7l-3.2 5.8M12 13.7l3.2 5.8M7 10.2h10" />
    </>
  ),
  kettlebell: () => (
    <Path d="M9.6 8.4a2.6 2.6 0 0 1 4.8 0M8.4 8.4c-2 1.6-3.2 4.2-3.2 6.7A4.4 4.4 0 0 0 9.6 19.5h4.8a4.4 4.4 0 0 0 4.4-4.4c0-2.5-1.2-5.1-3.2-6.7z" />
  ),
  /* A band, a wheel, a rope, a sled. One bucket rather than four glyphs
     nobody would learn — drawn as a band, which is the commonest of them. */
  other: () => (
    <>
      <Circle cx={12} cy={12} r={7} />
      <Path d="M12 5v14" />
    </>
  ),
};

export const EquipmentGlyph = memo(function EquipmentGlyph({
  kit,
  size = 14,
  color,
}: {
  kit: Equipment;
  size?: number;
  color: string;
}) {
  const Draw = PATHS[kit];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Draw />
    </Svg>
  );
});

/**
 * The glyph with its word beside it.
 *
 * Both, and not just the picture. Six icons is more than anybody learns from a
 * list, and the word costs a few points of a row that has room for it — the
 * icon is what makes the row scannable once you *have* learned them, which is
 * a different job from telling you what it means the first time.
 */
export const EquipmentTag = memo(function EquipmentTag({ kit }: { kit: Equipment }) {
  const colors = useColors();
  return (
    <View style={[styles.tag, { backgroundColor: colors.muted }]}>
      <EquipmentGlyph kit={kit} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{equipmentLabel(kit)}</Text>
    </View>
  );
});

/** The same shape for a row that has no kit to name — a generic muscle row. */
export const PlainTag = memo(function PlainTag({ children }: { children: string }) {
  const colors = useColors();
  return (
    <View style={[styles.tag, { backgroundColor: colors.muted }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{children}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: { fontFamily: font.bold, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.3 },
});
