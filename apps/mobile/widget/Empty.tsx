import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import { ringLayout } from './layout';
import { DISPLAY, OPEN_JOURNAL, type WidgetPalette } from './theme';
import type { WidgetText } from './text';

/**
 * What every widget shows before the app has ever left a note.
 *
 * Not a ring at zero. "0 of 2,000" for somebody who has not opened the app is a
 * lie told confidently, and the honest version is also the more useful one: it
 * says what to do about it.
 *
 * Which is a sentence when there is room for a sentence. At one cell there is
 * not — "Tap to start today" at a legible size is wider than the whole widget —
 * so the empty state there is the dial with its track and nothing run round it,
 * and a plus where the number will go. An empty ring is the same statement
 * without the words, and the plus is what the tap does.
 */
export function Empty({
  colors,
  width,
  height,
  text,
}: {
  colors: WidgetPalette;
  width: number;
  height: number;
  text: WidgetText;
}) {
  const shell = {
    ...OPEN_JOURNAL,
    accessibilityLabel: 'Open Day So Far',
    style: {
      height: 'match_parent' as const,
      width: 'match_parent' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 2,
    },
  };

  const wide = width >= height * 2.2;
  if (!wide && Math.min(width, height) < 118) {
    const { padding, radius, box, stroke } = ringLayout({ width, height, remaining: 0, text });
    return (
      <FlexWidget {...shell} style={{ ...shell.style, borderRadius: radius, padding }}>
        <OverlapWidget style={{ height: box, width: box }}>
          <SvgWidget
            svg={ringSvg({
              consumed: 0,
              target: 0,
              size: box,
              strokeWidth: stroke,
              track: colors.muted,
              fill: colors.calories,
              ramp: colors.ramp,
              ledge: colors.ledge,
              ledgeOpacity: colors.ledgeOpacity,
              over: colors.foreground,
            })}
            style={{ height: box, width: box }}
          />
          <FlexWidget
            style={{ height: box, width: box, justifyContent: 'center', alignItems: 'center' }}
          >
            <TextWidget
              text="+"
              allowFontScaling={false}
              style={{
                fontSize: Math.round(box * 0.38),
                fontFamily: DISPLAY,
                color: colors.mutedForeground,
              }}
            />
          </FlexWidget>
        </OverlapWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget {...shell} style={{ ...shell.style, borderRadius: 28, padding: 14 }}>
      <TextWidget
        text="Day So Far"
        allowFontScaling={false}
        maxLines={1}
        style={{ fontSize: 15, fontWeight: 'bold', color: colors.foreground }}
      />
      <TextWidget
        text={text.tapToStart}
        allowFontScaling={false}
        maxLines={1}
        style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}
      />
    </FlexWidget>
  );
}
