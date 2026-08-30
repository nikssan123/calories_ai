import { Capsule, Circle, HStack, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  offset,
  opacity,
  padding,
  rotationEffect,
  strokeBorder,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { FaceProps } from './props';

/**
 * The tree, and nothing but the tree.
 *
 * One function, registered twice. `createWidget` is handed a *string* — the
 * babel plugin behind the `'widget'` directive replaces this function with a
 * template literal of its own source — so registering the same function under
 * both names costs one copy of the dial rather than two, and the extension's
 * runtime caches its compiled layouts by that string, so the two widgets also
 * share one compiled copy at draw time.
 *
 * **Everything this function names has to exist in the extension.** The string
 * is evaluated with `context.evaluateScript("(\(layout))")` in a JavaScriptCore
 * context whose globals are the `@expo/ui` components and modifiers and nothing
 * else. The imports above are real and load-bearing — they are what makes the
 * names type-check here, and babel captures this function's source *before* it
 * rewrites those imports into module lookups, so what reaches the extension is
 * the bare identifier `VStack`, which is exactly what the runtime put on
 * `globalThis`. An import from anywhere else would survive type-checking, pass
 * a build, and then be `undefined` on somebody's home screen.
 *
 * That is the whole reason the arithmetic is not here. See `props.ts`: sizes,
 * fitted type and every translated string arrive already worked out, from the
 * same `layout.ts` that draws the Android widget. What is left below is
 * placement, and the one thing that genuinely cannot be a prop — the arc, whose
 * segments depend on nothing but the numbers beside them, and which would cost
 * more to send than to build.
 */
function Face(props: FaceProps, environment: WidgetEnvironment) {
  'widget';

  /*
   * The scheme is only knowable here, so both palettes were sent. Same reason
   * the Android handler renders a light and a dark rendition: a widget cannot
   * ask what the wallpaper looks like, and nobody can navigate away from a
   * rectangle that came out unreadable.
   */
  const paint = environment.colorScheme === 'dark' ? props.dark : props.light;
  /* The PostScript name, not the file name — `Font.custom` matches on this, and
   * misses silently into the system face. Android matches on the file name
   * instead, which is why `theme.ts` spells the same font differently. */
  const DISPLAY = 'Baloo2-ExtraBold';
  const RADIANS = Math.PI / 180;

  /** A point along the arc's ramp, in the sRGB the rest of the app mixes in. */
  const mix = (from: string, to: string, at: number) => {
    const channel = (hex: string, index: number) =>
      parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
    const pair = (index: number) => {
      const value = Math.round(
        channel(from, index) + (channel(to, index) - channel(from, index)) * at,
      );
      return (value < 16 ? '0' : '') + value.toString(16);
    };
    return `#${pair(0)}${pair(1)}${pair(2)}`;
  };

  /**
   * The dial, at whatever size it was given.
   *
   * `CalorieRing`'s geometry, and `ring.ts`'s arithmetic verbatim: the same
   * depth ratio, the same radius, the same start at twelve o'clock. What
   * differs is only how an arc gets drawn without a path to draw it on.
   *
   * SwiftUI has no `Circle().trim()` here — widget UI is limited to what
   * `@expo/ui` exposes — so the arc is laid out rather than stroked: a run of
   * capsules, each spanning a few degrees, each rotated to lie along its own
   * chord and offset to sit on the circle. Their round ends are what
   * `stroke-linecap="round"` is on the other platform, and because the ends of
   * neighbours coincide exactly, the joins fill themselves in. Nine degrees a
   * piece puts the chord under two tenths of a point inside the true arc, which
   * is less than the antialiasing on either side of it.
   *
   * It buys something the SVG could only approximate, too: each capsule is
   * filled on its own, so the ramp is sampled per piece off the same diagonal
   * the app's gradient runs along, rather than being one gradient stretched
   * over a shape that is mostly hole.
   */
  const dial = () => {
    const { box, stroke, portion, over } = props;
    // `ring.ts`'s own arithmetic, verbatim.
    const depth = Math.max(3, Math.round(stroke * 0.22));
    const radius = (box - stroke - depth) / 2;
    /* `strokeBorder` insets by half its width, so a ring of this radius wants a
     * frame of `2r + stroke` — which is the box less the ledge's drop. */
    const ringBox = box - depth;

    const arc = [];
    if (portion > 0) {
      const sweep = portion * 360;
      const count = Math.max(1, Math.ceil(sweep / 9));
      const step = sweep / count;
      /* The chord's midpoint sits a little inside the circle; putting the
       * capsule's centre there is what lands its two round ends *on* it. */
      const apothem = radius * Math.cos((step / 2) * RADIANS);
      const chord = 2 * radius * Math.sin((step / 2) * RADIANS);

      for (let index = 0; index < count; index += 1) {
        const middle = (index + 0.5) * step;
        const x = apothem * Math.sin(middle * RADIANS);
        const y = -apothem * Math.cos(middle * RADIANS);
        /* Where this piece falls along the corner-to-corner gradient the app
         * paints the arc with — `x1,y1 = 0,0` to `x2,y2 = size,size`. */
        const along = Math.min(1, Math.max(0, (box + x + y) / (2 * box)));
        arc.push(
          <Capsule
            key={`arc${index}`}
            modifiers={[
              frame({ width: chord + stroke, height: stroke }),
              foregroundStyle(over ? paint.foreground : mix(paint.calories, paint.ramp, along)),
              rotationEffect(middle),
              offset({ x, y }),
            ]}
          />,
        );
      }
    }

    /*
     * Both rings are a stroke overlaid on a circle that is not drawn —
     * `strokeBorder` is a modifier on content, and the content here exists only
     * to give it a frame to inscribe itself in.
     */
    const ring = (colour: string, drop: number, fade: number) => (
      <Circle
        modifiers={[
          frame({ width: ringBox, height: ringBox }),
          opacity(0),
          strokeBorder({ shape: 'circle', color: colour, style: { lineWidth: stroke } }),
          /* The ledge is a tone and a fraction rather than one colour, the same
           * split `theme.ts` makes for it: the app spells it `rgba()`, and
           * neither an SVG 1.1 renderer nor this one takes that. */
          opacity(fade),
          offset({ y: drop }),
        ]}
      />
    );

    return (
      <ZStack modifiers={[frame({ width: box, height: box })]}>
        {ring(paint.ledge, depth, paint.ledgeOpacity)}
        {ring(paint.muted, 0, 1)}
        {arc}
        <VStack spacing={0} modifiers={[frame({ width: box, height: box })]}>
          {props.figure > 0 && (
            <Text
              modifiers={[
                font({ family: DISPLAY, size: props.figure }),
                foregroundStyle(paint.foreground),
                lineLimit(1),
              ]}
            >
              {props.figureText}
            </Text>
          )}
          {props.caption > 0 && (
            <Text
              modifiers={[
                font({ size: props.caption, weight: 'semibold' }),
                foregroundStyle(paint.mutedForeground),
                lineLimit(1),
              ]}
            >
              {props.captionText}
            </Text>
          )}
        </VStack>
      </ZStack>
    );
  };

  /** The bar under the line shape: a track, and however much of it is eaten. */
  const bar = () => (
    <ZStack alignment="leading" modifiers={[frame({ width: props.track, height: props.bar })]}>
      <Capsule
        modifiers={[
          frame({ width: props.track, height: props.bar }),
          foregroundStyle(paint.muted),
        ]}
      />
      {props.fill > 0 && (
        <Capsule
          modifiers={[
            frame({ width: props.fill, height: props.bar }),
            foregroundStyle(props.over ? paint.foreground : paint.calories),
          ]}
        />
      )}
    </ZStack>
  );

  /**
   * The card every shape sits on.
   *
   * `containerBackground` rather than a drawn rectangle, because that is the
   * one iOS insists on: from iOS 17 a widget's background has to be declared
   * this way or the system draws its own behind you, and it is also what lets
   * the same view be legible when the reader has tinted their home screen. No
   * border, unlike Android — the system clips every widget to its own rounded
   * rectangle, and a stroke inside that reads as a second, wrong edge.
   */
  const shell = (children: React.ReactNode) => (
    <ZStack
      modifiers={[
        containerBackground(paint.card, 'widget'),
        widgetURL('daysofar:///'),
        accessibilityLabel(props.spoken),
      ]}
    >
      {children}
    </ZStack>
  );

  /*
   * Nothing has been logged and nothing is known — nobody has opened the app,
   * or the day turned over while it was shut. Not a ring at zero: "0 of 2,000"
   * for somebody who has not opened the app is a lie told confidently, and
   * yesterday's figure under the word "today" is worse than a stale one, it is
   * a wrong one. The honest answer says what to do about it.
   */
  if (!props.known) {
    return shell(
      <VStack spacing={2} modifiers={[padding({ all: 14 })]}>
        <Text
          modifiers={[
            font({ size: 15, weight: 'bold' }),
            foregroundStyle(paint.foreground),
            lineLimit(1),
          ]}
        >
          {props.title}
        </Text>
        <Text
          modifiers={[font({ size: 12 }), foregroundStyle(paint.mutedForeground), lineLimit(1)]}
        >
          {props.tapToStart}
        </Text>
      </VStack>,
    );
  }

  if (props.shape === 'dial') {
    return shell(<VStack modifiers={[padding({ all: props.padding })]}>{dial()}</VStack>);
  }

  /*
   * One row: the figure, the word for it, the ratio, and a bar under all three.
   * The ratio is dropped by measurement rather than by a guess about how wide
   * the reader made it — `dayLayout` sends 0 when it will not fit.
   */
  if (props.shape === 'line') {
    return shell(
      <VStack
        alignment="leading"
        spacing={props.gap}
        modifiers={[padding({ horizontal: props.paddingHorizontal, vertical: props.padding })]}
      >
        {/* No spacing: the word already carries its own leading space, the way
            the Android line sets it. */}
        <HStack spacing={0} modifiers={[frame({ width: props.track })]}>
          <Text
            modifiers={[
              font({ family: DISPLAY, size: props.figure }),
              foregroundStyle(paint.foreground),
              lineLimit(1),
            ]}
          >
            {props.figureText}
          </Text>
          <Text
            modifiers={[
              font({ size: props.wording, weight: 'semibold' }),
              foregroundStyle(paint.mutedForeground),
              lineLimit(1),
            ]}
          >
            {props.wordingText}
          </Text>
          <Spacer />
          {props.ratio > 0 && (
            <Text
              modifiers={[
                font({ size: props.ratio, weight: 'semibold' }),
                foregroundStyle(paint.mutedForeground),
                lineLimit(1),
              ]}
            >
              {props.ratioText}
            </Text>
          )}
        </HStack>
        {bar()}
      </VStack>,
    );
  }

  /*
   * Two rows and up: the dial on the left, and beside it the three things the
   * dial cannot say — what the figure means, what it is out of, and the burn.
   * The number stays inside the ring and nowhere else; an earlier cut of the
   * Android one set it in the column as well, which made the widest, boldest
   * thing on the card a number already being shown four points to its left.
   */
  return shell(
    <HStack spacing={14} modifiers={[padding({ all: props.padding })]}>
      {dial()}
      <VStack alignment="leading" spacing={2}>
        <Text
          modifiers={[
            font({ size: props.headline, weight: 'bold' }),
            foregroundStyle(paint.foreground),
            lineLimit(1),
          ]}
        >
          {props.headlineText}
        </Text>
        <Text
          modifiers={[
            font({ size: props.detail, weight: 'semibold' }),
            foregroundStyle(paint.mutedForeground),
            lineLimit(1),
          ]}
        >
          {props.detailText}
        </Text>
        {props.burnText !== '' && (
          <Text
            modifiers={[
              font({ size: props.detail, weight: 'semibold' }),
              foregroundStyle(paint.burn),
              lineLimit(1),
            ]}
          >
            {props.burnText}
          </Text>
        )}
      </VStack>
      <Spacer />
    </HStack>,
  );
}

/**
 * The two registrations.
 *
 * The names are the Android ones, and have to match `app.json` — the plugin
 * generates a Swift type per widget and looks its layout up by that name.
 */
export const RingWidget = createWidget<FaceProps>('Ring', Face);
export const DayWidget = createWidget<FaceProps>('Day', Face);
