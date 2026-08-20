'use client';

import { useState } from 'react';
import { Bookmark, ChevronDown, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Recipe } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { cn } from '@/lib/utils';

/**
 * One idea, as a card.
 *
 * The two things it has to get across before anything else are what it costs
 * against today and what you would have to go out for. Everything below the
 * fold — the method, the full ingredient list — is for someone who has already
 * decided, and a card that leads with a wall of steps buries the decision.
 */
export function RecipeCard({
  recipe,
  onCooked,
}: {
  recipe: Recipe;
  onCooked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(recipe.saved);
  const [cooking, setCooking] = useState(false);
  // Defaults to the whole dish. A generated recipe is usually written for one,
  // and when it is not, the person who asked for four portions meant to cook
  // four — how much of it they then eat is what the stepper is for.
  const [servings, setServings] = useState(1);

  const missing = recipe.ingredients.filter((i) => i.missing);

  const eaten = {
    kcal: scale(recipe.kcal, servings),
    protein_g: scale(recipe.protein_g, servings),
    carbs_g: scale(recipe.carbs_g, servings),
    fat_g: scale(recipe.fat_g, servings),
  };

  async function cook() {
    setCooking(true);
    try {
      const entry = await api.cookRecipe(recipe.id, { portions: servings });
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      onCooked();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCooking(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      await api.saveRecipe(recipe.id, next);
    } catch (e) {
      setSaved(!next);
      toast.error((e as Error).message);
    }
  }

  return (
    <article className="bg-card overflow-hidden rounded-[var(--radius)] shadow-[0_1px_2px_rgba(23,22,20,0.05)]">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px] leading-snug font-medium">{recipe.title}</h3>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void toggleSaved()}
            aria-pressed={saved}
            aria-label={saved ? 'Unsave this recipe' : 'Save this recipe'}
            className="text-muted-foreground -mt-1 size-8 shrink-0"
          >
            <Bookmark
              size={16}
              className={saved ? 'text-[var(--calories-text)]' : undefined}
              fill={saved ? 'currentColor' : 'none'}
            />
          </Button>
        </div>

        {recipe.summary && (
          <p className="text-muted-foreground mt-1 text-[14px] leading-snug">{recipe.summary}</p>
        )}

        <div className="text-footnote text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tnum text-foreground font-medium">{Math.round(eaten.kcal)} kcal</span>
          <Macro label="P" value={eaten.protein_g} color="var(--protein)" />
          <Macro label="C" value={eaten.carbs_g} color="var(--carbs)" />
          <Macro label="F" value={eaten.fat_g} color="var(--fat)" />
          <span>{servings === 1 ? 'per portion' : `for ${formatServings(servings)} portions`}</span>
          {recipe.minutes !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              {recipe.minutes} min
            </span>
          )}
          {recipe.portions > 1 && (
            <span className="inline-flex items-center gap-1">
              <Users size={11} />
              {recipe.portions} portions
            </span>
          )}
        </div>

        {/* Stated before the ingredient list, not inside it. "Two things you'd
            need to buy" is the whole decision for someone standing in their
            kitchen at seven; finding it halfway down a list is finding it too
            late. */}
        {missing.length > 0 && (
          <p className="text-footnote mt-2 text-[var(--fat)]">
            You&rsquo;d need: {missing.map((i) => i.name).join(', ')}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border text-footnote text-muted-foreground hover:text-foreground flex w-full items-center justify-between border-t px-4 py-2.5"
        aria-expanded={open}
      >
        {open ? 'Hide the method' : `How to make it · ${recipe.steps.length} steps`}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-border space-y-3 border-t px-4 py-3.5">
          <div>
            <p className="text-footnote text-muted-foreground font-semibold tracking-wide uppercase">
              Ingredients · makes {recipe.portions}
            </p>
            <ul className="mt-1.5 space-y-1">
              {recipe.ingredients.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-[15px]">
                  <span className={cn('min-w-0', item.missing && 'text-[var(--fat)]')}>
                    {item.name}
                  </span>
                  <span className="text-muted-foreground tnum text-footnote shrink-0 self-center">
                    {item.quantity_desc ??
                      (item.quantity_g === null ? '' : `${Math.round(item.quantity_g)}g`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ol className="space-y-2">
            {recipe.steps.map((step, index) => (
              <li key={index} className="flex gap-2.5 text-[15px] leading-snug">
                <span className="text-muted-foreground tnum text-footnote mt-0.5 shrink-0">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="border-border space-y-3 border-t p-3">
        <Servings value={servings} onChange={setServings} unit="portion" />
        <Button onClick={() => void cook()} disabled={cooking} className="h-10 w-full rounded-xl">
          {cooking ? 'Logging…' : `I ate this · ${Math.round(eaten.kcal)} kcal`}
        </Button>
      </div>
    </article>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="tnum inline-flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {Math.round(value)}g {label}
    </span>
  );
}
