import { displayWidth, fitFontSize } from './measure';
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
 */
export const LINE_HEIGHT = 1.08;

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
}

export type DayLayout = DayLine | DayCard;

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
    const left = displayWidth(figureText, figure) + displayWidth(` ${label}`, wording);
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
  const box = clamp(Math.min(height - 2 * (padding + BORDER), width * 0.36), 0, 148);
  const stroke = clamp(box * 0.13, 6, 20);
  const inner = Math.max(0, box - 2 * stroke - 4);
  const title = clamp(box * 0.17, 14, 21);

  return {
    shape: 'card',
    padding,
    label,
    box,
    stroke,
    figure: fitFontSize({
      text: figureText,
      width: inner * 0.9,
      min: 12,
      max: Math.min(30, Math.round(inner * 0.6)),
    }),
    figureText,
    title,
    detail: clamp(title * 0.7, 11, 14),
  };
}
