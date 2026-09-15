import { useId } from 'react';
import {
  BODY_STOPS,
  CROWN_STOPS,
  FLAME_RAMP,
  FLAME_STOPS,
  GRID,
  drawing,
  isGradient,
  type CastName,
  type Mood,
  type Prop,
  type Shape,
} from '@ct/shared/cast';
import { cn } from '@/lib/utils';

/**
 * Ember, Skye and Plum on the web (CAST.md), drawn from the same geometry as
 * the phone and the widget in `@ct/shared/cast`.
 *
 * Inline SVG, with the phone's motion spelled in CSS: the body breathes, the
 * eyes blink, and a waving arm turns about its shoulder. Every pivot is set in
 * grid units against the view box, so it holds at any size. The `.cast` rules
 * in globals.css are switched off under `prefers-reduced-motion`, and the
 * figures stay drawn, just still.
 *
 * Decorative: hidden from assistive technology, since the words beside a figure
 * always say what the page means.
 */
export function Cast({
  name,
  mood = 'idle',
  prop,
  size = 96,
  delay = 0,
  className,
}: {
  name: CastName;
  mood?: Mood;
  prop?: Prop;
  size?: number;
  /** Seconds the loops are offset by, so figures side by side stay out of step. */
  delay?: number;
  className?: string;
}) {
  const id = `cast${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const d = drawing(name, mood, { prop });
  const style = { '--cast-delay': `${-delay}s` } as React.CSSProperties;

  return (
    <svg
      className={cn('cast overflow-visible', className)}
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}body`} cx="0.36" cy="0.3" r="0.8">
          {d.gradients.body.map((colour, i) => (
            <stop key={i} offset={BODY_STOPS[i]} stopColor={colour} />
          ))}
        </radialGradient>
        {d.gradients.crown && (
          <linearGradient id={`${id}crown`} x1="0" y1="0" x2="0" y2="1">
            {d.gradients.crown.map((colour, i) => (
              <stop key={i} offset={CROWN_STOPS[i]} stopColor={colour} />
            ))}
          </linearGradient>
        )}
        {d.effect === 'flame' && (
          <linearGradient id={`${id}flame`} x1="0" y1="1" x2="0" y2="0">
            {FLAME_RAMP.map((colour, i) => (
              <stop key={colour} offset={FLAME_STOPS[i]} stopColor={colour} />
            ))}
          </linearGradient>
        )}
      </defs>

      <ellipse cx={60} cy={109} rx={28} ry={4.5} className="cast-shadow" />
      <g className="cast-body">
        {d.swing && (
          <g
            className={d.swing.kind === 'stir' ? 'cast-stir' : 'cast-wave'}
            style={{ transformOrigin: `${d.pivots.shoulder[0]}px ${d.pivots.shoulder[1]}px` }}
          >
            <Shapes shapes={d.swing.shapes} id={id} />
          </g>
        )}
        <Shapes shapes={d.legs} id={id} />
        <Shapes shapes={d.body} id={id} />
        {d.eyes.length > 0 && (
          <g className="cast-eyes" style={{ transformOrigin: `${d.pivots.eyes[0]}px ${d.pivots.eyes[1]}px` }}>
            <Shapes shapes={d.eyes} id={id} />
          </g>
        )}
        <Shapes shapes={d.fx} id={id} />
      </g>
    </svg>
  );
}

/** The three in a row, out of step, the way the phone's typing indicator stands them. */
export function CastTrio({
  moods = ['idle', 'wave', 'idle'],
  size = 72,
  className,
}: {
  moods?: readonly [Mood, Mood, Mood];
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-center gap-1', className)} aria-hidden="true">
      <Cast name="ember" mood={moods[0]} size={size} delay={0} />
      <Cast name="skye" mood={moods[1]} size={size} delay={0.6} />
      <Cast name="plum" mood={moods[2]} size={size} delay={1.2} />
    </div>
  );
}

function paint(fill: string | undefined, id: string) {
  if (!fill) return 'none';
  return isGradient(fill) ? `url(#${id}${fill})` : fill;
}

function Shapes({ shapes, id }: { shapes: Shape[]; id: string }) {
  return (
    <>
      {shapes.map((shape, i) => {
        switch (shape.el) {
          case 'path':
            return (
              <path
                key={i}
                d={shape.d}
                fill={paint(shape.fill, id)}
                stroke={shape.stroke}
                strokeWidth={shape.width}
                strokeLinecap={shape.round ? 'round' : undefined}
                strokeLinejoin={shape.round ? 'round' : undefined}
                opacity={shape.opacity}
              />
            );
          case 'ellipse':
            return (
              <ellipse
                key={i}
                cx={shape.cx}
                cy={shape.cy}
                rx={shape.rx}
                ry={shape.ry}
                fill={paint(shape.fill, id)}
                stroke={shape.stroke}
                strokeWidth={shape.width}
                opacity={shape.opacity}
                transform={shape.rotate ? `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` : undefined}
              />
            );
          case 'circle':
            return <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={paint(shape.fill, id)} opacity={shape.opacity} />;
          case 'rect':
            return (
              <rect
                key={i}
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                rx={shape.rx}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth={shape.width}
                transform={
                  shape.rotate ? `rotate(${shape.rotate} ${shape.x + shape.w / 2} ${shape.y + shape.h / 2})` : undefined
                }
              />
            );
          case 'group':
            return (
              <g key={i} transform={`translate(${shape.x} ${shape.y}) scale(${shape.scale})`}>
                <Shapes shapes={shape.children} id={id} />
              </g>
            );
        }
      })}
    </>
  );
}
