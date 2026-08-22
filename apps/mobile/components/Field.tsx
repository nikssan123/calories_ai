import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { font, type as t, useColors } from '@/theme';

/**
 * The shell every editable value on the profile screen wears.
 *
 * They were transparent and borderless once, which looked tidy on a mockup and
 * was unusable in practice: an empty height field rendered as the word "cm"
 * floating in white space with nothing to say it could be typed into. A field
 * has to look like a field. This is the quietest treatment that still does.
 */
export function fieldStyle(colors: ReturnType<typeof useColors>) {
  return {
    height: 40,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    paddingHorizontal: 14,
  };
}

/** A plain text value — a name, a timezone. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  style,
  align = 'right',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  align?: 'left' | 'right';
}) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      autoCapitalize="none"
      autoCorrect={false}
      style={[
        fieldStyle(colors),
        styles.input,
        { color: colors.foreground, textAlign: align },
        style,
      ]}
    />
  );
}

/**
 * A number and the unit it is in, inside one pill.
 *
 * The unit sits *inside* the field rather than beside it, so an empty value
 * still shows something shaped like an input instead of a stray "cm". Centred
 * rather than baseline-aligned: baseline packs flex items to the top of a
 * fixed-height pill and leaves the number sitting high in it.
 */
export function NumberField({
  value,
  onChange,
  unit,
  decimal = false,
  style,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  decimal?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View style={[fieldStyle(colors), styles.numberWrap, style]}>
      <TextInput
        value={value === null ? '' : String(value)}
        onChangeText={(next) => {
          const cleaned = next.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
          onChange(cleaned === '' ? null : Number(cleaned));
        }}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        style={[styles.numberInput, { color: colors.foreground, fontFamily: font.display }]}
      />
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{unit}</Text>
    </View>
  );
}

/**
 * A value chosen from a short list.
 *
 * The web opens a popover anchored to the trigger. That is a pointer idiom —
 * a menu the size of a fingertip, floating beside the control — so here it is a
 * sheet instead: full width, off the bottom, one row per option at a size a
 * thumb can hit. The trigger keeps the same pill shape as every other field so
 * the rows still read as one column.
 */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  placeholder = '—',
  label,
  render,
}: {
  value: T | null;
  options: readonly T[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Names the sheet, since the trigger's own text is the current value. */
  label: string;
  /** Long form in the sheet, short form on the trigger. */
  render: (value: T, place: 'trigger' | 'sheet') => string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          fieldStyle(colors),
          styles.trigger,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[t.bodySemibold, { color: colors.foreground }]}>
          {value === null ? placeholder : render(value, 'trigger')}
        </Text>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Polyline
            points="6 9 12 15 18 9"
            stroke={colors.mutedForeground}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Pressable>

      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              onChange(option);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: option === value }}
            style={({ pressed }) => [
              styles.option,
              { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[t.body, styles.optionLabel, { color: colors.foreground }]}>
              {render(option, 'sheet')}
            </Text>
            {option === value && (
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path
                  d="M20 6 9 17l-5-5"
                  stroke={colors.caloriesText}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            )}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

/** The bottom sheet the picker and the date field both open into. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  /*
   * A `Modal` is its own root view and inherits nothing, including the safe
   * area — so the bottom of a sheet sits under the home indicator unless it is
   * told not to. `SafeAreaProvider` is above the modal in the React tree even
   * though it is not above it on screen, so the inset is still readable here.
   */
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping away closes it — the same affordance as tapping off a popover,
          and the only one a sheet with no visible chrome can offer. */}
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        <Text style={[t.eyebrow, styles.sheetTitle, { color: colors.mutedForeground }]}>
          {title}
        </Text>
        <ScrollView bounces={false}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  input: { fontFamily: font.semibold, fontSize: 16, paddingVertical: 0 },
  numberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    width: 128,
  },
  numberInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    textAlign: 'right',
    paddingVertical: 0,
  },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    maxHeight: '60%',
    borderTopWidth: 2,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetTitle: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionLabel: { flex: 1 },
});
