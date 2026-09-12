'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, type LibraryRecipe, type PublicLibraryRecipe } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { StoreLinks } from '@/components/landing/StoreLinks';
import { RecipeReader } from '@/components/kitchen/RecipeReader';
import { formatServings, scale, Servings } from '@/components/kitchen/Servings';
import { Button } from '@/components/ui/button';
import { listWords } from '@ct/shared/words';
import { useLocale, useT } from '@/lib/i18n';

/**
 * One recipe from the starter library, on its own page.
 *
 * A route rather than an overlay, because these are the part of the app most
 * worth landing on directly: a URL that survives a reload, a back button that
 * does the obvious thing, and a page that prints.
 *
 * The recipe itself arrives as a prop, already fetched by the server component
 * next door, so the words are in the HTML before any JavaScript runs. What this
 * still fetches is the half that depends on who is asking — whether they saved
 * it, what of it is already in their kitchen — and that request is skipped
 * entirely for a visitor with no session, which is the state a crawler and a
 * first-time reader arrive in.
 */
export function RecipeClient({ recipe: initial }: { recipe: PublicLibraryRecipe }) {
  const slug = initial.slug;
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const { authenticated } = useAuth();

  const [personal, setPersonal] = useState<LibraryRecipe | null>(null);
  const [servings, setServings] = useState(1);
  const [saved, setSaved] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [adapting, setAdapting] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let live = true;
    api
      .libraryRecipe(slug)
      .then((r) => {
        if (!live) return;
        setPersonal(r);
        setSaved(r.saved);
      })
      /* The page is already readable without this. A failure here costs the
         save button and the "uses your..." line, not the recipe. */
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug, authenticated]);

  // Everything the reader came for comes from the server's copy; `personal`
  // only ever adds to it.
  const recipe = initial;
  const have = personal?.have ?? [];

  async function cook() {
    if (!recipe) return;
    setCooking(true);
    try {
      const entry = await api.cookLibraryRecipe(recipe.slug, { portions: servings });
      toast.success(
        t('recipe.logged')(entry.description, formatNumber(Math.round(entry.kcal), locale)),
      );
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
      if (!adapted) throw new Error(t('recipe.nothingCameBack'));
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

  const unit = recipe.serving_size ?? t('recipe.portion');

  return (
    <RecipeReader
      /* A signed-in cook came from the shelf and goes back to it. A reader who
         arrived from a search result has never seen the shelf and cannot open
         it — they go back to the index, which is the page above this one. */
      backHref={authenticated ? '/cook' : '/cook/library'}
      backLabel={authenticated ? t('cook.title') : t('recipe.allRecipes')}
      eyebrow={t('recipe.fromLibrary')}
      title={recipe.title}
      summary={recipe.summary}
      photo={recipe.image_path}
      kcal={scale(recipe.kcal, servings)}
      protein_g={scale(recipe.protein_g, servings)}
      carbs_g={scale(recipe.carbs_g, servings)}
      fat_g={scale(recipe.fat_g, servings)}
      servingLabel={
        servings === 1
          ? t('cook.per')(unit)
          : t('recipe.forServings')(formatServings(servings), unit)
      }
      portions={recipe.portions}
      ingredients={recipe.ingredients.map((i) => ({ text: i.text, note: i.note }))}
      /* Said out loud, because a reader who has just seen per-ingredient macros
         on a generated recipe will notice they are absent here and assume
         something is broken. */
      ingredientsNote={t('recipe.ingredientsNote')}
      steps={recipe.steps}
      saved={saved}
      onToggleSave={authenticated ? () => void toggleSaved() : undefined}
      footnote={
        <>
          {recipe.source} · {t('recipe.publicDomain')}
          {have.length > 0 && (
            <> · {t('recipe.usesYour')(listWords(have, locale)).toLocaleLowerCase(locale)}</>
          )}
        </>
      }
      actions={
        !authenticated ? (
          /*
             Nothing here works without an account — cooking writes an entry,
             adapting spends a model call, saving needs somewhere to save to. A
             reader who arrived from a search result is shown the way in
             instead of three buttons that would bounce them to a sign-in form.
          */
          <div className="flex flex-col gap-3">
            <p className="text-footnote text-muted-foreground">
              {t('recipe.logItWithApp')}
            </p>
            <StoreLinks />
          </div>
        ) : (
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
              {adapting ? t('recipe.reworking') : t('recipe.makeItFit')}
            </Button>
            <Button
              onClick={() => void cook()}
              disabled={cooking || adapting}
              className="h-11 flex-1 rounded-full px-5 sm:flex-none"
            >
              {cooking
                ? t('recipe.logging')
                : t('recipe.iAteThisPlain')(
                    formatNumber(Math.round(scale(recipe.kcal, servings)), locale),
                  )}
            </Button>
          </div>
        </div>
        )
      }
    />
  );
}
