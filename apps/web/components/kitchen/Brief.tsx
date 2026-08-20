'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Meal, RecipeBrief } from '@ct/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * What you need from the kitchen this time.
 *
 * Folded away by default, and that is the important part: the useful default is
 * still "just tell me what I could cook", and a screen that opens with six
 * empty fields asks people to specify things they do not care about before they
 * are allowed to see anything. Everything here is a refinement of an answer
 * they can already get by pressing the button.
 *
 * What you never eat is not here — it belongs on the profile, because it is
 * true of every meal and should not have to be restated each time.
 */

const MINUTES = [15, 30, 60] as const;
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function Brief({
  value,
  onChange,
}: {
  value: RecipeBrief;
  onChange: (next: RecipeBrief) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<RecipeBrief>) => onChange({ ...value, ...patch });

  // A count of what is actually constraining the answer, so a collapsed panel
  // never hides a setting someone forgot they left on.
  const active = [value.minutes, value.meal, value.portions, value.protein_min, value.kcal_max]
    .filter((v) => v !== null && v !== undefined)
    .length;

  return (
    <div className="border-border border-t-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-footnote text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-4 py-2.5"
      >
        <SlidersHorizontal size={13} />
        {open ? 'Hide' : 'Anything specific?'}
        {!open && active > 0 && (
          <span className="bg-secondary border-border rounded-full border px-2 py-0.5 text-[11px] font-bold">{active}</span>
        )}
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-3">
          <Row label="Time">
            {MINUTES.map((m) => (
              <Chip
                key={m}
                on={value.minutes === m}
                onClick={() => set({ minutes: value.minutes === m ? null : m })}
              >
                {m} min
              </Chip>
            ))}
          </Row>

          <Row label="Meal">
            {MEALS.map((m) => (
              <Chip
                key={m}
                on={value.meal === m}
                onClick={() => set({ meal: value.meal === m ? null : m })}
              >
                {m}
              </Chip>
            ))}
          </Row>

          {/* More than one portion is batch prep: the quantities scale and the
              macros stay per portion, so cooking four and eating one logs
              exactly what it logged before. */}
          <Row label="Cook">
            {[1, 2, 4].map((p) => (
              <Chip
                key={p}
                on={(value.portions ?? 1) === p}
                onClick={() => set({ portions: p === 1 ? null : p })}
              >
                {p === 1 ? 'just tonight' : `${p} portions`}
              </Chip>
            ))}
          </Row>

          <div className="flex gap-2">
            <Number
              label="Protein at least"
              suffix="g"
              value={value.protein_min ?? null}
              onChange={(n) => set({ protein_min: n })}
            />
            <Number
              label="Calories at most"
              suffix="kcal"
              value={value.kcal_max ?? null}
              onChange={(n) => set({ kcal_max: n })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-footnote text-muted-foreground mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'rounded-full px-3 py-1.5 text-footnote capitalize transition-colors',
        on
          ? 'bg-muted text-foreground ring-1 ring-[var(--calories-text)]'
          : 'bg-muted/40 text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Number({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className="flex-1">
      <span className="text-footnote text-muted-foreground mb-1.5 block">{label}</span>
      <div className="relative">
        <Input
          type="number"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => {
            const n = e.target.value === '' ? null : globalThis.Number(e.target.value);
            onChange(n === null || globalThis.Number.isNaN(n) ? null : n);
          }}
          placeholder="—"
          className="bg-muted/60 border-border h-11 rounded-full border-2 pr-12 pl-4 text-body"
        />
        <span className="text-footnote text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2">
          {suffix}
        </span>
      </div>
    </label>
  );
}
