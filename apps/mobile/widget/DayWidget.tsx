import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { ringSvg } from './ring';
import type { DaySnapshot } from '@/lib/snapshot';

/**
 * The ring, on the home screen.
 *
 * The ring is the app's face and it was three taps away. This is the whole
 * argument for the widget: the number somebody checks most is the one they
 * should not have to open anything to see.
 *
 * It shows what is *left*, not what is eaten, for the same reason the ring
 * inside the app does — "767 to go" is a decision you can act on and "1,333
 * eaten" is a fact you then have to do arithmetic on.
 *
 * The palette is written out rather than imported from `theme/colors`. A widget
 * is drawn by the launcher, in a process with no React context and no theme
 * provider, and reaching for `useColors()` here would be reaching for something
 * that does not exist. The values are the light palette's, and the two must be
 * kept in step by hand — which is the price of drawing outside the app.
 */

const PALETTE = {
  background: '#fff6ec',
  card: '#ffffff',
  foreground: '#31261e',
  mutedForeground: '#77685b',
  calories: '#12b76a',
  muted: '#f3e8d9',
  border: '#eadcc9',
  // `as const`, because the library types a colour as a hex *literal* rather
  // than a string — which catches a typo'd swatch at build time instead of
  // painting a transparent widget nobody can see to report.
} as const;

/**
 * Tapping it opens the journal, which is the only thing anybody wants from a
 * ring they just looked at: the number prompted a thought about food, and the
 * journal is where a thought about food goes.
 *
 * `OPEN_URI` against the app's own scheme rather than `OPEN_APP`, so the tap
 * lands somewhere chosen instead of wherever the app happened to be left.
 */
const OPEN_JOURNAL = { clickAction: 'OPEN_URI', clickActionData: { uri: 'daysofar:///' } } as const;

export function DayWidget({ snapshot }: { snapshot: DaySnapshot | null }) {
  /*
   * Nothing to show is its own state, not a zeroed day. A ring at 0 of 2,000
   * for somebody who has never opened the app is a lie told confidently; this
   * says what is actually true, which is that we have not looked yet.
   */
  if (!snapshot) {
    return (
      <FlexWidget
        {...OPEN_JOURNAL}
        accessibilityLabel="Open Day So Far"
        style={{
          height: 'match_parent',
          width: 'match_parent',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: PALETTE.background,
          borderRadius: 24,
          padding: 16,
        }}
      >
        <TextWidget
          text="Open Day So Far"
          style={{ fontSize: 15, color: PALETTE.mutedForeground, fontFamily: 'Nunito' }}
        />
      </FlexWidget>
    );
  }

  const remaining = snapshot.target - snapshot.consumed;
  const over = remaining < 0;
  const spoken = over
    ? `${Math.abs(remaining).toLocaleString()} kcal over today`
    : `${remaining.toLocaleString()} kcal left today`;

  return (
    <FlexWidget
      {...OPEN_JOURNAL}
      accessibilityLabel={spoken}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: PALETTE.background,
        borderRadius: 24,
        padding: 8,
      }}
    >
      {/*
        * The figure sits inside the ring, as it does in the app. `OverlapWidget`
        * is the only way to stack anything in `RemoteViews` — there is no
        * absolute positioning out here.
        */}
      <OverlapWidget style={{ height: 132, width: 132 }}>
        <SvgWidget
          svg={ringSvg({
            consumed: snapshot.consumed,
            target: snapshot.target,
            size: 132,
            strokeWidth: 16,
            track: PALETTE.muted,
            fill: PALETTE.calories,
            over: PALETTE.foreground,
          })}
          style={{ height: 132, width: 132 }}
        />
        <FlexWidget
          style={{ height: 132, width: 132, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text={Math.abs(remaining).toLocaleString()}
            style={{ fontSize: 30, color: PALETTE.foreground, fontFamily: 'Baloo2' }}
          />
          <TextWidget
            text={over ? 'over' : 'to go'}
            style={{ fontSize: 12, color: PALETTE.mutedForeground, fontFamily: 'Nunito' }}
          />
        </FlexWidget>
      </OverlapWidget>
    </FlexWidget>
  );
}
