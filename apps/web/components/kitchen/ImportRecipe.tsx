'use client';

import { useState } from 'react';
import { ClipboardPaste, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Recipe } from '@ct/shared';
import { api } from '@/lib/api';
import { ActionChip } from '@/components/kitchen/ActionChip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
 *
 * In a dialog rather than in the page. It expanded where it stood for a while,
 * which meant picking it from a short list of options replaced that list with a
 * three-hundred-pixel form and pushed everything below it off the screen —
 * including the recipes, which are the only reason anyone opened the tab.
 */
export function ImportRecipe({
  onImported,
  disabled = false,
  disabledReason = 'No recipe runs left today',
}: {
  onImported: (recipe: Recipe) => void;
  /**
   * Pricing a recipe spends a run like any other, so it shuts with them — and
   * also while another run is in flight, since the budget is shared.
   */
  disabled?: boolean;
  /** Why it is shut. Two reasons now, and they are not interchangeable. */
  disabledReason?: string;
}) {
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

  return (
    <>
      <ActionChip
        icon={<ClipboardPaste size={13} />}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        paste one
      </ActionChip>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent
          title="A recipe you already have"
          description="I'll work out the calories and leave the cooking alone."
        >
          <div className="space-y-2 p-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type the recipe — ingredients and method, however you have it written."
              rows={9}
              autoFocus
              className="bg-muted/60 border-border resize-none rounded-2xl border-2 text-body"
            />
            <Button
              onClick={() => void submit()}
              disabled={busy || text.trim().length < 20}
              className="h-11 w-full gap-2 rounded-full"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? 'Working out the numbers…' : 'Work out the macros'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
