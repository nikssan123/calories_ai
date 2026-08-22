'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { MealTemplate } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { foodEmoji } from '@ct/shared/food-emoji';

/**
 * The eight things you actually eat.
 *
 * `search_food_history` already makes "my usual breakfast" work in the journal;
 * this is the same idea for the screen, for the mornings when typing a sentence
 * is more than the porridge deserves.
 */
export function RepeatMeals({ onLogged }: { onLogged: () => void }) {
  const [meals, setMeals] = useState<MealTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    try {
      const { meals } = await api.mealTemplates({ query: search || undefined, limit: 8 });
      setMeals(meals);
    } catch (e) {
      toast.error((e as Error).message);
      setMeals([]);
    }
  }, []);

  useEffect(() => {
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function repeat(template: MealTemplate) {
    setBusy(template.entry_id);
    try {
      const entry = await api.repeatFoodEntry(template.entry_id);
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      onLogged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Nothing to repeat yet, and no search running: stay out of the way entirely.
  if (meals !== null && meals.length === 0 && !query) return null;

  return (
    <InsetGroup
      title="Log again"
      footer="Logs it at today's time. If the portion was different, just say so in the journal and I'll fix it."
    >
      <div className="p-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your meals"
          className="bg-muted/60 border-border h-10 rounded-full border-2 px-4 text-body"
        />
      </div>

      {meals === null ? (
        <div className="text-muted-foreground px-4 py-4 text-body">Loading…</div>
      ) : meals.length === 0 ? (
        <div className="text-muted-foreground px-4 py-4 text-body">
          Nothing matching “{query}”.
        </div>
      ) : (
        meals.map((template) => (
          <div key={template.entry_id} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden className="shrink-0 text-[20px] leading-none">
              {foodEmoji(template.description)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold">{template.description}</p>
              <p className="tnum text-footnote text-muted-foreground font-medium">
                {Math.round(template.kcal)} kcal · {Math.round(template.protein_g)}g protein
                {template.times > 1 && (
                  <span className="inline-flex items-center gap-1">
                    {' · '}
                    <RotateCcw size={11} />
                    {template.times}×
                  </span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void repeat(template)}
              className="h-8 shrink-0 gap-1 rounded-full px-3"
              aria-label={`Log ${template.description} again`}
            >
              <Plus size={15} />
              {busy === template.entry_id ? 'Adding…' : 'Log'}
            </Button>
          </div>
        ))
      )}
    </InsetGroup>
  );
}
