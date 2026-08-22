import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Chunk } from '@/components/Chunk';
import { type as t, useColors } from '@/theme';

/**
 * A titled section of rows on a card. Real outline, real ledge — six of them
 * stacked read as six objects, which is what they are.
 *
 * The title is set as an eyebrow: small, heavy, letterspaced caps. At this
 * weight the caps need the tracking or they clot.
 */
export function InsetGroup({
  title,
  trailing,
  footer,
  style,
  children,
}: {
  title?: string;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={style}>
      {(title || trailing) && (
        <View style={styles.header}>
          {title ? (
            <Text style={[t.eyebrow, styles.title, { color: colors.mutedForeground }]}>{title}</Text>
          ) : (
            <View style={styles.title} />
          )}
          {trailing}
        </View>
      )}

      <Chunk
        contentStyle={{
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.border,
          // `divide-y-2` on the web; here each row but the first draws its own
          // top border, so the card can clip them at the corners.
          overflow: 'hidden',
        }}
      >
        {children}
      </Chunk>

      {footer && (
        <Text style={[t.footnote, styles.footer, { color: colors.mutedForeground }]}>{footer}</Text>
      )}
    </View>
  );
}

/**
 * One row. `first` suppresses the divider, which is the RN spelling of
 * `divide-y-2`: there is no selector that means "every child but the first".
 */
export function InsetRow({
  first,
  style,
  children,
}: {
  first?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.row,
        first ? null : { borderTopWidth: 2, borderTopColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  title: { flexShrink: 1 },
  footer: { paddingHorizontal: 6, paddingTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
