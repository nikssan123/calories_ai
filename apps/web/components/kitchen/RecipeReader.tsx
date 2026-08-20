'use client';

import Link from 'next/link';
import { ArrowLeft, Bookmark, Check, Clock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A recipe, laid out to be cooked from.
 *
 * The method used to live in an accordion inside a tile in a two-column grid,
 * which gave ten steps a column about forty characters wide and made the tile
 * beside it jump every time one opened. That is the wrong container for the
 * only part of a recipe anyone reads twice. Here it gets a page: the
 * ingredients in a column you can check against the counter, the steps in
 * numbered blocks big enough to find your place in with wet hands, and the
 * actions pinned to the bottom so "I ate this" is reachable from step nine
 * without scrolling back up.
 *
 * Both kinds of recipe come through here. What differs between them is real and
 * is not smoothed over: the library has a photograph and a source to credit, a
 * generated one has neither but knows which of its ingredients are already in
 * your kitchen. Each passes what it has; the shell draws what it is given.
 */

/** One line of the list, normalised from either kind of recipe. */
export type ReaderIngredient = {
  /** The food, as the cook reads it. */
  text: string;
  /** The quantity, when it is a column of its own rather than part of the line. */
  amount?: string | null;
  /** The source's parenthetical — "thawed", "about 2 cups". */
  note?: string | null;
  /** Generated recipes only: this one is not in the kitchen. */
  missing?: boolean;
};

export function RecipeReader({
  backHref,
  backLabel,
  eyebrow,
  title,
  summary,
  photo,
  emoji,
  kcal,
  protein_g,
  carbs_g,
  fat_g,
  servingLabel,
  portions,
  minutes,
  ingredients,
  ingredientsNote,
  steps,
  footnote,
  saved,
  onToggleSave,
  actions,
}: {
  backHref: string;
  backLabel: string;
  /** "From the library", "Made for you" — which kind of thing this is. */
  eyebrow: string;
  title: string;
  summary: string | null;
  photo?: string | null;
  emoji?: string;
  /** Already scaled to the servings the page is showing. */
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  servingLabel: string;
  portions: number;
  minutes?: number | null;
  ingredients: ReaderIngredient[];
  /** Why the list looks the way it does, where that needs saying. */
  ingredientsNote?: string;
  steps: string[];
  /** Attribution, provenance, whatever has to travel with the recipe. */
  footnote?: React.ReactNode;
  saved: boolean;
  onToggleSave: () => void;
  /** The servings stepper and the buttons, pinned to the bottom of the page. */
  actions: React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-8 lg:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link
            href={backHref}
            className="text-footnote text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1.5 rounded-full px-1 py-1 font-semibold"
          >
            <ArrowLeft size={15} />
            {backLabel}
          </Link>

          <button
            type="button"
            onClick={onToggleSave}
            aria-pressed={saved}
            aria-label={saved ? 'Unsave this recipe' : 'Save this recipe'}
            className="bg-card border-border chunk-sm text-footnote inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3.5 font-semibold"
          >
            <Bookmark
              size={14}
              className={saved ? 'text-[var(--calories-text)]' : 'text-muted-foreground'}
              fill={saved ? 'currentColor' : 'none'}
            />
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        {/*
          Photograph beside the heading rather than above it. Full-bleed, it was
          the entire first screen of a laptop: you arrived at a recipe page and
          could see no part of the recipe. Alongside, the picture is still the
          first thing the eye lands on, and the title, the summary and what it
          costs are above the fold with it. On a phone there is one column
          anyway, and the photo comes first, which is the right order there.
        */}
        <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
          {photo ? (
            <div className="bg-muted border-border chunk aspect-[4/3] overflow-hidden rounded-[var(--radius)] border-2 lg:col-span-2">
              <img src={photo} alt={title} className="h-full w-full object-cover" />
            </div>
          ) : (
            emoji && (
              <div className="bg-muted/60 border-border chunk flex aspect-[4/3] items-center justify-center rounded-[var(--radius)] border-2 lg:col-span-2">
                <span aria-hidden className="text-[96px] leading-none opacity-90">
                  {emoji}
                </span>
              </div>
            )
          )}

          <div className="lg:col-span-3">
            <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
            <h1 className="text-large-title mt-1.5">{title}</h1>
            {summary && (
              <p className="text-muted-foreground mt-2 text-body leading-relaxed">{summary}</p>
            )}

            <div className="text-footnote text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} />
                Makes {portions} {portions === 1 ? 'portion' : 'portions'}
              </span>
              {typeof minutes === 'number' && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} />
                  {minutes} min
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} />
                {steps.length} {steps.length === 1 ? 'step' : 'steps'}
              </span>
            </div>

            {/* What it costs, at the size the decision deserves. */}
            <div className="bg-card border-border chunk mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-[var(--radius)] border-2 px-4 py-3.5">
              <div>
                <p className="text-figure text-[34px] leading-none">{Math.round(kcal)}</p>
                <p className="text-footnote text-muted-foreground mt-1">kcal · {servingLabel}</p>
              </div>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                <Macro label="Protein" value={protein_g} color="var(--protein)" />
                <Macro label="Carbs" value={carbs_g} color="var(--carbs)" />
                <Macro label="Fat" value={fat_g} color="var(--fat)" />
              </div>
            </div>
          </div>
        </div>

        {/*
          Ingredients beside the method rather than above it, so a wide screen
          can hold both at once — the two things a cook alternates between are
          the two things that should not need a scroll to get from one to the
          other. On a phone they stack, list first, which is the order you need
          them in.
        */}
        <div className="mt-5 grid gap-5 lg:grid-cols-5 lg:items-start">
          {/* Pinned on a wide screen: the method is longer than the list, and
              the thing a cook looks back at mid-step is the list. */}
          <section className="lg:sticky lg:top-2 lg:col-span-2">
            <h2 className="text-eyebrow text-muted-foreground px-1">Ingredients</h2>
            <ul className="bg-card border-border divide-border chunk mt-2 divide-y-2 overflow-hidden rounded-[var(--radius)] border-2">
              {ingredients.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 text-body leading-snug"
                >
                  <span className={cn('min-w-0', item.missing && 'text-[var(--fat-text)]')}>
                    {item.text}
                    {item.note && <span className="text-muted-foreground"> ({item.note})</span>}
                    {item.missing && (
                      <span className="text-footnote text-[var(--fat-text)]"> · not in your kitchen</span>
                    )}
                  </span>
                  {item.amount && (
                    <span className="text-muted-foreground tnum text-footnote shrink-0 pt-0.5">
                      {item.amount}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {ingredientsNote && (
              <p className="text-footnote text-muted-foreground mt-2 px-1 leading-snug">
                {ingredientsNote}
              </p>
            )}
          </section>

          <section className="lg:col-span-3">
            <h2 className="text-eyebrow text-muted-foreground px-1">Method</h2>
            <ol className="mt-2 space-y-2.5">
              {steps.map((step, index) => (
                <li
                  key={index}
                  className="bg-card border-border chunk flex gap-3.5 rounded-[var(--radius)] border-2 px-4 py-3.5"
                >
                  {/* Numbered as an object rather than a superscript: this is
                      the thing you look back at the page to find again. */}
                  <span
                    aria-hidden
                    className="bg-muted text-figure border-border flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[15px]"
                  >
                    {index + 1}
                  </span>
                  <span className="text-body leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {footnote && (
          <p className="text-footnote text-muted-foreground border-border mt-6 border-t-2 pt-4">
            {footnote}
          </p>
        )}
      </div>

      {/* Pinned, because the decision to log is made at the end of the method
          and the method is longer than a screen. */}
      <div className="material border-border sticky bottom-0 z-20 border-t-2">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 lg:px-6">{actions}</div>
      </div>
    </div>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className="text-figure text-[19px] leading-none">
        <span
          aria-hidden
          className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
          style={{ background: color }}
        />
        {Math.round(value)}g
      </p>
      <p className="text-footnote text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
