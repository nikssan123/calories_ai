'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PantryItem } from '@ct/shared';
import { api } from '@/lib/api';
import { FridgeScan } from '@/components/kitchen/FridgeScan';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * What is in the kitchen.
 *
 * The screen's job is to make the list easy to *correct*, not easy to maintain:
 * nobody keeps an inventory current, so everything here is built around a
 * ten-second pass before asking for ideas. Ages are shown out loud, a stale item
 * is one tap from confirmed or gone, and staples fold away because "do you still
 * have salt" is not a question worth anyone's screen space.
 *
 * In a dialog, and that is the important part. The kitchen is a *precondition*
 * for the question the Cook screen exists to answer, not the answer — but it
 * was the first thing on the page and it held the top third open permanently,
 * so the recipes started below the fold. It is a chip in the title row now, and
 * this is what the chip opens.
 *
 * A dialog rather than a panel because of what sharing a screen did to it. Open
 * in the page, its "add ingredients" field sat two hundred pixels above the ask
 * box in an identical pill, and two identical inputs stacked like that read as
 * one feature implemented twice. They are not remotely the same: this writes
 * rows to a list that outlives the visit, and that one is a phrase steering a
 * single question. A modal makes the page behind it inert, so exactly one of
 * the two is ever live — and being somewhere else is the clearest possible
 * statement that it is something else.
 *
 * The camera is here and also under the ask, which is a repeat rather than the
 * duplicate it looks like: both open the same dialog, and that dialog is where
 * you choose between a stocked list and dinner. What made two cameras confusing
 * before was that they forked the behaviour and made you choose first. These
 * do not, and only one of them is ever on screen at rest — this panel is shut
 * until you ask for it.
 */

/** Past this many days an item is old enough to be worth a second look. */
export const STALE_DAYS = 10;

export function Pantry({
  items,
  onChanged,
  onCook,
}: {
  items: PantryItem[];
  onChanged: () => void;
  /** Passed straight to the scanner, so a scan started here can still end in
      dinner rather than dead-ending at a list. */
  onCook: (names: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showStaples, setShowStaples] = useState(false);

  const staples = items.filter((i) => i.is_staple);
  const fresh = items.filter((i) => !i.is_staple);

  async function add() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      // Comma-separated in one go: typing "chicken, rice, peppers" is how people
      // actually empty a shopping bag, and three round trips would be three
      // chances to lose one.
      const names = name
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      await api.addPantryItems(names.map((n) => ({ name: n, source: 'typed' as const })));
      setDraft('');
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(item: PantryItem) {
    try {
      await api.updatePantryItem(item.id, { seen: true });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(item: PantryItem) {
    try {
      await api.deletePantryItem(item.id);
      toast.success(`Removed ${item.name}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="divide-border divide-y-2">
      {/*
        Squared off, labelled, and with a button that says the verb.
        
        This field and the ask box used to be the same pill — same height, same
        radius, same grey placeholder — sitting two hundred pixels apart, and
        the honest reaction to that is the one it got: two inputs that look
        identical are two inputs that do the same thing. They do not. This one
        writes a row to a list that persists; that one is a phrase attached to a
        single question and then thrown away. Different jobs get different
        shapes, and this one is shaped like the list editor it is.
      */}
      <div className="p-3">
        <label
          htmlFor="pantry-add"
          className="text-footnote text-muted-foreground mb-1.5 block font-medium"
        >
          Add to the list
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="pantry-add"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
            placeholder="chicken, rice, peppers"
            className="bg-muted/60 border-border h-11 rounded-xl border-2 px-3 text-body"
          />
          <Button
            variant="secondary"
            disabled={!draft.trim() || busy}
            onClick={() => void add()}
            className="h-11 shrink-0 gap-1.5 rounded-xl px-4"
          >
            <Plus size={16} />
            Add
          </Button>
        </div>
        <p className="text-footnote text-muted-foreground mt-1.5 font-medium">
          A rough list is plenty — it only has to be close enough to cook from.
        </p>
      </div>

      {/* Photographing a shelf is a way of filling this list, so the button for
          it belongs on the list. It opens the same dialog the chip under the
          ask opens, and that dialog still offers both endings — the panel this
          sits in is shut by default, so the two triggers are never on screen
          at the same time unless you went looking for the kitchen. */}
      <FridgeScan variant="button" onSaved={onChanged} onCook={onCook} />

      {fresh.length === 0 ? (
        <p className="text-muted-foreground px-4 py-4 text-body">
          Nothing here yet. Add a few things, or photograph your fridge.
        </p>
      ) : (
        fresh.map((item) => {
          const days = daysSince(item.last_seen_at);
          const stale = days >= STALE_DAYS;
          return (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body">
                  {item.name}
                  {item.quantity_desc && (
                    <span className="text-muted-foreground"> · {item.quantity_desc}</span>
                  )}
                </p>
                <p
                  className={cn(
                    'text-footnote',
                    stale ? 'text-[var(--fat-text)]' : 'text-muted-foreground',
                  )}
                >
                  {describeAge(days)}
                </p>
              </div>

              {/* Only offered once an item is old enough to doubt. Before that
                  it is a button that changes nothing, which teaches people to
                  ignore it for the fortnight when it starts to matter. */}
              {stale && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void confirm(item)}
                  className="h-8 shrink-0 rounded-full px-3"
                >
                  Still have it
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void remove(item)}
                className="text-muted-foreground hover:text-foreground size-8 shrink-0"
                aria-label={`Remove ${item.name}`}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          );
        })
      )}

      {staples.length > 0 && (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShowStaples((v) => !v)}
            className="text-footnote text-muted-foreground hover:text-foreground"
          >
            {showStaples ? 'Hide' : `and ${staples.length} staples`}
          </button>
          {showStaples && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {staples.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void remove(item)}
                  className="bg-muted border-border text-footnote hover:bg-secondary rounded-full border-2 px-3 py-1 font-semibold"
                  aria-label={`Remove ${item.name}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}

function describeAge(days: number): string {
  if (days === 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < STALE_DAYS) return `${days} days ago`;
  return `${days} days ago — still there?`;
}
