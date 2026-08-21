'use client';

import { useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PantryFind, PantryScanProposal } from '@ct/shared';
import { api } from '@/lib/api';
import { PHOTO_ACCEPT, preparePhoto, useHasCameraApp } from '@/lib/image';
import { ActionChip } from '@/components/kitchen/ActionChip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Photograph a shelf, confirm what it found, then either stock or cook.
 *
 * The confirmation step is the feature, not a formality around it. A photo
 * shows the front row of one shelf, past a milk bottle, with half the labels
 * turned away — the model's reading of that is a good first draft and a bad
 * database. Everything arrives selected, so the common case is one tap; a
 * low-confidence guess arrives deselected, because a wrong ingredient silently
 * added is the failure that makes people stop trusting the list.
 *
 * # One camera
 *
 * A photo of a fridge answers two questions — "what do I have" and "what could
 * I cook" — and there was a period where that meant two camera buttons on one
 * screen, one in the pantry and one under the ask. Naming them for their
 * destinations did not help: two cameras five hundred pixels apart read as two
 * cameras, and "which of these does what" was the question the labels were
 * supposed to have answered.
 *
 * There is one now, and the fork moved to the end, where the choice actually
 * is. You take the picture, you check the list, and *then* you say whether you
 * wanted a stocked kitchen or dinner. Both buttons commit the same items, so
 * the decision costs nothing and cannot be got wrong.
 */
export function FridgeScan({
  onSaved,
  onCook,
  variant = 'chip',
}: {
  /** Called once the accepted finds are in the pantry. */
  onSaved: () => void;
  /** Hands the accepted names to the recipe run. */
  onCook: (names: string[]) => Promise<void>;
  /**
   * How the trigger presents itself, and nothing more.
   *
   * Both end in the same dialog with the same two buttons — which is the point,
   * and the difference from the version of this that had two cameras. That one
   * forked the *behaviour*: one went to the pantry, one went to recipes, and
   * you had to choose before you had seen the photo. Here the fork is at the
   * end either way, so which trigger you used never decides anything.
   */
  variant?: 'chip' | 'button';
}) {
  const [scanning, setScanning] = useState(false);
  const [proposal, setProposal] = useState<PantryScanProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<null | 'stock' | 'cook'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const hasCameraApp = useHasCameraApp();

  async function onPick(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Emptied straight away so re-picking the same photo still fires a change.
    input.value = '';
    if (!file) return;

    const prepared = await preparePhoto(file);
    if (!prepared) {
      toast.error('That file is not an image I can read.');
      return;
    }

    setScanning(true);
    try {
      const found = await api.scanFridge(prepared.dataUrl, prepared.mediaType);
      setChosen(new Set(found.found.filter((f) => f.confidence !== 'low').map((f) => f.name)));
      // Only opens when there is something to confirm; an empty proposal is a
      // sentence, not a dialog.
      if (found.found.length === 0) {
        toast.message(found.note ?? "I couldn't make out any food in that photo.");
      } else {
        setProposal(found);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  /**
   * Everything accepted goes to the pantry either way, including when the point
   * was dinner. The photo happened; the shelf really does hold these things,
   * and throwing that away because the person pressed the other button would
   * mean the same fridge got photographed twice.
   */
  async function commit(then: 'stock' | 'cook') {
    if (!proposal) return;
    const items = proposal.found.filter((f) => chosen.has(f.name));
    if (items.length === 0) {
      setProposal(null);
      return;
    }

    setSaving(then);
    try {
      await api.addPantryItems(
        items.map((f) => ({
          name: f.name,
          quantity_desc: f.quantity_desc,
          source: 'photo' as const,
        })),
      );
      setProposal(null);
      onSaved();

      if (then === 'cook') {
        // No toast on this path: the recipes appearing is the receipt, and an
        // "added 6 things" popping over them says the wrong thing happened.
        await onCook(items.map((f) => f.name));
      } else {
        toast.success(`Added ${items.length} ${items.length === 1 ? 'thing' : 'things'}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  function toggle(find: PantryFind) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(find.name)) next.delete(find.name);
      else next.add(find.name);
      return next;
    });
  }

  const busy = saving !== null;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => void onPick(e.currentTarget)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={PHOTO_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => void onPick(e.currentTarget)}
      />

      {variant === 'chip' ? (
        <ActionChip
          icon={scanning ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          disabled={scanning}
          onClick={() => (hasCameraApp ? cameraRef : fileRef).current?.click()}
        >
          {scanning ? 'Reading the photo…' : 'from a photo'}
        </ActionChip>
      ) : (
        <div className="border-border border-t-2 px-4 py-3">
          <Button
            variant="secondary"
            disabled={scanning}
            onClick={() => (hasCameraApp ? cameraRef : fileRef).current?.click()}
            className="h-11 w-full gap-2 rounded-full"
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {scanning ? 'Reading the photo…' : 'Scan my fridge'}
          </Button>
        </div>
      )}

      <Dialog open={proposal !== null} onOpenChange={(open) => !open && !busy && setProposal(null)}>
        {proposal && (
          <DialogContent
            title="What I can see"
            description={proposal.note ?? 'Tap anything I got wrong.'}
          >
            <div className="flex flex-wrap gap-1.5 p-4">
              {proposal.found.map((find) => {
                const on = chosen.has(find.name);
                const known = proposal.already_known.includes(find.name);
                return (
                  <button
                    key={find.name}
                    type="button"
                    onClick={() => toggle(find)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote transition-colors',
                      // Kept off a solid accent fill: --calories is a deep forest in
                      // light mode and a bright mint in dark, so no single text
                      // colour reads on both. A ring carries the same signal and
                      // survives the theme.
                      on
                        ? 'bg-muted text-foreground ring-1 ring-[var(--calories-text)]'
                        : 'bg-muted/40 text-muted-foreground line-through opacity-70',
                    )}
                  >
                    {on ? <Check size={13} /> : <X size={13} />}
                    {find.name}
                    {find.quantity_desc && <span className="opacity-70">· {find.quantity_desc}</span>}
                    {/* Worth saying: it stops "why did it find things I already
                        had?" and turns a duplicate-looking list into a refresh. */}
                    {known && <span className="opacity-70">· already listed</span>}
                  </button>
                );
              })}
            </div>

            {/*
              The fork, at the end rather than the beginning. Both buttons commit
              the same list and differ only in where they leave you, which is why
              it is safe to decide this late — and deciding it late is the whole
              reason there is one camera on the screen instead of two.
            */}
            <div className="border-border flex flex-col gap-2 border-t-2 p-3 sm:flex-row">
              <Button
                onClick={() => void commit('stock')}
                disabled={busy}
                variant="secondary"
                className="h-11 flex-1 gap-2 rounded-full"
              >
                {saving === 'stock' && <Loader2 size={15} className="animate-spin" />}
                {saving === 'stock' ? 'Adding…' : 'Just add to my kitchen'}
              </Button>
              <Button
                onClick={() => void commit('cook')}
                disabled={busy || chosen.size === 0}
                className="h-11 flex-1 gap-2 rounded-full"
              >
                {saving === 'cook' && <Loader2 size={15} className="animate-spin" />}
                {saving === 'cook' ? 'Finding recipes…' : 'Cook with these'}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
