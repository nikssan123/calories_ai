'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { DaySummary, LibraryRecipe, PantryItem, Recipe, RecipeBrief } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Pantry, daysSince, STALE_DAYS } from '@/components/kitchen/Pantry';
import { FridgeScan } from '@/components/kitchen/FridgeScan';
import { ChipDot, chipClass } from '@/components/kitchen/ActionChip';
import { Brief, BriefToggle } from '@/components/kitchen/Brief';
import { ImportRecipe } from '@/components/kitchen/ImportRecipe';
import { RecipeTile } from '@/components/kitchen/RecipeTile';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { foodEmoji } from '@/lib/foodEmoji';
import { cn, listWords } from '@/lib/utils';

/**
 * Cook — what you could make, from what you have, that fits what is left.
 *
 * # The page is the recipes
 *
 * Everything above the grid is a control, and controls had eaten the screen.
 * At its worst this page opened with a kitchen card (heading, text input, add
 * button, camera, empty state, footer), then an ask card (heading, text input,
 * budget line, filter row, three action rows with titles and chevrons and a
 * paste form that expanded in place), then a week row — and on a large desktop
 * display not one recipe was visible. Four things asking for input before a
 * single answer.
 *
 * The mistake worth writing down, because it is an easy one to repeat: an
 * earlier pass read "this is confusing" as "this is under-labelled" and added
 * headings, sub-lines and a group. Naming four things clearly does not help
 * when the problem is that there are four of them above the fold. It made the
 * page longer, and it left two cameras on screen five hundred pixels apart —
 * which was the original complaint, now with better captions.
 *
 * What is here instead, top to bottom:
 *
 *   Cook  ·  🧺 5 things ▾      the kitchen as a chip, opening a dialog
 *   [ What do you fancy?    ] [ Find me something ]
 *   Aiming at 900 kcal…              Anything specific?
 *   📷 from a photo · 📋 paste one · 📅 plan the week
 *   (For you) (Library)
 *   the grid
 *
 * One primary action. Three alternatives on one quiet line, all the same size,
 * none of them hidden. Everything that needs more than a phrase — the kitchen,
 * a pasted recipe, confirming a photo — opens a dialog rather than growing in
 * place, so choosing one never pushes the recipes off the screen. And one
 * camera: photographing a shelf can end in a stocked list or in dinner, so the
 * fork moved to the end of that flow — see <FridgeScan> — instead of being two
 * buttons at the start.
 *
 * That leaves exactly one text input live at any moment, which is the other
 * reason the kitchen is in a dialog. Two boxes on one screen, both about food,
 * both the same pill, are read as the same box drawn twice — and no label
 * fixes that, because nobody reads the label of a control they think they have
 * already understood.
 *
 * The budget line is doing more work than it looks like it is: it is the reason
 * the suggestions are any good, and saying it out loud is what separates this
 * from a recipe search that happens to live inside a food app.
 *
 * The grid is tiles and nothing more. Choosing and cooking are different
 * activities; a recipe's own page — /cook/library/[slug] for the shelf,
 * /cook/recipe/[id] for an idea — is for the rest.
 */
export default function CookPage() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [library, setLibrary] = useState<LibraryRecipe[] | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [message, setMessage] = useState('');
  const [brief, setBrief] = useState<RecipeBrief>({});
  const [thinking, setThinking] = useState(false);
  /** What the run in flight was asked for, printed over the skeletons. */
  const [thinkingNote, setThinkingNote] = useState('');
  /*
   * Which half of the answer is on screen. Starts on your own, even when it is
   * empty.
   *
   * It used to open on the library, on the reasoning that an empty "For you" is
   * a tab whose only content is an apology. True in isolation, and wrong in
   * context: landing on somebody else's hundred recipes made the whole screen
   * read as a recipe search with an AI button bolted on, which is exactly the
   * misreading this page kept producing. The empty state is not an apology now
   * that the three ways to fill it are sitting directly above it — it is a
   * caption for them.
   */
  const [tab, setTab] = useState<'ideas' | 'library'>('ideas');

  /*
   * Whether the kitchen dialog is showing. Never opened for you: a modal that
   * appears because you arrived is an interruption, and an empty kitchen is not
   * an emergency — the ask works without one, and the chip already says the
   * list is empty in the corner where the list lives.
   */
  const [kitchenOpen, setKitchenOpen] = useState(false);
  /** The per-request filters. Shut by default: "just tell me what I could
      cook" is still the useful default, and six empty fields is not. */
  const [briefOpen, setBriefOpen] = useState(false);

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

  const fresh = (items ?? []).filter((i) => !i.is_staple);
  const staleCount = fresh.filter((i) => daysSince(i.last_seen_at) >= STALE_DAYS).length;

  /**
   * What pressing the button will do, in a sentence, before it is pressed.
   *
   * The box above it is optional and looked it — an empty field with a grey
   * placeholder, next to a button that gave no clue what it would produce or
   * from what. You could press it having typed nothing, which is in fact the
   * intended way to use it, and get "Thinking…" and no idea what about. So the
   * line says both halves out loud: what it is going to write, and the budget
   * it is writing against, which is the part no recipe site could say.
   */
  const remaining = day
    ? {
        kcal: Math.max(0, Math.round(day.targets.kcal - day.consumed.kcal)),
        protein: Math.max(0, Math.round(day.targets.protein_g - day.consumed.protein_g)),
      }
    : null;

  const plan = (() => {
    /*
     * An empty kitchen is a different promise, not a smaller one. Saying "from
     * what's in your kitchen" when the kitchen is empty is the screen telling
     * an obvious lie in its first sentence — and it is the first sentence a new
     * account ever reads. The run handles this too; see the bare-kitchen block
     * in the recipe task prompt.
     */
    if (items !== null && items.length === 0) {
      return `Your kitchen is empty, so I'll suggest things one small shop would cover — and name what to buy.`;
    }
    const from = brief.wants?.trim()
      ? `I'll work from what you asked for and what's in your kitchen`
      : `I'll invent three recipes from what's in your kitchen`;
    if (!remaining) return `${from}.`;
    if (remaining.kcal === 0) return `${from} — and you're at your target today, so I'll keep it light.`;
    return `${from}, aiming at the ${remaining.kcal} kcal and ${remaining.protein}g protein you have left.`;
  })();

  /*
   * Saving is the one thing still done from the grid, because it is the one
   * thing you do *while* choosing rather than after. Both write through
   * optimistically and put the flag back if the request fails — a bookmark that
   * silently did not save is worse than one that visibly bounces.
   */
  async function toggleLibrarySaved(slug: string, next: boolean) {
    const flip = (value: boolean) =>
      setLibrary((prev) => prev?.map((r) => (r.slug === slug ? { ...r, saved: value } : r)) ?? prev);
    flip(next);
    try {
      await api.saveLibraryRecipe(slug, next);
    } catch (e) {
      flip(!next);
      toast.error((e as Error).message);
    }
  }

  async function toggleRecipeSaved(id: string, next: boolean) {
    const flip = (value: boolean) =>
      setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, saved: value } : r)));
    flip(next);
    try {
      await api.saveRecipe(id, next);
    } catch (e) {
      flip(!next);
      toast.error((e as Error).message);
    }
  }

  /**
   * The one recipe run this screen makes, however it was started.
   *
   * `focus` is the handful of ingredients the ask was actually about — what a
   * photo just found. The pantry is already in the prompt either way; this says
   * which part of it is the point, which is the whole difference between "you
   * have spinach" and "this is a spinach dish".
   */
  async function suggest(focus?: string[]) {
    const asked = brief.wants?.trim() ?? '';
    /*
     * Say what is being done, where the answer will appear, before any of it
     * exists.
     *
     * The button used to change to "Thinking…" and that was the entire signal:
     * no statement of what it had been asked, no indication that the thing it
     * was thinking about would land four hundred pixels lower, and a wait long
     * enough to wonder whether the click had registered. A verb and an object
     * beats a verb.
     */
    setThinkingNote(
      focus?.length
        ? `Writing recipes around the ${listWords(focus.slice(0, 4))} in your photo…`
        : asked
          ? `Writing three recipes for “${asked}”, from what's in your kitchen…`
          : "Writing three recipes from what's in your kitchen…",
    );
    // Moved to the front: the skeletons are the answer to "what is it doing",
    // and they are no use on a tab you cannot see.
    setTab('ideas');
    setThinking(true);
    try {
      const result = await api.suggestRecipes({
        ...brief,
        wants: asked || undefined,
        focus: focus?.length ? focus : undefined,
      });
      setRecipes(result.recipes);
      setMessage(result.message);
      // Deliberately not cleared. It sits with the other five constraints now,
      // all of which persist, and the count on the shut panel is what stops it
      // steering a request nobody meant it to.
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  /*
   * A scan that was started to cook, rather than to tidy the list. The finds are
   * already in the pantry by the time this runs — <FridgeScan> commits them
   * either way — so the reload is what keeps the kitchen line honest while the
   * recipes are being written.
   */
  async function cookFromPhoto(found: string[]) {
    await load();
    await suggest(found);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        {/*
          The title, and the kitchen as one chip beside it.

          The kitchen is a precondition, not an answer, and it used to be a card
          with its own heading, its own input, its own camera and its own footer
          sitting above everything — the top third of the screen given to the
          thing you check for ten seconds a week.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-large-title">Cook</h1>
          {items !== null && (
            <button
              type="button"
              onClick={() => setKitchenOpen((v) => !v)}
              aria-expanded={kitchenOpen}
              className="bg-card border-border chunk-sm text-footnote hover:bg-muted/60 flex items-center gap-2 rounded-full border-2 px-3.5 py-2 font-semibold transition-colors"
            >
              <span aria-hidden>🧺</span>
              {fresh.length === 0
                ? 'Your kitchen is empty'
                : `${fresh.length} ${fresh.length === 1 ? 'thing' : 'things'}`}
              {staleCount > 0 && (
                <span className="text-[var(--fat-text)]">· {staleCount} to check</span>
              )}
              <ChevronDown
                size={15}
                className={cn(
                  'text-muted-foreground transition-transform duration-[var(--dur-quick)]',
                  kitchenOpen && 'rotate-180',
                )}
              />
            </button>
          )}
        </div>

        {/*
          The kitchen, somewhere else. See <Pantry> — the short version is that
          its "add ingredients" field and the ask box below were the same pill
          two hundred pixels apart, and no amount of labelling makes two
          identical inputs stacked in one column read as two different jobs.
        */}
        <Dialog open={kitchenOpen} onOpenChange={setKitchenOpen}>
          <DialogContent
            title="Your kitchen"
            description="What I'll cook from. It only has to be roughly right."
          >
            {items && <Pantry items={items} onChanged={load} onCook={cookFromPhoto} />}
          </DialogContent>
        </Dialog>

        {/*
          The ask. One box, one button, and the number it is aiming at.

          Everything else that produces a recipe is on the quiet line below it,
          all three at the same size — see <ActionChip> for why that line is a
          line and not three rows with titles and chevrons.
        */}
        <div className="space-y-2">
          <InsetGroup>
            <div className="space-y-2.5 p-3">
              <Button
                onClick={() => void suggest()}
                disabled={thinking}
                className="h-12 w-full gap-2 rounded-full text-[15px] sm:w-auto sm:px-6"
              >
                {thinking ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {thinking ? 'Thinking…' : 'Find me something'}
              </Button>

              {/*
                The budget and the thing that changes it, on one line. It is the
                reason the suggestions are any good, and saying it out loud is
                what separates this from a recipe search that happens to live
                inside a food app.
              */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-footnote text-muted-foreground font-medium">{plan}</p>
                <BriefToggle
                  value={brief}
                  open={briefOpen}
                  onToggle={() => setBriefOpen((v) => !v)}
                />
              </div>
            </div>

            {briefOpen && <Brief value={brief} onChange={setBrief} />}
          </InsetGroup>

          {/* The other three ways in. One line, one size, nothing hidden. */}
          <div className="flex flex-wrap items-center gap-1 px-1.5">
            <FridgeScan onSaved={load} onCook={cookFromPhoto} />
            <ChipDot />
            <ImportRecipe
              onImported={(recipe) => {
                setRecipes((prev) => [recipe, ...prev]);
                setMessage('');
                setTab('ideas');
                void load();
              }}
            />
            <ChipDot />
            <Link href="/plan" className={chipClass}>
              <CalendarDays size={13} />
              plan the week
            </Link>
          </div>
        </div>

        {/*
          The answers. Two tabs rather than two stacked lists: the shelf is a
          hundred recipes long, so underneath the ideas it was a tail you could
          never scroll back past.
        */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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

        {tab === 'ideas' && thinking ? (
          /*
            The wait, shown where the answer is going to be rather than on the
            button that started it. Three placeholders because three is what was
            asked for, so the shape of the reply is visible before it arrives —
            and the sentence above them repeats what it was asked, which is the
            thing a spinner cannot say.
          */
          <>
            <p className="text-muted-foreground px-1 text-body">{thinkingNote}</p>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
              <Skeleton className="h-72 w-full rounded-[var(--radius)] max-lg:hidden" />
              <Skeleton className="h-72 w-full rounded-[var(--radius)] max-xl:hidden" />
            </div>
          </>
        ) : tab === 'ideas' ? (
          <>
            {message && <p className="text-muted-foreground px-1 text-body">{message}</p>}

            {recipes.length === 0 ? (
              <div className="py-12 text-center">
                <span aria-hidden className="animate-bob mb-3 block text-[40px] leading-none">
                  👩‍🍳
                </span>
                <p className="text-muted-foreground text-body font-medium">
                  Nothing yet. Press <span className="text-foreground">Find me something</span>{' '}
                  and I&rsquo;ll invent three recipes
                  <br />
                  from what&rsquo;s in your kitchen — or start from a photo, or a recipe you
                  already have.
                </p>
              </div>
            ) : (
              <div className="grid items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {recipes.map((recipe) => (
                  <RecipeTile
                    key={recipe.id}
                    href={`/cook/recipe/${recipe.id}`}
                    title={recipe.title}
                    summary={recipe.summary}
                    kcal={recipe.kcal}
                    protein_g={recipe.protein_g}
                    servingLabel="per portion"
                    emoji={foodEmoji(recipe.title)}
                    needs={recipe.ingredients.filter((i) => i.missing).map((i) => i.name)}
                    minutes={recipe.minutes}
                    steps={recipe.steps.length}
                    saved={recipe.saved}
                    onToggleSave={() => void toggleRecipeSaved(recipe.id, !recipe.saved)}
                  />
                ))}
              </div>
            )}
          </>
        ) : library === null ? (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
            <Skeleton className="h-72 w-full rounded-[var(--radius)]" />
            <Skeleton className="hidden h-72 w-full rounded-[var(--radius)] xl:block" />
          </div>
        ) : library.length === 0 ? (
          <p className="text-muted-foreground px-1 py-8 text-center text-body font-medium">
            Nothing matching &ldquo;{librarySearch}&rdquo;.
          </p>
        ) : (
          <>
            <div className="grid items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {library.map((recipe) => (
                <RecipeTile
                  key={recipe.slug}
                  href={`/cook/library/${recipe.slug}`}
                  title={recipe.title}
                  summary={recipe.summary}
                  kcal={recipe.kcal}
                  protein_g={recipe.protein_g}
                  servingLabel={`per ${recipe.serving_size ?? 'portion'}`}
                  photo={recipe.image_path}
                  fitsToday={recipe.fits_today}
                  have={recipe.have}
                  steps={recipe.steps.length}
                  saved={recipe.saved}
                  onToggleSave={() => void toggleLibrarySaved(recipe.slug, !recipe.saved)}
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
