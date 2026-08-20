'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChefHat, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DaySummary, LibraryRecipe, PantryItem, Recipe, RecipeBrief } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Pantry } from '@/components/kitchen/Pantry';
import { Brief } from '@/components/kitchen/Brief';
import { ImportRecipe } from '@/components/kitchen/ImportRecipe';
import { LibraryCard } from '@/components/kitchen/LibraryCard';
import { RecipeCard } from '@/components/kitchen/RecipeCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * Cook — what you could make, from what you have, that fits what is left.
 *
 * The order is still the order the decision happens in: check the kitchen is
 * roughly right, ask, read the answers. What changed is how much room the first
 * two are allowed to take.
 *
 * They used to be three stacked blocks of form — kitchen, ask, library search —
 * and on a laptop that was the entire first screen. You scrolled past three
 * things to type into before reaching the first thing to cook, which is exactly
 * backwards for a screen whose whole job is to answer a question. So the
 * kitchen folds to one line once it has anything in it, and the library's
 * search moved into the row that switches to the library, where it belongs.
 *
 * The answers are now one place rather than two piles. Generated ideas and the
 * shelf were stacked, so the shelf was an infinite tail below the ideas and you
 * could not get back past it; they are two tabs of one result area instead, in
 * a grid rather than a column, so a wide screen shows six recipes instead of
 * one and a half.
 *
 * The budget line under the ask is doing more work than it looks like it is —
 * it is the reason the suggestions are any good, and saying it out loud is what
 * separates this from a recipe search that happens to live inside a food app.
 */
export default function CookPage() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [library, setLibrary] = useState<LibraryRecipe[] | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [message, setMessage] = useState('');
  const [wants, setWants] = useState('');
  const [brief, setBrief] = useState<RecipeBrief>({});
  const [thinking, setThinking] = useState(false);
  /*
   * Which half of the answer is on screen. Starts on the shelf, because on a
   * first visit there is nothing else to show and an empty "For you" would be a
   * tab whose only content is an apology.
   */
  const [tab, setTab] = useState<'ideas' | 'library'>('library');

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
      // Something to come back to means "For you" is worth opening on.
      if (recipes.length > 0) setTab('ideas');
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
      const result = await api.suggestRecipes({ ...brief, wants: wants.trim() || undefined });
      setRecipes(result.recipes);
      setMessage(result.message);
      setWants('');
      setTab('ideas');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <h1 className="text-large-title">Cook</h1>

        {/* One line once there is anything in it — see <Pantry>. */}
        {items === null ? (
          <Skeleton className="h-16 w-full rounded-[var(--radius)]" />
        ) : (
          <Pantry items={items} onChanged={load} />
        )}

        {/* The ask. One row: what you fancy, and the button that answers. */}
        <InsetGroup>
          <div className="space-y-2.5 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={wants}
                onChange={(e) => setWants(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !thinking) void suggest();
                }}
                placeholder="Anything in particular? (optional)"
                className="bg-muted/60 border-border h-11 flex-1 rounded-full border-2 px-4 text-body"
              />
              <Button
                onClick={() => void suggest()}
                disabled={thinking}
                className="h-11 shrink-0 gap-2 rounded-full px-5 sm:w-auto"
              >
                {thinking ? <Loader2 size={16} className="animate-spin" /> : <ChefHat size={16} />}
                {thinking ? 'Thinking…' : 'Give me ideas'}
              </Button>
            </div>
            {remaining && (
              <p className="text-footnote text-muted-foreground font-medium">
                {remaining.kcal === 0
                  ? "You're at your target for today — I'll keep it light."
                  : `I'll aim at the ${remaining.kcal} kcal and ${remaining.protein}g protein you have left.`}
              </p>
            )}
          </div>

          <Brief value={brief} onChange={setBrief} />
          <ImportRecipe
            onImported={(recipe) => {
              setRecipes((prev) => [recipe, ...prev]);
              setMessage('');
              setTab('ideas');
              void load();
            }}
          />
        </InsetGroup>

        {/*
          The answers. Two tabs rather than two stacked lists: the shelf is a
          hundred recipes long, so underneath the ideas it was a tail you could
          never scroll back past.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            value={[tab]}
            onValueChange={(values) => {
              const next = values[0];
              if (next === 'ideas' || next === 'library') setTab(next);
            }}
            className="bg-card border-border chunk-sm rounded-full border-2 p-1"
          >
            <ToggleGroupItem
              value="ideas"
              className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
            >
              For you{recipes.length > 0 ? ` · ${recipes.length}` : ''}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="library"
              className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-8 rounded-full px-3.5 text-xs font-bold transition-colors"
            >
              Library
            </ToggleGroupItem>
          </ToggleGroup>

          {/* The shelf's own filter, in the row that switches to the shelf —
              rather than a third input block sitting above the page. */}
          {tab === 'library' && (
            <Input
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search the library"
              className="bg-card border-border h-10 w-full rounded-full border-2 px-4 text-body sm:w-64"
            />
          )}
        </div>

        {tab === 'ideas' ? (
          <>
            {message && <p className="text-muted-foreground px-1 text-body">{message}</p>}

            {recipes.length === 0 ? (
              <div className="py-12 text-center">
                <span aria-hidden className="animate-bob mb-3 block text-[40px] leading-none">
                  👩‍🍳
                </span>
                <p className="text-muted-foreground text-body font-medium">
                  Nothing yet. Ask above, and I&rsquo;ll work from what&rsquo;s in your kitchen.
                  <br />
                  Or take something off the shelf and make it fit you.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onCooked={() => {
                      // The day moved, so the budget line under the ask has to.
                      void load();
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : library === null ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
            <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
          </div>
        ) : library.length === 0 ? (
          <p className="text-muted-foreground px-1 py-8 text-center text-body font-medium">
            Nothing matching &ldquo;{librarySearch}&rdquo;.
          </p>
        ) : (
          <>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              {library.map((recipe) => (
                <LibraryCard
                  key={recipe.slug}
                  recipe={recipe}
                  onCooked={() => void load()}
                  onAdapted={(adapted, note) => {
                    setRecipes((prev) => [...adapted, ...prev]);
                    setMessage(note);
                    // The adaptation is the answer to a question just asked, so
                    // show it. A tab switch replaces the scroll gymnastics this
                    // used to need to get back up the page.
                    setTab('ideas');
                  }}
                />
              ))}
            </div>
            <p className="text-footnote text-muted-foreground px-1 font-medium">
              Real recipes from the USDA&rsquo;s public-domain collection, sorted by how much of
              one you already have.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
