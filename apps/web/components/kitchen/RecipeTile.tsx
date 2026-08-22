'use client';

import Link from 'next/link';
import { Bookmark, Check, Clock, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listWords } from '@ct/shared/words';

/**
 * One recipe, as something to choose between.
 *
 * What this replaces was three things wearing one coat: a tile to browse, a
 * reader to cook from, and a form to log with, stacked as four bordered strips
 * under the photograph. Only the first of those is a job a grid of twelve is
 * any good at, so it is the only one left here — the picture, what the dish
 * actually is, what it costs against today, and the line about your own kitchen
 * that no recipe site could print. The method moved to its own page, where ten
 * steps can be ten steps instead of a half-width column that shoved the tile
 * next to it halfway down the screen every time somebody got curious.
 *
 * Three things are on the tile now that were not on the card:
 *
 *   summary       The one line that says what the dish is. It was inside the
 *                 accordion, which meant "Full of Beans Hot Dish" told you
 *                 nothing at all until you opened it — on a tile whose whole
 *                 purpose is choosing, that is the wrong sentence to hide.
 *   fits_today    Already computed for every recipe on every request and drawn
 *                 nowhere. It is the most app-specific fact available: a recipe
 *                 site can tell you a dish is 343 kcal, only this can tell you
 *                 the 343 still fits.
 *   the figure    The kcal was one of five equal-weight items on a 13px line.
 *                 It is the number people are choosing on, so it is set as one.
 *
 * The whole surface is the link, laid over the content rather than wrapped
 * around it: an anchor cannot legally contain the bookmark button, and one that
 * covers only the title makes people aim at four words.
 */
export function RecipeTile({
  href,
  title,
  summary,
  kcal,
  protein_g,
  servingLabel,
  photo,
  emoji,
  fitsToday,
  have,
  needs,
  minutes,
  steps,
  saved,
  onToggleSave,
}: {
  href: string;
  title: string;
  summary: string | null;
  /** Per serving, as the tile prints it. */
  kcal: number;
  protein_g: number;
  /** What one of them is: "per portion", "per 1/8 of recipe". */
  servingLabel: string;
  /**
   * Only the library has these. A generated recipe has never been cooked by
   * anybody, so there is nothing to photograph, and inventing a picture for it
   * would be the first thing in the app that was not true.
   */
  photo?: string | null;
  /** Stands in for the photograph, and is obviously not one. */
  emoji?: string;
  /** Whether one serving fits what is left of today. Omitted where it is not known. */
  fitsToday?: boolean;
  /** Pantry items this would use — the sentence the tile most wants to say. */
  have?: string[];
  /** What you would have to go out for. */
  needs?: string[];
  minutes?: number | null;
  steps: number;
  saved: boolean;
  onToggleSave: () => void;
}) {
  return (
    <article
      className={cn(
        'bg-card border-border chunk group relative flex flex-col overflow-hidden rounded-[var(--radius)] border-2',
        'transition-transform duration-150 hover:-translate-y-0.5 focus-within:-translate-y-0.5',
      )}
    >
      {photo ? (
        <div className="bg-muted aspect-[16/10] w-full overflow-hidden">
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      ) : (
        /* The honest stand-in. A flat band with one big glyph reads as a label,
           not as a photograph nobody took — and it keeps both tabs on the same
           grid rhythm, which a photo-less card of a different height would not. */
        <div className="bg-muted/60 border-border flex aspect-[16/10] w-full items-center justify-center border-b-2">
          <span aria-hidden className="text-[44px] leading-none opacity-90">
            {emoji ?? '🍳'}
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pt-3 pb-3.5">
        <h3 className="font-[family-name:var(--font-display)] text-[17px] leading-snug font-extrabold">
          {title}
        </h3>

        {summary && (
          <p className="text-muted-foreground line-clamp-2 text-body leading-snug">{summary}</p>
        )}

        {/* The figure, and then everything that qualifies it. */}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-figure text-[21px] leading-none">{Math.round(kcal)}</span>
          <span className="text-footnote text-muted-foreground">
            kcal · {Math.round(protein_g)}g protein · {servingLabel}
          </span>
        </div>

        {/* Pushed to the bottom so tiles of different text lengths still line
            their last line up with each other across a row. */}
        <div className="mt-auto space-y-1 pt-1.5">
          {fitsToday && (
            <p className="text-footnote inline-flex items-center gap-1 font-semibold text-[var(--calories-text)]">
              <Check size={13} strokeWidth={3} />
              Fits what&rsquo;s left of today
            </p>
          )}

          {have && have.length > 0 && (
            <p className="text-footnote line-clamp-1 text-[var(--calories-text)]">
              Uses your {listWords(have)}
            </p>
          )}

          {needs && needs.length > 0 && (
            <p className="text-footnote line-clamp-1 text-[var(--fat-text)]">
              You&rsquo;d need {listWords(needs)}
            </p>
          )}

          <div className="text-footnote text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            {typeof minutes === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {minutes} min
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <UtensilsCrossed size={11} />
              {steps} {steps === 1 ? 'step' : 'steps'}
            </span>
          </div>
        </div>
      </div>

      {/* Over the content, under the bookmark. `focus-visible` gets a ring on
          the tile itself rather than on a rectangle nobody can see. */}
      <Link
        href={href}
        className="absolute inset-0 z-10 rounded-[calc(var(--radius)-2px)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
      >
        <span className="sr-only">{title}</span>
      </Link>

      <button
        type="button"
        onClick={onToggleSave}
        aria-pressed={saved}
        aria-label={saved ? `Unsave ${title}` : `Save ${title}`}
        className={cn(
          'absolute top-2.5 right-2.5 z-20 flex size-9 items-center justify-center rounded-full',
          photo ? 'material backdrop-blur' : 'bg-card border-border border-2',
        )}
      >
        <Bookmark
          size={15}
          className={saved ? 'text-[var(--calories-text)]' : 'text-muted-foreground'}
          fill={saved ? 'currentColor' : 'none'}
        />
      </button>
    </article>
  );
}
