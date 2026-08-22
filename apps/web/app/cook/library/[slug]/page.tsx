'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { LibraryRecipe } from '@ct/shared';
import { api } from '@/lib/api';
import { RecipeReader } from '@/components/kitchen/RecipeReader';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listWords } from '@/lib/utils';

/**
 * One recipe from the starter library, on its own page.
 *
 * A route rather than an overlay, because these are the part of the app most
 * worth landing on directly: a URL that survives a reload, a back button that
 * does the obvious thing, and a page that prints. `GET /library/:slug` has
 * existed since the library shipped and nothing had ever called it.
 */
export default function LibraryRecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [recipe, setRecipe] = useState<LibraryRecipe | null>(null);
  const [missing, setMissing] = useState(false);
  const [servings, setServings] = useState(1);
  const [saved, setSaved] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [adapting, setAdapting] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .libraryRecipe(slug)
      .then((r) => {
        if (!live) return;
        setRecipe(r);
        setSaved(r.saved);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [slug]);

  async function cook() {
    if (!recipe) return;
    setCooking(true);
    try {
      const entry = await api.cookLibraryRecipe(recipe.slug, { portions: servings });
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      // Back to the shelf, which re-ranks itself against the day that just
      // moved. Staying here would leave the button that was just pressed
      // sitting under the thumb, inviting a double log.
      router.push('/cook');
    } catch (e) {
      toast.error((e as Error).message);
      setCooking(false);
    }
  }

  async function adapt() {
    if (!recipe) return;
    setAdapting(true);
    try {
      const { recipes, message } = await api.adaptLibraryRecipe(recipe.slug);
      const [adapted] = recipes;
      if (!adapted) throw new Error('Nothing came back from that.');
      if (message) toast.success(message);
      // Straight to the rework. The old card dropped it into a tab behind you
      // and left you to find it.
      router.push(`/cook/recipe/${adapted.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setAdapting(false);
    }
  }

  async function toggleSaved() {
    const next = !saved;
    setSaved(next);
    try {
      await api.saveLibraryRecipe(slug, next);
    } catch (e) {
      setSaved(!next);
      toast.error((e as Error).message);
    }
  }

  if (missing) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-16 text-center">
        <p className="text-body font-medium">That recipe isn&rsquo;t in the library.</p>
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
          <Skeleton className="h-60 w-full rounded-[var(--radius)]" />
          <Skeleton className="h-10 w-2/3 rounded-full" />
          <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
        </div>
      </div>
    );
  }

  const unit = recipe.serving_size ?? 'portion';

  return (
    <RecipeReader
      backHref="/cook"
      backLabel="Cook"
      eyebrow="From the library"
      title={recipe.title}
      summary={recipe.summary}
      photo={recipe.image_path}
      kcal={scale(recipe.kcal, servings)}
      protein_g={scale(recipe.protein_g, servings)}
      carbs_g={scale(recipe.carbs_g, servings)}
      fat_g={scale(recipe.fat_g, servings)}
      servingLabel={
        servings === 1 ? `per ${unit}` : `for ${formatServings(servings)} × ${unit}`
      }
      portions={recipe.portions}
      ingredients={recipe.ingredients.map((i) => ({ text: i.text, note: i.note }))}
      /* Said out loud, because a reader who has just seen per-ingredient macros
         on a generated recipe will notice they are absent here and assume
         something is broken. */
      ingredientsNote="Measured for the finished dish, as published — so there are no per-ingredient numbers to show."
      steps={recipe.steps}
      saved={saved}
      onToggleSave={() => void toggleSaved()}
      footnote={
        <>
          {recipe.source} · public domain
          {recipe.have.length > 0 && <> · uses your {listWords(recipe.have)}</>}
        </>
      }
      actions={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Servings
            value={servings}
            onChange={setServings}
            unit={unit}
            className="sm:flex-1"
          />
          <div className="flex gap-2 sm:shrink-0">
            <Button
              variant="secondary"
              onClick={() => void adapt()}
              disabled={adapting || cooking}
              className="h-11 flex-1 gap-1.5 rounded-full px-4 sm:flex-none"
            >
              {adapting ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {adapting ? 'Reworking…' : 'Make it fit me'}
            </Button>
            <Button
              onClick={() => void cook()}
              disabled={cooking || adapting}
              className="h-11 flex-1 rounded-full px-5 sm:flex-none"
            >
              {cooking ? 'Logging…' : `I ate this · ${Math.round(scale(recipe.kcal, servings))}`}
            </Button>
          </div>
        </div>
      }
    />
  );
}
