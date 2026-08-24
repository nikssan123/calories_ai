import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { OPEN_JOURNAL, type WidgetPalette } from './theme';

/**
 * What every widget shows before the app has ever left a note.
 *
 * Not a ring at zero. "0 of 2,000" for somebody who has not opened the app is a
 * lie told confidently, and the honest version is also the more useful one: it
 * says what to do about it.
 */
export function Empty({ colors }: { colors: WidgetPalette }) {
  return (
    <FlexWidget
      {...OPEN_JOURNAL}
      accessibilityLabel="Open Day So Far"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 2,
        borderRadius: 28,
        padding: 14,
      }}
    >
      <TextWidget
        text="Day So Far"
        style={{ fontSize: 15, fontWeight: 'bold', color: colors.foreground }}
      />
      <TextWidget
        text="Tap to start today"
        style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}
      />
    </FlexWidget>
  );
}
