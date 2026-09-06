import { displayWidth, fitFontSize } from '@ct/shared';
import type { WidgetText } from './text';

/**
 * Where everything goes, at whatever size the launcher gave us.
 *
 * Kept apart from the components on purpose. A widget cannot be opened and
 * looked at while it is being written — it is drawn by another process, on a
 * home screen, at a size chosen by a launcher we do not control — so the part
 * worth being able to read, check and reproduce is the arithmetic, not the
 * tree. Everything here is a pure function of a rectangle; the components below
 * only spend what these hand them.
 *
 * All numbers are dp. So is every font size, which is why the text is drawn
 * with `allowFontScaling` off: the library would otherwise set type in sp, and
 * a reader with the system font size turned up would get numerals measured
 * against a box that had not grown with them. Inside the app the text scales,
 * because there the layout can reflow. A widget has nowhere to reflow to.
 */

/**
 * What a line of type costs in height.
 *
 * Set on every figure drawn in the display face, and used here to work
 * backwards from a row to a type size. Baloo asks for 1.6em by default, which
 * is generous for prose and absurd for a single number in a box measured in
 * points — the digits are 0.6em of ink and the rest is air the widget does not
 * have to give.
 *
 * It is `DISPLAY_LEADING` from `theme/typography.ts` rather than something
 * tighter, and for the reason written down there: the face's descender is
 * 0.524em against a 0.602em cap, so a line box under 1.126em crops the tops of
 * its own digits. Copied rather than imported, like the palette — see
 * `theme.ts`.
 */
export const LINE_HEIGHT = 1.15;

/** The card's outline, subtracted from every inner measurement. */
const BORDER = 2;

/**
 * Below this the ring stops being a card with a ring in it and becomes a ring
 * that happens to have an edge: the padding tightens, the corner rounds off
 * towards a circle, and the caption goes.
 */
const COMPACT = 118;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Math.round(value)));

export interface RingLayout {
  padding: number;
  radius: number;
  /** The ring's diameter, and the side of the square it is drawn in. */
  box: number;
  stroke: number;
  /** 0 when the room cannot hold the number legibly — then the ring says it. */
  figure: number;
  figureText: string;
  /** 0 when there is no room under the number for a word. */
  caption: number;
  captionText: string;
}

/**
 * The square one.
 *
 * At a single cell this is an icon-sized dial, and the whole design problem is
 * that a four-digit number has to fit inside a circle of about forty points.
 * It is solved by measuring rather than by picking: the figure is set to the
 * largest size its own digits fit in, so a day with 480 left carries a bigger
 * number than one with 1,480 — which is right, since the first is also the more
 * urgent thing to read across a room.
 */
export function ringLayout({
  width,
  height,
  remaining,
  text,
}: {
  width: number;
  height: number;
  remaining: number;
  text: WidgetText;
}): RingLayout {
  const side = Math.min(width, height);
  const compact = side < COMPACT;
  const padding = compact ? 6 : 10;
  const box = Math.max(0, side - 2 * (padding + BORDER));
  const stroke = clamp(box * 0.13, 6, 26);
  /* The clear circle inside the arc, less a hair so ink never touches ink. */
  const inner = Math.max(0, box - 2 * stroke - 4);

  /*
   * A word under the number needs the number to have stopped being the only
   * thing that fits. Below that, "over" is carried by a plus sign instead —
   * an unlabelled figure on a ring that has gone dark reads as "left", which
   * is the one reading that would be wrong.
   */
  const captioned = inner >= 64;
  const over = remaining < 0;
  const value = text.n(Math.abs(remaining));
  const figureText = over && !captioned ? `+${value}` : value;
  const caption = captioned ? clamp(inner * 0.13, 9, 13) : 0;

  const figure = fitFontSize({
    text: figureText,
    face: text.face,
    width: inner * 0.9,
    min: 11,
    /* Capped, because proportional alone gives 60pt numerals at the largest
     * size the widget can be dragged to, which stops looking like the app's
     * dial and starts looking like a clock. 46 is the figure `CalorieRing`
     * sets at its own default size. */
    max: Math.min(46, Math.round(inner * (captioned ? 0.46 : 0.62))),
  });

  return {
    padding,
    radius: compact ? clamp(side * 0.28, 14, 28) : 28,
    box,
    stroke,
    figure,
    figureText,
    caption: figure > 0 ? caption : 0,
    captionText: over ? text.over : text.toGo,
  };
}

/**
 * The steps widget: what it draws and how big.
 *
 * A separate shape from the two calorie widgets rather than a variant of them,
 * because it answers a different question and the hierarchy has to say so. On
 * the Day card a step count is the third muted line under the ring; here it is
 * the reason the rectangle exists, and the calories are the quiet line at the
 * bottom.
 *
 * The reference is the reader's own recent average, and never a goal. This app
 * has no notion of a step target and inventing one — ten thousand, because it
 * is the number people have heard — would mean drawing a ring that grades
 * somebody against a figure nobody set, on their home screen, every day.
 * "More than usual" is a fact about them. A percentage of an invented goal is a
 * verdict, and one the app has no standing to deliver.
 *
 * So the bar runs to `average` rather than to a target, and past it simply
 * fills: going over your usual is not going over anything.
 */
export interface StepsLayout {
  padding: number;
  /** The card's corner, tightened on the smallest square. */
  radius: number;
  figure: number;
  figureText: string;
  /** The word under the figure — 0 when there is no room for it. */
  caption: number;
  captionText: string;
  /** "more than usual" / "of your usual 9,400" — 0 when it will not fit. */
  detail: number;
  detailText: string;
  /** The bar. 0 across when there is no average to measure against. */
  bar: number;
  gap: number;
  track: number;
  fill: number;
  /** The day's calories, on the wide shape only. Empty when there is no room. */
  kcalText: string;
  kcal: number;
}

/**
 * Big enough to caption. Below this the figure is the whole widget, which is
 * the right answer at icon size — a number and a shoe say "steps" without a
 * word under them.
 */
const STEPS_CAPTIONED = 96;

export function stepsLayout({
  width,
  height,
  steps,
  average,
  consumed,
  target,
  text,
}: {
  width: number;
  height: number;
  steps: number | null;
  average: number | null;
  consumed: number;
  target: number;
  text: WidgetText;
}): StepsLayout {
  const wide = width >= height * 1.6;
  const padding = Math.min(width, height) < STEPS_CAPTIONED ? 8 : 14;
  const inner = Math.max(0, width - 2 * (padding + BORDER));
  const room = Math.max(0, height - 2 * (padding + BORDER));

  const figureText = text.n(steps ?? 0);
  /*
   * Measured to the width it actually has, like every other figure in here. A
   * five-figure count is a real thing — twelve thousand steps is a good day out
   * — and picking a size rather than fitting one is how "12,480" ends up wider
   * than the card it is drawn on.
   */
  const figure = fitFontSize({
    text: figureText,
    face: text.face,
    /* Half the card on the wide shape, where the calorie line sits beside it. */
    width: (wide ? inner * 0.56 : inner) * 0.94,
    min: 13,
    max: Math.min(wide ? 40 : 46, Math.round(room * (wide ? 0.46 : 0.4))),
  });

  const captioned = room >= STEPS_CAPTIONED * 0.5 && figure > 0;
  const caption = captioned ? clamp(figure * 0.34, 10, 15) : 0;

  /*
   * The comparison, in the reader's own terms. Absent when the week behind them
   * is too thin to average — `stepsContextFor` returns null rather than a
   * figure built from two days.
   */
  const hasBar = captioned && average !== null;
  const portion = average && average > 0 ? Math.min(1, (steps ?? 0) / average) : 0;
  const detailText = average === null ? '' : text.usual(text.n(average));
  /*
   * The calories, quietly, on the wide shape only — and quietly is the point.
   * This is still a calorie app's widget: somebody who put it on their home
   * screen for the steps should not have to open the app to find out where
   * their day stands. On a square there is no room for a second reading and the
   * steps win, which is what this widget is for.
   */
  const kcalText = wide && target > 0 ? text.of(text.n(consumed), text.n(target)) : '';

  /*
   * What actually fits, measured, and dropped from the bottom up.
   *
   * Not a guess about height, because the launcher hands out cells this code
   * does not choose: a one-row-tall 250×110 cell has room for the figure, its
   * word and the bar, and nothing else — and the version of this that assumed
   * instead of measured put four rows into it and let Android clip the last one
   * off in silence. That is exactly how the Day widget lost its bar once
   * already, which is why `dayLayout` measures too.
   *
   * The order is the priority: the figure is the widget, the caption tells you
   * what it counts, the bar is the comparison, the sentence spells the bar out,
   * and the calories are the bonus. Whatever the room runs out on goes first.
   */
  const stack = figure * LINE_HEIGHT + (caption > 0 ? caption * 1.2 : 0);
  let left = room - stack;

  const barHeight = hasBar ? 5 + 7 : 0;
  const bar = hasBar && left >= barHeight ? 5 : 0;
  const gap = bar > 0 ? 7 : 0;
  left -= bar > 0 ? barHeight : 0;

  const detailSize = clamp(figure * 0.3, 10, 13);
  const detail = detailText !== '' && caption > 0 && left >= detailSize * 1.35 + 4 ? detailSize : 0;
  left -= detail > 0 ? detail * 1.35 + 4 : 0;

  const kcalSize = clamp(figure * 0.32, 10, 14);
  const kcal = kcalText !== '' && left >= kcalSize * 1.35 + 4 ? kcalSize : 0;

  const track = bar > 0 ? inner : 0;

  return {
    padding,
    radius: Math.min(width, height) < STEPS_CAPTIONED ? clamp(Math.min(width, height) * 0.28, 14, 28) : 28,
    figure,
    figureText,
    caption,
    captionText: text.stepsWord,
    detail,
    detailText,
    bar,
    gap,
    track,
    fill: portion > 0 ? clamp(Math.max(5, track * portion), 5, track) : 0,
    kcalText,
    kcal,
  };
}

interface DayCommon {
  padding: number;
  label: string;
}

export interface DayLine extends DayCommon {
  shape: 'line';
  paddingHorizontal: number;
  figure: number;
  figureText: string;
  /** The word beside the figure — 0 if even that has to go. */
  wording: number;
  /** `850 / 2,090` on the right, 0 when the line is too narrow to hold it. */
  ratio: number;
  ratioText: string;
  bar: number;
  gap: number;
  track: number;
  fill: number;
}

export interface DayCard extends DayCommon {
  shape: 'card';
  box: number;
  stroke: number;
  figure: number;
  figureText: string;
  title: number;
  detail: number;
  /**
   * How many muted lines fit under the headline.
   *
   * The column has three things it could say — what the figure is out of, what
   * was burned, and how far somebody walked — and at the shortest height this
   * shape is allowed to be there is room for one. Measured rather than assumed,
   * because the alternative is a launcher silently clipping the last line off
   * the bottom, which is how the bar went missing from the line shape.
   *
   * The components spend this by taking rows in order of what a calorie app
   * owes the reader first: the ratio, then the burn, then the steps.
   */
  detailRows: number;
}

export type DayLayout = DayLine | DayCard;

/**
 * A muted line under the card's headline: what it says, and which of the two
 * tones it is said in.
 *
 * A tone rather than a colour, because this is worked out in the one place that
 * cannot name a colour. `theme.ts`'s palette is Android's `ColorProp`, the iOS
 * face takes plain strings out of a plist, and neither is reachable from a pure
 * function that both platforms have to call. Each tree resolves the tone
 * against the palette it actually has.
 */
export interface DetailLine {
  key: 'of' | 'burned' | 'steps';
  text: string;
  tone: 'muted' | 'burn';
}

/**
 * The lines the card has room for, in priority order.
 *
 * Three things could be said and a one-row card holds one, so the order is the
 * argument: what the figure is out of comes first, because it is the reason
 * this shape exists at all; the burn second, because it is still calories; the
 * steps last.
 *
 * Steps are also `muted` rather than `burn`, and that is not a styling
 * preference. The burn line is pink because it names a figure that moves the
 * arithmetic. The step line is grey because it deliberately does not — it is
 * context, and painting the two alike would claim, on the one surface with no
 * room for a caption, that a walk and a workout do the same thing to somebody's
 * day. Keeping steps out of `exercise_entries` is the whole point; drawing them
 * as if they were in it would give that away. See `services/metrics.ts`.
 *
 * A null step count drops its row rather than drawing a nought, for the reason
 * on `DaySnapshot.steps`: nobody walks exactly none, so "0 steps" on a home
 * screen is a wrong fact rather than a missing one.
 */
export function detailLines(
  {
    consumed,
    target,
    burned,
    steps,
  }: { consumed: number; target: number; burned: number; steps: number | null },
  rows: number,
  text: WidgetText,
): DetailLine[] {
  const lines: DetailLine[] = [
    { key: 'of', text: text.of(text.n(consumed), text.n(target)), tone: 'muted' },
  ];
  if (burned > 0) {
    lines.push({ key: 'burned', text: text.burned(text.n(burned)), tone: 'burn' });
  }
  if (steps !== null && steps > 0) {
    lines.push({ key: 'steps', text: text.steps(steps), tone: 'muted' });
  }
  return lines.slice(0, rows);
}

/**
 * The wide one, which changes shape rather than scaling.
 *
 * One row and it is a sentence with a bar under it: what is left, what that is
 * out of, and how far through the day the plate is. Dragged taller the bar
 * gives way to the ring and the sentence gets its second and third lines. That
 * is the whole argument for a resizable widget — not the same picture at two
 * sizes, but the right picture for the room.
 *
 * The choice is made on proportion as well as height, because a row is not a
 * fixed number of points: launchers with tall grids hand a one-cell widget
 * something near 120dp, and a card built for that would be a ring squeezed
 * against a wall. Anything more than twice as wide as it is tall is a line.
 */
export function dayLayout({
  width,
  height,
  consumed,
  target,
  text,
}: {
  width: number;
  height: number;
  consumed: number;
  target: number;
  text: WidgetText;
}): DayLayout {
  const remaining = target - consumed;
  const over = remaining < 0;
  const label = over ? text.over : text.toGo;
  const figureText = text.n(Math.abs(remaining));
  const ratioText = `${text.n(consumed)} / ${text.n(target)}`;
  const portion = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;

  if (height < 108 || width >= height * 2.2) {
    const paddingHorizontal = 16;
    const padding = 10;
    const bar = 6;
    const gap = 8;
    const track = Math.max(40, width - 2 * (paddingHorizontal + BORDER));
    /*
     * Measured against the height the launcher actually gave us, and against
     * the line box rather than the type size. Baloo's own metrics are 1.6em
     * tall for a face whose digits are 0.6em of ink, so a 26pt figure asks for
     * 42dp of row unless the line height is set — the first cut did not, went
     * about four points over a one-row cell, and Android answered by clipping
     * the bar off the bottom. Silently, so the widget simply looked like it
     * had no bar.
     */
    const room = height - 2 * (padding + BORDER) - bar - gap;
    const figure = clamp(room / LINE_HEIGHT, 15, 28);
    const wording = clamp(figure * 0.5, 11, 15);
    const ratio = clamp(figure * 0.48, 11, 14);

    /*
     * The ratio is the first thing to go. It is the only part of the line that
     * repeats what the bar already says, and a narrow widget would otherwise
     * push it into the figure.
     */
    const left = displayWidth(figureText, figure, text.face) + displayWidth(` ${label}`, wording);
    const asked = left + displayWidth(ratioText, ratio) + 20;

    return {
      shape: 'line',
      padding,
      paddingHorizontal,
      label,
      figure,
      figureText,
      wording,
      ratio: asked <= track ? ratio : 0,
      ratioText,
      bar,
      gap,
      track,
      /* No percentages in `RemoteViews`, so the fill is dp off the reported
       * width — and never zero once anything has been eaten, because a bar
       * with no nub reads as a bar that is broken. */
      fill: portion > 0 ? clamp(Math.max(6, track * portion), 6, track) : 0,
    };
  }

  const padding = 12;
  /*
   * 0.42 of the width rather than 0.36, and the type caps below are raised to
   * match. Both were set against Android cells, where the *height* binds — four
   * cells by two is 250×110dp, so the dial is 82dp either way and neither cap is
   * reached. They bind only once the card is given a genuinely wide rectangle,
   * which is what a `systemMedium` widget is: 351×165, where the old factor left
   * the dial at 126 and the sentence at its 21pt ceiling with seventy points of
   * empty card beside it. Dragged tall on Android the ring now grows too, which
   * is the behaviour that shape is resizable for.
   */
  const box = clamp(Math.min(height - 2 * (padding + BORDER), width * 0.42), 0, 148);
  const stroke = clamp(box * 0.13, 6, 20);
  const inner = Math.max(0, box - 2 * stroke - 4);
  const title = clamp(box * 0.17, 14, 24);
  const detail = clamp(title * 0.7, 11, 16);

  /*
   * What the column has left once the headline has taken its line, in rows of
   * muted text. 1.35 is the line box those rows actually occupy — tighter than
   * the display face's `LINE_HEIGHT` because they are not set in it — and the
   * 2dp gap between rows is the `spacing` both trees use.
   *
   * Floored at one and capped at three: one because the ratio is the reason
   * this shape exists and dropping it would leave a dial with a word beside it,
   * three because there is nothing else to say.
   */
  const column = height - 2 * (padding + BORDER) - title * LINE_HEIGHT;
  const detailRows = Math.max(1, Math.min(3, Math.floor(column / (detail * 1.35 + 2))));

  return {
    shape: 'card',
    padding,
    label,
    box,
    stroke,
    figure: fitFontSize({
      text: figureText,
      face: text.face,
      width: inner * 0.9,
      min: 12,
      max: Math.min(30, Math.round(inner * 0.6)),
    }),
    figureText,
    title,
    detail,
    detailRows,
  };
}
