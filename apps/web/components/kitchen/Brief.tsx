'use client';

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

/**
 * How many fields are actually constraining the answer.
 *
 * `wants` counts, and that matters more than the other five: it is the only one
 * that persists as a *sentence* rather than a chip, so a craving typed on
 * Tuesday would otherwise still be steering Friday's dinner with nothing on
 * screen to say so. The badge on the shut panel is the whole safeguard.
 */
export function briefCount(value: RecipeBrief): number {
  return [
    value.wants?.trim() ? value.wants : null,
    value.minutes,
    value.meal,
    value.portions,
    value.protein_min,
    value.kcal_max,
  ].filter((v) => v !== null && v !== undefined && v !== '').length;
}

/**
 * The trigger, split out so it can sit on the end of the budget line.
 *
 * That pairing is deliberate: "here is the number I am aiming at" and "change
 * what I aim at" are the same thought, and on its own row the toggle was one
 * more full-width thing to scroll past. The count rides along so a shut panel
 * never hides a setting somebody forgot they left on.
 */
export function BriefToggle({
  value,
  open,
  onToggle,
}: {
  value: RecipeBrief;
  open: boolean;
  onToggle: () => void;
}) {
  const active = briefCount(value);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="text-footnote text-muted-foreground hover:text-foreground hover:bg-muted/60 -mr-1 flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-medium transition-colors"
    >
      <SlidersHorizontal size={13} />
      {open ? 'Hide' : 'Anything specific?'}
      {!open && active > 0 && (
        <span className="bg-secondary border-border rounded-full border px-1.5 text-[11px] font-bold">
          {active}
        </span>
      )}
    </button>
  );
}

export function Brief({
  value,
  onChange,
}: {
  value: RecipeBrief;
  onChange: (next: RecipeBrief) => void;
}) {
  const set = (patch: Partial<RecipeBrief>) => onChange({ ...value, ...patch });

  return (
    <div className="border-border border-t-2">
        <div className="space-y-3 px-4 py-3">
          {/*
            The free-text steer, and the reason it is in here rather than on the
            page. It used to be a pill at the top of the screen next to the
            button, where it read as a second search box that nobody could
            explain the purpose of — it overlapped with these five fields while
            being the only one of the six with no visible examples. In here its
            job is obvious from its company: it is the row for the constraints
            that were never going to be an enum. "One-pan" is not a slider.
          */}
          <div>
            <label
              htmlFor="brief-wants"
              className="text-footnote text-muted-foreground mb-1.5 block"
            >
              Anything else?
            </label>
            <Input
              id="brief-wants"
              value={value.wants ?? ''}
              onChange={(e) => set({ wants: e.target.value || undefined })}
              placeholder={'"one-pan", "use up the spinach", "no coriander"'}
              maxLength={300}
              className="bg-muted/60 border-border h-11 rounded-xl border-2 px-3 text-body"
            />
          </div>

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
