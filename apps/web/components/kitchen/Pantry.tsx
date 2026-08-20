'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PantryItem } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FridgeScan } from '@/components/kitchen/FridgeScan';

/**
 * What is in the kitchen.
 *
 * The screen's job is to make the list easy to *correct*, not easy to maintain:
 * nobody keeps an inventory current, so everything here is built around a
 * ten-second pass before asking for ideas. Ages are shown out loud, a stale item
 * is one tap from confirmed or gone, and staples fold away because "do you still
 * have salt" is not a question worth anyone's screen space.
 */

/** Past this many days an item is old enough to be worth a second look. */
const STALE_DAYS = 10;

export function Pantry({
  items,
  onChanged,
}: {
  items: PantryItem[];
  onChanged: () => void;
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
    <InsetGroup
      title="Your kitchen"
      footer="A rough list is plenty — it only has to be close enough to cook from."
    >
      <div className="flex items-center gap-2 p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          placeholder="Add ingredients, separated by commas"
          className="bg-muted/60 border-border h-11 rounded-full border-2 px-4 text-body"
        />
        <Button
          size="icon"
          variant="secondary"
          disabled={!draft.trim() || busy}
          onClick={() => void add()}
          className="size-11 shrink-0 rounded-full"
          aria-label="Add to your kitchen"
        >
          <Plus size={18} />
        </Button>
      </div>

      <FridgeScan onSaved={onChanged} />

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
    </InsetGroup>
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
