'use client';

import { useRef, useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PantryFind, PantryScanProposal } from '@ct/shared';
import { api } from '@/lib/api';
import { PHOTO_ACCEPT, preparePhoto, useHasCameraApp } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Photograph the fridge, then confirm what it found.
 *
 * The confirmation step is the feature, not a formality around it. A photo
 * shows the front row of one shelf, past a milk bottle, with half the labels
 * turned away — the model's reading of that is a good first draft and a bad
 * database. Everything arrives selected, so the common case is one tap; a
 * low-confidence guess arrives deselected, because a wrong ingredient silently
 * added is the failure that makes people stop trusting the list.
 */
export function FridgeScan({ onSaved }: { onSaved: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [proposal, setProposal] = useState<PantryScanProposal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
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
      setProposal(found);
      setChosen(new Set(found.found.filter((f) => f.confidence !== 'low').map((f) => f.name)));
      if (found.found.length === 0) {
        toast.message(found.note ?? "I couldn't make out any food in that photo.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    if (!proposal) return;
    const items = proposal.found.filter((f) => chosen.has(f.name));
    if (items.length === 0) {
      setProposal(null);
      return;
    }

    setSaving(true);
    try {
      await api.addPantryItems(
        items.map((f) => ({
          name: f.name,
          quantity_desc: f.quantity_desc,
          source: 'photo' as const,
        })),
      );
      toast.success(`Added ${items.length} ${items.length === 1 ? 'thing' : 'things'}`);
      setProposal(null);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
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

  if (proposal && proposal.found.length > 0) {
    return (
      <div className="border-border border-t-2 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body font-medium">What I can see</p>
          <button
            type="button"
            onClick={() => setProposal(null)}
            className="text-footnote text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>

        {proposal.note && (
          <p className="text-footnote text-muted-foreground mt-1">{proposal.note}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
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
                {find.quantity_desc && (
                  <span className="opacity-70">· {find.quantity_desc}</span>
                )}
                {/* Worth saying: it stops "why did it find things I already
                    had?" and turns a duplicate-looking list into a refresh. */}
                {known && <span className="opacity-70">· already listed</span>}
              </button>
            );
          })}
        </div>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="mt-3 h-11 w-full rounded-full"
        >
          {saving ? 'Adding…' : `Add ${chosen.size} to my kitchen`}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border border-t-2 px-4 py-3">
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
  );
}
