'use client';

import { useEffect, useRef, useState } from 'react';
import type { Nutrition, Targets } from '@ct/shared';
import { Confetti } from '@/components/Confetti';
import { Glossy, type GlossyName } from '@/components/icons/Glossy';
import { cn } from '@/lib/utils';
import { useT, type StringKey } from '@/lib/i18n';

/**
 * Protein, carbs, fat as three fat tracks.
 *
 * The bars are twice the weight of an ordinary progress bar, which is most of
 * why they read as part of the same object as the ring above rather than as a
 * legend printed under it. Each carries a picture as well as a word, because
 * three coloured stubs with three short labels is exactly the arrangement a
 * glance skips.
 *
 * The glow-up made each bar a lit capsule — a glossy highlight along its top
 * and a soft lift in its own colour — and swapped the emoji for the app's own
 * icons, which draw the same picture here as on a phone (GLOW-UP.md).
 *
 * Hitting a target throws confetti — once, in that macro's own colour, and only
 * on the crossing. This is the app's only celebration and it is on the macros
 * rather than on calories on purpose: "you have reached your protein" is
 * unambiguously good news, and "you have reached your calorie limit" is not the
 * sort of thing anybody wants a party for.
 */

const MACROS = [
  { key: 'protein_g', label: 'macro.protein', icon: 'protein', color: 'var(--protein)', text: 'var(--protein-text)' },
  { key: 'carbs_g', label: 'macro.carbs', icon: 'carbs', color: 'var(--carbs)', text: 'var(--carbs-text)' },
  { key: 'fat_g', label: 'macro.fat', icon: 'fat', color: 'var(--fat)', text: 'var(--fat-text)' },
] as const satisfies readonly {
  key: keyof Nutrition & keyof Targets;
  label: StringKey;
  icon: GlossyName;
  color: string;
  text: string;
}[];

export function MacroBars({
  consumed,
  targets,
  className,
}: {
  consumed: Nutrition;
  targets: Targets;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {MACROS.map((macro, i) => (
        <MacroTrack
          key={macro.key}
          macro={macro}
          value={consumed[macro.key]}
          target={targets[macro.key]}
          index={i}
        />
      ))}
    </div>
  );
}

function MacroTrack({
  macro,
  value,
  target,
  index,
}: {
  macro: (typeof MACROS)[number];
  value: number;
  target: number;
  index: number;
}) {
  const t = useT();
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const met = target > 0 && value >= target;

  /*
   * Counts the crossings rather than tracking a boolean, so <Confetti> — which
   * ignores the value it is handed and watches only for a change — fires again
   * if a target is met, undone by a deletion, and met a second time.
   */
  const [crossings, setCrossings] = useState(0);
  const wasMet = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasMet.current === null) {
      // The state on arrival is not an event: a day already at target must not
      // let off fireworks every time the tab is opened.
      wasMet.current = met;
      return;
    }
    if (met && !wasMet.current) setCrossings((c) => c + 1);
    wasMet.current = met;
  }, [met]);

  return (
    <div className="relative space-y-2">
      <Confetti trigger={crossings || null} colors={[macro.color, macro.text, 'var(--calories)']} />

      <div className="flex items-center gap-1.5">
        <Glossy name={macro.icon} size={16} />
        <span className="text-footnote text-muted-foreground truncate font-semibold">
          {t(macro.label)}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className="text-figure text-body leading-none"
          style={met ? { color: macro.text } : undefined}
        >
          {Math.round(value)}
        </span>
        <span className="text-footnote text-muted-foreground tnum font-semibold">/{target}</span>
      </div>

      {/* A lit capsule since the glow-up: a glossy highlight along the top of
          the fill and a soft lift in its own colour. A lift and not a glow —
          the bars sit under the ring, which is the one thing on the screen
          that is allowed to give off light. */}
      <div className="bg-hairline h-3 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: macro.color,
            backgroundImage:
              'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%)',
            boxShadow: `0 2px 5px -2px ${macro.color}`,
            // Staggered so the three bars read as a sequence rather than one
            // three-part thing snapping at once.
            transition: `width var(--dur-spring) var(--ease-spring) ${index * 70}ms`,
          }}
        />
      </div>
    </div>
  );
}
