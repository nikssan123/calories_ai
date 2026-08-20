'use client';

import { useEffect, useRef, useState } from 'react';
import type { Nutrition, Targets } from '@ct/shared';
import { Confetti } from '@/components/Confetti';
import { cn } from '@/lib/utils';

/**
 * Protein, carbs, fat as three fat tracks.
 *
 * The bars are twice the weight they were, which is most of why they now read
 * as part of the same object as the ring above rather than as a legend printed
 * under it. Each carries a picture as well as a word, because three coloured
 * stubs with three short labels is exactly the arrangement a glance skips.
 *
 * Hitting a target throws confetti — once, in that macro's own colour, and only
 * on the crossing. This is the app's only celebration and it is on the macros
 * rather than on calories on purpose: "you have reached your protein" is
 * unambiguously good news, and "you have reached your calorie limit" is not the
 * sort of thing anybody wants a party for.
 */

const MACROS = [
  { key: 'protein_g', label: 'Protein', emoji: '💪', color: 'var(--protein)', text: 'var(--protein-text)' },
  { key: 'carbs_g', label: 'Carbs', emoji: '🌾', color: 'var(--carbs)', text: 'var(--carbs-text)' },
  { key: 'fat_g', label: 'Fat', emoji: '🥑', color: 'var(--fat)', text: 'var(--fat-text)' },
] as const;

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
        <span aria-hidden className="text-[13px] leading-none">
          {macro.emoji}
        </span>
        <span className="text-footnote text-muted-foreground truncate font-semibold">
          {macro.label}
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

      <div className="bg-muted border-border h-2.5 overflow-hidden rounded-full border">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: macro.color,
            // Staggered so the three bars read as a sequence rather than one
            // three-part thing snapping at once.
            transition: `width var(--dur-spring) var(--ease-spring) ${index * 70}ms`,
          }}
        />
      </div>
    </div>
  );
}
