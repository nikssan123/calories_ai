'use client';

import { useState } from 'react';
import { Loader2, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import type { Recipe } from '@ct/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Bring a recipe you already cook.
 *
 * The library is somebody else's hundred and the generator invents from what is
 * in the fridge; neither of them knows how your mother made it. Pasting it once
 * turns it into the same thing as everything else here — priced, pantry-matched,
 * scalable, one tap to log — which is what a nutrition app should have been
 * offering for the eight dishes you actually rotate through.
 *
 * Text, not a URL. Somebody pasting the thing they already cook is using their
 * own recipe; a server that fetched and stored arbitrary pages would be doing
 * something else entirely, and it is not what was asked for.
 */
export function ImportRecipe({ onImported }: { onImported: (recipe: Recipe) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { recipes } = await api.importRecipe({ text: text.trim() });
      const [recipe] = recipes;
      if (!recipe) throw new Error("I couldn't read that as a recipe.");
      toast.success(`Saved ${recipe.title} — ${Math.round(recipe.kcal)} kcal a portion`);
      setText('');
      setOpen(false);
      onImported(recipe);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-footnote text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-4 py-2.5"
      >
        <NotebookPen size={13} />
        Add one of your own
      </button>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          'Paste or type the recipe — ingredients and method, however you have it written.\n\nI’ll work out the calories and macros and leave the recipe itself alone.'
        }
        rows={7}
        className="bg-muted/60 border-border resize-none rounded-2xl border-2 text-body"
      />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(false);
            setText('');
          }}
          className="h-11 rounded-full px-5"
        >
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={busy || text.trim().length < 20}
          className="h-11 flex-1 gap-2 rounded-full"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {busy ? 'Working out the numbers…' : 'Work out the macros'}
        </Button>
      </div>
    </div>
  );
}
