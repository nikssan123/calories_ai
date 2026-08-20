'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChefHat, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DaySummary, LibraryRecipe, PantryItem, Recipe } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Pantry } from '@/components/kitchen/Pantry';
import { LibraryCard } from '@/components/kitchen/LibraryCard';
import { RecipeCard } from '@/components/kitchen/RecipeCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Cook — what you could make, from what you have, that fits what is left.
 *
 * The three sections are in the order the decision actually happens: check the
 * kitchen is roughly right, ask, read the answers. The budget line under the
 * ask is doing more work than it looks like it is — it is the reason the
 * suggestions are any good, and saying it out loud is what separates this from
 * a recipe search that happens to live inside a food app.
 */
export default function CookPage() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [library, setLibrary] = useState<LibraryRecipe[] | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [message, setMessage] = useState('');
  const [wants, setWants] = useState('');
  const [thinking, setThinking] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [pantry, summary] = await Promise.all([api.pantry(), api.day()]);
      setItems(pantry.items);
      setDay(summary);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error((e as Error).message);
      setItems([]);
    }
  }, []);

  // Previously generated ideas, so the screen is not empty on a return visit
  // and a recipe someone saved is still there when they come back to cook it.
  const loadRecipes = useCallback(async () => {
    try {
      const { recipes } = await api.recipes({ limit: 6 });
      setRecipes(recipes);
    } catch {
      // Not worth a toast: the screen works without them, and whatever went
      // wrong will say so again the moment they ask for something new.
    }
  }, []);

  /**
   * The library is reloaded whenever the kitchen or the day changes, because its
   * whole order depends on both — a shelf that still says "uses your spinach"
   * after the spinach was deleted is worse than an unsorted one.
   */
  const loadLibrary = useCallback(async (search: string) => {
    try {
      const { recipes } = await api.library({ q: search || undefined, limit: 12 });
      setLibrary(recipes);
    } catch (e) {
      toast.error((e as Error).message);
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadRecipes();
  }, [load, loadRecipes]);

  useEffect(() => {
    const timer = setTimeout(() => void loadLibrary(librarySearch), librarySearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadLibrary, librarySearch, refreshKey]);

  const remaining = day
    ? {
        kcal: Math.max(0, Math.round(day.targets.kcal - day.consumed.kcal)),
        protein: Math.max(0, Math.round(day.targets.protein_g - day.consumed.protein_g)),
      }
    : null;

  async function suggest() {
    setThinking(true);
    try {
      const result = await api.suggestRecipes({ wants: wants.trim() || undefined });
      setRecipes(result.recipes);
      setMessage(result.message);
      setWants('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-2xl space-y-7">
        <h1 className="text-large-title">Cook</h1>

        {items === null ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : (
          <Pantry items={items} onChanged={load} />
        )}

        <InsetGroup title="What can I cook?">
          <div className="space-y-3 p-3">
            <Input
              value={wants}
              onChange={(e) => setWants(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !thinking) void suggest();
              }}
              placeholder="Anything in particular? (optional)"
              className="bg-muted/60 h-10 rounded-xl border-0 text-[15px]"
            />
            <Button
              onClick={() => void suggest()}
              disabled={thinking}
              className="h-11 w-full gap-2 rounded-xl"
            >
              {thinking ? <Loader2 size={16} className="animate-spin" /> : <ChefHat size={16} />}
              {thinking ? 'Thinking…' : 'Give me some ideas'}
            </Button>
            {remaining && (
              <p className="text-footnote text-muted-foreground text-center">
                {remaining.kcal === 0
                  ? "You're at your target for today — I'll keep it light."
                  : `I'll aim at the ${remaining.kcal} kcal and ${remaining.protein}g protein you have left.`}
              </p>
            )}
          </div>
        </InsetGroup>

        {message && <p className="text-muted-foreground px-1 text-[15px]">{message}</p>}

        {recipes.length > 0 && (
          <div className="space-y-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onCooked={() => {
                  // The day moved, so the budget line under the button has to.
                  void load();
                }}
              />
            ))}
          </div>
        )}

        {/*
          The cold start, and the reason this screen is worth opening on day
          one. Asking costs a model call and needs a stocked kitchen; these are
          here already, ordered by what you have and what is left of the day.
        */}
        <InsetGroup
          title="Ideas to start from"
          footer="Real recipes from the USDA's public-domain collection, sorted by how much of one you already have."
        >
          <div className="p-3">
            <Input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search the recipe library"
              className="bg-muted/60 h-10 rounded-xl border-0 text-[15px]"
            />
          </div>
        </InsetGroup>

        {library === null ? (
          <div className="space-y-3">
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : library.length === 0 ? (
          <p className="text-muted-foreground px-1 text-[15px]">
            Nothing matching &ldquo;{librarySearch}&rdquo;.
          </p>
        ) : (
          <div className="space-y-3">
            {library.map((recipe) => (
              <LibraryCard key={recipe.slug} recipe={recipe} onCooked={() => void load()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
