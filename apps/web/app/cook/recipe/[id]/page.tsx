'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Recipe } from '@ct/shared';
import { api } from '@/lib/api';
import { RecipeReader } from '@/components/kitchen/RecipeReader';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { foodEmoji } from '@/lib/foodEmoji';

/**
 * A recipe written for this person, on its own page.
 *
 * The same reader as the library's, given a different set of facts. This half
 * has no photograph and no source to credit, and instead has the two things the
 * library cannot have: per-ingredient macros, because the model priced every
 * line and the food entry is built from them, and a note of which lines are
 * already in the kitchen.
 *
 * `origin` is drawn rather than hidden. "Adapted from Baked Trout" and "your
 * recipe, as you gave it" earn different amounts of trust, and the numbers
 * underneath them were arrived at differently — which is exactly why migration
 * 013 started recording it.
 */

const ORIGIN_EYEBROW: Record<Recipe['origin'], string> = {
  invented: 'Made for your kitchen',
  adapted: 'Adapted for you',
  imported: 'Your own recipe',
};

const CONFIDENCE_NOTE: Record<Recipe['confidence'], string> = {
  high: 'The numbers here are as good as this app gets without weighing anything.',
  medium: 'The numbers are an estimate — close enough to log, worth a second look if it matters.',
  low: 'These numbers are a rough guess. Weigh what you can if the day is tight.',
};

export default function GeneratedRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [missing, setMissing] = useState(false);
  const [servings, setServings] = useState(1);
  const [saved, setSaved] = useState(false);
  const [cooking, setCooking] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .recipe(id)
      .then((r) => {
        if (!live) return;
        setRecipe(r);
        setSaved(r.saved);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [id]);

  async function cook() {
    if (!recipe) return;
    setCooking(true);
    try {
      const entry = await api.cookRecipe(recipe.id, { portions: servings });
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      router.push('/cook');
    } catch (e) {
      toast.error((e as Error).message);
      setCooking(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      await api.saveRecipe(id, next);
    } catch (e) {
      setSaved(!next);
      toast.error((e as Error).message);
    }
  }

  if (missing) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-16 text-center">
        <p className="text-body font-medium">That recipe isn&rsquo;t here any more.</p>
        <Link href="/cook" className="text-footnote mt-2 inline-block underline underline-offset-2">
          Back to Cook
        </Link>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 lg:px-6">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <Skeleton className="h-32 w-full rounded-[var(--radius)]" />
          <Skeleton className="h-10 w-2/3 rounded-full" />
          <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
        </div>
      </div>
    );
  }

  return (
    <RecipeReader
      backHref="/cook"
      backLabel="Cook"
      eyebrow={ORIGIN_EYEBROW[recipe.origin]}
      title={recipe.title}
      summary={recipe.summary}
      emoji={foodEmoji(recipe.title)}
      kcal={scale(recipe.kcal, servings)}
      protein_g={scale(recipe.protein_g, servings)}
      carbs_g={scale(recipe.carbs_g, servings)}
      fat_g={scale(recipe.fat_g, servings)}
      servingLabel={
        servings === 1 ? 'per portion' : `for ${formatServings(servings)} portions`
      }
      portions={recipe.portions}
      minutes={recipe.minutes}
      ingredients={recipe.ingredients.map((i) => ({
        text: i.name,
        amount:
          i.quantity_desc ?? (i.quantity_g === null ? null : `${Math.round(i.quantity_g)}g`),
        missing: i.missing,
      }))}
      steps={recipe.steps}
      saved={saved}
      onToggleSave={() => void toggleSaved()}
      footnote={
        <>
          {CONFIDENCE_NOTE[recipe.confidence]}
          {recipe.adapted_from && (
            <>
              {' '}
              <Link
                href={`/cook/library/${recipe.adapted_from}`}
                className="underline underline-offset-2"
              >
                See the original
              </Link>
              .
            </>
          )}
          {recipe.generated_for && (
            <>
              {' '}
              Written against the {Math.round(recipe.generated_for.kcal_remaining)} kcal you had
              left on {recipe.generated_for.local_date}.
            </>
          )}
        </>
      }
      actions={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Servings value={servings} onChange={setServings} unit="portion" className="sm:flex-1" />
          <Button
            onClick={() => void cook()}
            disabled={cooking}
            className="h-11 rounded-full px-6 sm:shrink-0"
          >
            {cooking ? 'Logging…' : `I ate this · ${Math.round(scale(recipe.kcal, servings))} kcal`}
          </Button>
        </div>
      }
    />
  );
}
