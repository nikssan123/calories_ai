'use client';

import { SlidersHorizontal } from 'lucide-react';
import type { Meal, RecipeBrief } from '@ct/shared';
import { Input } from '@/components/ui/input';
import { useT, type StringKey } from '@/lib/i18n';
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
 *
 * Shown in a dialog, like everything else on Cook that needs a form. It grew in
 * place for a while, which meant the page had to carry a bordered card around
 * the one button it belonged to, just so the panel had something to unfold
 * inside. A box that exists to hold a box is the kind of chrome nobody asks for
 * and everybody feels.
 */

const MINUTES = [15, 30, 60] as const;
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * The chips are the meals, so they are the meal headings the rest of the app
 * already says. Held as keys rather than resolved here because the row is drawn
 * from `MEALS`, and a table of keys is the shape `StringKey` exists to check.
 */
const MEAL_KEYS: Record<Meal, StringKey> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
  snack: 'meal.snack',
};

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
 * The trigger, which sits next to the button it modifies.
 *
 * That pairing is deliberate: "find me something" and "but like this" are the
 * same thought. The count rides along so a shut panel never hides a setting
 * somebody forgot they left on.
 */
export function BriefToggle({
  value,
  onClick,
}: {
  value: RecipeBrief;
  onClick: () => void;
}) {
  const t = useT();
  const active = briefCount(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-footnote text-muted-foreground hover:text-foreground hover:bg-muted/60 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium transition-colors"
    >
      <SlidersHorizontal size={13} />
      {t('cook.anythingSpecific')}
      {active > 0 && (
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
  const t = useT();
  const set = (patch: Partial<RecipeBrief>) => onChange({ ...value, ...patch });

  return (
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
              {t('brief.anythingElse')}
            </label>
            <Input
              id="brief-wants"
              value={value.wants ?? ''}
              onChange={(e) => set({ wants: e.target.value || undefined })}
              placeholder={t('brief.wantsPlaceholder')}
              maxLength={300}
              className="bg-muted/60 border-border h-11 rounded-xl border-2 px-3 text-body"
            />
          </div>

          <Row label={t('brief.time')}>
            {MINUTES.map((m) => (
              <Chip
                key={m}
                on={value.minutes === m}
                onClick={() => set({ minutes: value.minutes === m ? null : m })}
              >
                {t('brief.minutes')(m)}
              </Chip>
            ))}
          </Row>

          <Row label={t('brief.meal')}>
            {MEALS.map((m) => (
              <Chip
                key={m}
                on={value.meal === m}
                onClick={() => set({ meal: value.meal === m ? null : m })}
              >
                {t(MEAL_KEYS[m])}
              </Chip>
            ))}
          </Row>

          {/* More than one portion is batch prep: the quantities scale and the
              macros stay per portion, so cooking four and eating one logs
              exactly what it logged before. */}
          <Row label={t('brief.cook')}>
            {[1, 2, 4].map((p) => (
              <Chip
                key={p}
                on={(value.portions ?? 1) === p}
                onClick={() => set({ portions: p === 1 ? null : p })}
              >
                {p === 1 ? t('brief.justTonight') : t('brief.portions')(p)}
              </Chip>
            ))}
          </Row>

          <div className="flex gap-2">
            <Number
              label={t('brief.proteinAtLeast')}
              suffix="g"
              value={value.protein_min ?? null}
              onChange={(n) => set({ protein_min: n })}
            />
            <Number
              label={t('brief.caloriesAtMost')}
              suffix="kcal"
              value={value.kcal_max ?? null}
              onChange={(n) => set({ kcal_max: n })}
            />
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
