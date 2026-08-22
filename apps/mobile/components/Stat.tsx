import { StyleSheet, Text, View } from 'react-native';
import { font, type as t, useColors } from '@/theme';

/**
 * A row of figures under a card, divided rather than boxed.
 *
 * Three across is the shape everywhere it appears — a month's totals, a
 * fortnight of weigh-ins — and the divider is the card's own border weight, so
 * the row reads as part of the card rather than as a table dropped into it.
 */
export function Stats({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Stat({
  label,
  value,
  unit,
  first,
}: {
  label: string;
  value: string;
  unit: string;
  /** Suppresses the divider. The RN spelling of `divide-x-2`, which has no
      selector meaning "every child but the first". */
  first?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.stat,
        first ? null : { borderLeftWidth: 2, borderLeftColor: colors.border },
      ]}
    >
      <Text style={[t.footnoteSemibold, styles.centred, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[t.figure, styles.value, { color: colors.foreground }]}>
        {value}
        {/* An em dash has no unit — "— kg" reads as a measurement that failed
            rather than as one nobody has taken. Nor does a value whose unit is
            already in it, like a duration. */}
        {value !== '—' && unit !== '' && (
          <Text style={[styles.unit, { color: colors.mutedForeground }]}> {unit}</Text>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  stat: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center' },
  centred: { textAlign: 'center' },
  value: { marginTop: 2 },
  unit: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
});
