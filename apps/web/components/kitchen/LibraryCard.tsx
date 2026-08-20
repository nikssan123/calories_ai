'use client';

import { useState } from 'react';
import { Bookmark, ChevronDown, Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { LibraryRecipe, Recipe } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { cn } from '@/lib/utils';

/**
 * A recipe from the starter library.
 *
 * It gets a photograph where a generated recipe does not, and that asymmetry is
 * honest rather than decorative: these are real dishes somebody cooked and
 * photographed, and a generated one has never existed. Faking a picture for the
 * generated half would be the app's first lie.
 *
 * The line that matters most is `have` — "uses your chicken, garlic and
 * spinach". It is the only thing on this card a recipe website could not print,
 * and it is why the shelf is in this order.
 */
export function LibraryCard({
  recipe,
  onCooked,
  onAdapted,
}: {
  recipe: LibraryRecipe;
  onCooked: () => void;
  /** Hands back the reworked recipe, which belongs to the user rather than here. */
  onAdapted: (recipes: Recipe[], message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(recipe.saved);
  const [cooking, setCooking] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [servings, setServings] = useState(1);

  // The published figures are per serving, so everything on the card is one
  // multiplication away from what this person is about to eat.
  const eaten = {
    kcal: scale(recipe.kcal, servings),
    protein_g: scale(recipe.protein_g, servings),
    carbs_g: scale(recipe.carbs_g, servings),
    fat_g: scale(recipe.fat_g, servings),
  };

  async function cook() {
    setCooking(true);
    try {
      const entry = await api.cookLibraryRecipe(recipe.slug, { portions: servings });
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      onCooked();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCooking(false);
    }
  }

  async function adapt() {
    setAdapting(true);
    try {
      const { recipes, message } = await api.adaptLibraryRecipe(recipe.slug);
      onAdapted(recipes, message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdapting(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      await api.saveLibraryRecipe(recipe.slug, next);
    } catch (e) {
      setSaved(!next);
      toast.error((e as Error).message);
    }
  }

  return (
    <article className="bg-card overflow-hidden rounded-[var(--radius)] border-border chunk border-2">
      {recipe.image_path && (
        <div className="bg-muted relative aspect-[16/10] w-full">
          <img
            src={recipe.image_path}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void toggleSaved()}
            aria-pressed={saved}
            aria-label={saved ? 'Unsave this recipe' : 'Save this recipe'}
            className="material absolute top-2 right-2 size-8 rounded-full backdrop-blur"
          >
            <Bookmark
              size={15}
              className={saved ? 'text-[var(--calories-text)]' : undefined}
              fill={saved ? 'currentColor' : 'none'}
            />
          </Button>
        </div>
      )}

      <div className="px-4 pt-3.5 pb-3">
        <h3 className="font-[family-name:var(--font-display)] text-[18px] leading-snug font-extrabold">{recipe.title}</h3>

        <div className="text-footnote text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-figure text-foreground">{Math.round(eaten.kcal)} kcal</span>
          <Macro label="P" value={eaten.protein_g} color="var(--protein)" />
          <Macro label="C" value={eaten.carbs_g} color="var(--carbs)" />
          <Macro label="F" value={eaten.fat_g} color="var(--fat)" />
          <span>
            {servings === 1
              ? `per ${recipe.serving_size ?? 'portion'}`
              : `for ${formatServings(servings)} × ${recipe.serving_size ?? 'portion'}`}
          </span>
        </div>

        {/* The whole reason this list is in this order. */}
        {recipe.have.length > 0 && (
          <p className="text-footnote mt-2 text-[var(--calories-text)]">
            Uses your {listWords(recipe.have)}
          </p>
        )}
        {recipe.missing > 0 && (
          <p className="text-footnote text-muted-foreground mt-0.5">
            {recipe.missing} other {recipe.missing === 1 ? 'ingredient' : 'ingredients'} to check
            for
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border text-footnote text-muted-foreground hover:text-foreground flex w-full items-center justify-between border-t-2 px-4 py-2.5"
        aria-expanded={open}
      >
        {open ? 'Hide the recipe' : `How to make it · ${recipe.steps.length} steps`}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-border space-y-3 border-t-2 px-4 py-3.5">
          {recipe.summary && (
            <p className="text-muted-foreground text-body leading-snug">{recipe.summary}</p>
          )}

          <div>
            <p className="text-eyebrow text-muted-foreground">
              Ingredients · makes {recipe.portions}
            </p>
            <ul className="mt-1.5 space-y-1">
              {recipe.ingredients.map((item, index) => (
                <li key={index} className="text-body leading-snug">
                  {item.text}
                  {item.note && <span className="text-muted-foreground"> ({item.note})</span>}
                </li>
              ))}
            </ul>
          </div>

          <ol className="space-y-2">
            {recipe.steps.map((step, index) => (
              <li key={index} className="flex gap-2.5 text-body leading-snug">
                <span className="text-muted-foreground tnum text-footnote mt-0.5 shrink-0">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Public domain needs no permission, but saying where a recipe came
              from is the difference between using it and passing it off. */}
          <p className="text-footnote text-muted-foreground border-border border-t pt-3">
            {recipe.source_url ? (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {recipe.source}
              </a>
            ) : (
              recipe.source
            )}{' '}
            · public domain
          </p>
        </div>
      )}

      <div className="border-border space-y-3 border-t-2 p-3">
        <Servings
          value={servings}
          onChange={setServings}
          unit={recipe.serving_size ?? 'portion'}
        />
        <div className="flex gap-2">
          {/* Secondary, because most of the time the recipe is fine as written
              and the adaptation costs a model call. It earns its place next to
              the log button rather than above it. */}
          <Button
            variant="secondary"
            onClick={() => void adapt()}
            disabled={adapting}
            className="h-10 flex-1 gap-1.5 rounded-xl"
          >
            {adapting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Wand2 size={15} />
            )}
            {adapting ? 'Reworking…' : 'Make it fit me'}
          </Button>
          <Button
            onClick={() => void cook()}
            disabled={cooking}
            className="h-10 flex-1 rounded-xl"
          >
            {cooking ? 'Logging…' : `I ate this · ${Math.round(eaten.kcal)}`}
          </Button>
        </div>
      </div>
    </article>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="tnum inline-flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {Math.round(value)}g {label}
    </span>
  );
}

/** "chicken, garlic and spinach" — a sentence, not a comma-separated list. */
function listWords(items: string[]): string {
  const lower = items.map((i) => i.toLowerCase());
  if (lower.length === 1) return lower[0]!;
  if (lower.length === 2) return `${lower[0]} and ${lower[1]}`;
  return `${lower.slice(0, -1).join(', ')} and ${lower.at(-1)}`;
}
