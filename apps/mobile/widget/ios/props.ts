import { LINE_HEIGHT, dayLayout, ringLayout } from '../layout';
import { DARK, LIGHT, type WidgetPalette } from '../theme';
import { widgetText, type WidgetText } from '../text';
import type { Locale } from '@ct/shared';
import type { DaySnapshot } from '@/lib/snapshot';
import { deviceLocale } from '@/messages';

/**
 * Everything the iOS widgets draw, worked out here rather than there.
 *
 * This split is forced, and it turns out to be the one the code already wanted.
 *
 * A WidgetKit layout is not a component that runs in the app. `expo-widgets`
 * takes the function marked `'widget'`, replaces it at build time with a string
 * of its own source, and the extension evaluates that string in a bare
 * JavaScriptCore context — `context.evaluateScript("(\(layout))")`. The only
 * names in scope there are the `@expo/ui` components and modifiers the runtime
 * assigns to `globalThis`. An import in that file is not a slow path or a fat
 * bundle; it is an identifier that does not exist, and a widget that fails to a
 * red rectangle on somebody's home screen.
 *
 * So nothing the widget needs may be imported by the widget. It has to arrive
 * as props, and props are what the app pushes with `updateTimeline`.
 *
 * Which means the arithmetic runs *here*, in the app, where `layout.ts`,
 * `measure.ts` and the catalogues can all be reached — and the numbers that
 * draw the Android widget draw this one, out of the same functions. That is the
 * arrangement `layout.ts` already argued for: "the part worth being able to
 * read, check and reproduce is the arithmetic, not the tree." On Android the
 * tree happens to be able to call the arithmetic. Here it cannot, and the layer
 * was already in the right place for that not to matter.
 *
 * Everything below has to survive JSON and a plist: numbers, strings, booleans.
 * No functions, no dates, no undefined.
 */

/**
 * The rectangle WidgetKit will actually hand each family.
 *
 * The widget environment carries `widgetFamily` and not a size — there is no
 * `GeometryReader` to ask and no rectangle in the environment dictionary — so
 * unlike Android, where the launcher reports the cell it gave us, this has to be
 * derived. It is derivable: WidgetKit's sizes are a published function of the
 * screen width, and the app knows its own screen. The first cut used one
 * conservative pair for every phone, which cost seven points a side on the dial
 * and left the wide one visibly short of its own card.
 *
 * The four points added back are `layout.ts`'s `BORDER`, which it reserves on
 * every edge for a 2dp outline. Android draws that outline; iOS does not, because
 * the system already clips every widget to its own rounded rectangle. Handing the
 * arithmetic four more points than the widget really has is how it gets those
 * points back without the shared code needing to know which platform it is on.
 */
const NO_BORDER = 4;

/** Screen width → the small and medium widget sizes iOS uses at that width. */
const WIDGET_SIZES: { screen: number; small: number; medium: number }[] = [
  { screen: 430, small: 170, medium: 364 },
  { screen: 420, small: 170, medium: 364 },
  { screen: 414, small: 169, medium: 360 },
  { screen: 402, small: 165, medium: 351 },
  { screen: 393, small: 158, medium: 338 },
  { screen: 375, small: 155, medium: 329 },
  { screen: 320, small: 141, medium: 292 },
];

/**
 * Pure, and takes the width rather than reading it, so the smoke script can
 * render every phone without a `Dimensions` to stub. `update.ts` supplies the
 * real one; the default is the narrowest common handset, which is the safe way
 * to be wrong — a dial fitted for a smaller card under-fills a bigger one
 * rather than being clipped by it.
 */
export function familySize(screenWidth = 393) {
  const row = WIDGET_SIZES.find((entry) => screenWidth >= entry.screen) ?? WIDGET_SIZES[WIDGET_SIZES.length - 1]!;
  const height = row.small + NO_BORDER;
  return {
    systemSmall: { width: row.small + NO_BORDER, height },
    /* A medium widget is exactly as tall as a small one, and wider. */
    systemMedium: { width: row.medium + NO_BORDER, height },
  };
}

/**
 * The palette as the widget takes it: plain strings, both schemes.
 *
 * Both, because the scheme is only known at draw time — `environment.colorScheme`
 * — and a widget cannot go and look one up. Same bargain the Android handler
 * makes when it hands the launcher a light and a dark rendition and lets it
 * choose, and for the same reason: nobody can navigate away from a rectangle
 * that has come out unreadable.
 */
export interface Paint {
  card: string;
  foreground: string;
  mutedForeground: string;
  calories: string;
  ramp: string;
  muted: string;
  burn: string;
  ledge: string;
  ledgeOpacity: number;
}

const paintOf = (palette: WidgetPalette): Paint => ({
  card: palette.card as string,
  foreground: palette.foreground as string,
  mutedForeground: palette.mutedForeground as string,
  calories: palette.calories as string,
  ramp: palette.ramp as string,
  muted: palette.muted as string,
  burn: palette.burn as string,
  ledge: palette.ledge,
  ledgeOpacity: palette.ledgeOpacity,
});

/**
 * One flat shape for both widgets, tagged with which of the three it is.
 *
 * Flat and tagged rather than a union per widget, because the tree that spends
 * it is a single function registered twice — see `Face.tsx`. Fields the current
 * shape does not draw are zeroed rather than absent: a plist round-trip has no
 * `undefined`, and a zero is already how `layout.ts` says "there is no room for
 * this" everywhere else.
 */
export interface FaceProps {
  /** `dial` is the square one; `card` and `line` are the wide one's two shapes. */
  shape: 'dial' | 'card' | 'line';
  /**
   * False when there is no reading to draw at all — nobody has opened the app,
   * or they have signed out. Then the widget says so rather than drawing a ring
   * at zero: "0 of 2,000" for somebody who has never opened the app is a lie
   * told confidently. See `Empty.tsx` for the whole argument.
   *
   * Note that a day which has rolled over is *not* this. There the target is
   * known and the honest reading is a ring at zero, because that is what a day
   * nothing has been logged on actually looks like — see `update.ts`.
   */
  known: boolean;
  spoken: string;
  title: string;
  tapToStart: string;
  light: Paint;
  dark: Paint;

  padding: number;
  paddingHorizontal: number;

  /** The dial: `dial` and `card`. */
  box: number;
  stroke: number;
  /** How far round the arc runs, 0–1. */
  portion: number;
  /** Past target the arc goes to ink rather than to red — see `ring.ts`. */
  over: boolean;

  figure: number;
  figureText: string;
  /**
   * The box a line of the display face is given, which SwiftUI will not work
   * out correctly on its own.
   *
   * Baloo asks for 1.6em of line box to draw 0.6em of ink, and a `VStack`
   * centres the *boxes*. Left alone that puts a 26pt hole between the figure
   * and its caption at the size the square widget sets them, and drops the
   * caption onto the ring's inner edge. Android sets `lineHeight` for exactly
   * this; iOS has the modifier only from 26, so the same number is spent as an
   * explicit frame instead.
   */
  figureLine: number;

  /** `dial` only. */
  caption: number;
  captionText: string;
  captionLine: number;

  /** `card` only. */
  headline: number;
  headlineText: string;
  detail: number;
  detailText: string;
  /** Empty on a day nothing was burned, which is most of them. */
  burnText: string;

  /** `line` only. */
  wording: number;
  wordingText: string;
  ratio: number;
  ratioText: string;
  bar: number;
  gap: number;
  track: number;
  fill: number;
}

/** Everything a shape does not use, so each builder only states what it draws. */
const NOTHING = {
  box: 0,
  stroke: 0,
  portion: 0,
  over: false,
  figure: 0,
  figureText: '',
  figureLine: 0,
  caption: 0,
  captionText: '',
  captionLine: 0,
  headline: 0,
  headlineText: '',
  detail: 0,
  detailText: '',
  burnText: '',
  wording: 0,
  wordingText: '',
  ratio: 0,
  ratioText: '',
  bar: 0,
  gap: 0,
  track: 0,
  fill: 0,
};

/** How far round the ring the day has run, and whether it went past the end. */
function arcOf(snapshot: DaySnapshot) {
  const ratio = snapshot.target > 0 ? snapshot.consumed / snapshot.target : 0;
  return {
    portion: Math.min(1, Math.max(0, ratio)),
    over: snapshot.consumed > snapshot.target,
  };
}

function commonOf(snapshot: DaySnapshot | null, text: WidgetText) {
  const remaining = snapshot ? snapshot.target - snapshot.consumed : 0;
  return {
    known: snapshot !== null,
    title: 'Day So Far',
    tapToStart: text.tapToStart,
    spoken: snapshot
      ? `${text.n(Math.abs(remaining))} kcal ${text.today(remaining < 0 ? text.over : text.toGo)}`
      : 'Day So Far',
    light: paintOf(LIGHT),
    dark: paintOf(DARK),
  };
}

/**
 * The language the note was written in, or the device's when there is no note.
 *
 * `spoken` is the exception the caller passes: a widget with nothing to show
 * still has two words on it, and when the reason there is nothing to show is a
 * sign-out rather than a fresh install, the account's language is still the
 * better guess than the handset's.
 */
const textFor = (snapshot: DaySnapshot | null, locale?: Locale) =>
  widgetText(snapshot?.locale ?? locale ?? deviceLocale());

/** The square one: the dial, at the size a small widget is. */
export function ringProps(
  snapshot: DaySnapshot | null,
  locale?: Locale,
  screenWidth?: number,
): FaceProps {
  const text = textFor(snapshot, locale);
  const { width, height } = familySize(screenWidth).systemSmall;
  const remaining = snapshot ? snapshot.target - snapshot.consumed : 0;
  const layout = ringLayout({ width, height, remaining, text });

  return {
    ...NOTHING,
    ...commonOf(snapshot, text),
    shape: 'dial',
    padding: layout.padding,
    paddingHorizontal: layout.padding,
    box: layout.box,
    stroke: layout.stroke,
    figure: layout.figure,
    figureText: layout.figureText,
    figureLine: Math.round(layout.figure * LINE_HEIGHT),
    caption: layout.caption,
    captionText: layout.captionText,
    /* 1.2 rather than `LINE_HEIGHT`: the caption is not set in the display
     * face, and this is the figure the Android dial gives it. */
    captionLine: Math.round(layout.caption * 1.2),
    ...(snapshot ? arcOf(snapshot) : {}),
  };
}

/**
 * The wide one, at the size a medium widget is — which is the card shape.
 *
 * `dayLayout` is asked rather than told, and the `line` branch is carried
 * through even though a medium widget never reaches it. The shape is chosen by
 * measurement on both platforms, and a builder that assumed the answer would be
 * a second place the rule was written down.
 */
export function dayProps(
  snapshot: DaySnapshot | null,
  locale?: Locale,
  screenWidth?: number,
): FaceProps {
  const text = textFor(snapshot, locale);
  const { width, height } = familySize(screenWidth).systemMedium;
  /*
   * A layout is still needed with no reading to build one from: the empty state
   * sits on the same card at the same padding. The zeroes it computes reach
   * only fields that branch does not draw.
   */
  const layout = dayLayout({
    width,
    height,
    consumed: snapshot?.consumed ?? 0,
    target: snapshot?.target ?? 0,
    text,
  });
  const common = { ...NOTHING, ...commonOf(snapshot, text), ...(snapshot ? arcOf(snapshot) : {}) };

  if (layout.shape === 'line') {
    return {
      ...common,
      shape: 'line',
      padding: layout.padding,
      paddingHorizontal: layout.paddingHorizontal,
      figure: layout.figure,
      figureText: layout.figureText,
      figureLine: Math.round(layout.figure * LINE_HEIGHT),
      wording: layout.wording,
      wordingText: ` ${layout.label}`,
      ratio: layout.ratio,
      ratioText: layout.ratioText,
      bar: layout.bar,
      gap: layout.gap,
      track: layout.track,
      fill: layout.fill,
    };
  }

  return {
    ...common,
    shape: 'card',
    padding: layout.padding,
    paddingHorizontal: layout.padding,
    box: layout.box,
    stroke: layout.stroke,
    figure: layout.figure,
    figureText: layout.figureText,
    figureLine: Math.round(layout.figure * LINE_HEIGHT),
    headline: layout.title,
    headlineText: text.today(layout.label),
    detail: layout.detail,
    detailText: snapshot ? text.of(text.n(snapshot.consumed), text.n(snapshot.target)) : '',
    burnText: snapshot && snapshot.burned > 0 ? text.burned(text.n(snapshot.burned)) : '',
  };
}
