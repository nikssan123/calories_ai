'use client';

import { useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
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
 * ten-second pass before asking for ideas. A stale item is one click from
 * confirmed or gone, and staples fold away because "do you still have salt" is
 * not a question worth anyone's screen space.
 *
 * In a dialog, and that is the important part. The kitchen is a *precondition*
 * for the question the Cook screen exists to answer, not the answer — but it
 * was the first thing on the page and it held the top third open permanently,
 * so the recipes started below the fold. It is a chip in the title row now, and
 * this is what the chip opens.
 *
 * # Shaped like a kitchen, not like a ledger
 *
 * The version before this was a stack of full-width rows: label, field, hint,
 * a full-width camera button, then one bordered row per ingredient carrying a
 * name and a second line of prose underneath it. Twelve tins of things became
 * twenty-four lines of text and three screens of scrolling, and the reaction it
 * got — "a lot of text and just a list" — is the correct reading of that shape.
 * A ledger is for things you audit. This is a bag of shopping.
 *
 * So three changes, each removing something rather than decorating it:
 *
 *   1. **One compose row.** The field, the add and the camera sit on a single
 *      line. The label above the field said "Add to the list" over a field
 *      whose placeholder already read "chicken, rice, peppers", and the hint
 *      below it said the list only has to be roughly right — which is what the
 *      dialog's own subtitle says, one inch higher. Three sentences, one fact.
 *
 *   2. **Ingredients are chips.** A name is one or two words; giving each one a
 *      44px row, a divider and a subtitle was spending a whole line on a word.
 *      Wrapped chips put a stocked kitchen on one screen and, more importantly,
 *      make it look like a quantity of *food* rather than a table of records.
 *
 *   3. **The age moved to where it does something.** "Added today" under every
 *      single item was the bulk of the text and none of the information: the
 *      age only matters when it is old enough to doubt. Anything past
 *      STALE_DAYS is lifted out into its own group at the top, with the age
 *      spelled out and both answers next to it; everything fresher just shows
 *      its name. The list stops narrating and starts asking.
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
  const stale = fresh.filter((i) => daysSince(i.last_seen_at) >= STALE_DAYS);
  const current = fresh.filter((i) => daysSince(i.last_seen_at) < STALE_DAYS);

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
    <div className="space-y-4 p-4">
      {/*
        One line: what you type, the verb, and the camera.

        The field is a pill rather than the squared box it was. The reason it
        was squared — that it looked identical to the ask box on the page
        behind, two hundred pixels away — stopped applying when this moved into
        a modal: the page underneath is inert and mostly hidden, so there is no
        longer a pair to tell apart. What is left is a field that wants to look
        like the round, chunky controls it is sitting between.
      */}
      <div className="flex items-center gap-2">
        <Input
          id="pantry-add"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          placeholder="chicken, rice, peppers"
          aria-label="Add to the list"
          className="bg-muted/60 border-border h-11 min-w-0 flex-1 rounded-full border-2 px-4 text-body"
        />
        <Button
          variant="secondary"
          size="icon-lg"
          disabled={!draft.trim() || busy}
          onClick={() => void add()}
          aria-label="Add to the list"
          title="Add to the list"
          className="rounded-full"
        >
          <Plus size={18} />
        </Button>
        <FridgeScan variant="icon" onSaved={onChanged} onCook={onCook} />
      </div>

      {/*
        The only part of the list that is asking you something, in the only
        shape that can ask: a group of its own, at the top, with both answers
        sitting next to each item.

        These used to be ordinary rows distinguished by the colour of their
        subtitle, which is a distinction nobody makes while scanning — and the
        "Still have it" button appeared and disappeared row by row, so the
        column of controls had holes in it. Lifted out, the group is a short,
        finite job you can finish, and the chips below it are all things you
        have already vouched for.
      */}
      {stale.length > 0 && (
        <section className="border-border bg-muted/40 rounded-2xl border-2 p-3">
          <h3 className="text-eyebrow mb-2 text-[var(--fat-text)]">
            Still there? · {stale.length}
          </h3>
          <ul className="space-y-1.5">
            {stale.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-body">
                  {item.name}
                  {item.quantity_desc && (
                    <span className="text-muted-foreground"> · {item.quantity_desc}</span>
                  )}
                </span>
                <span className="text-footnote text-muted-foreground tnum shrink-0 font-medium">
                  {daysSince(item.last_seen_at)}d
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void confirm(item)}
                  className="shrink-0 rounded-full px-3"
                >
                  Yes
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void remove(item)}
                  className="text-muted-foreground hover:text-foreground shrink-0 rounded-full"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={15} />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Everything you have vouched for, as a quantity rather than a table. */}
      {fresh.length === 0 ? (
        <p className="text-muted-foreground py-2 text-body">
          Nothing here yet. Type a few things above, or photograph your shelf.
        </p>
      ) : (
        current.length > 0 && (
          <section>
            <h3 className="text-eyebrow text-muted-foreground mb-2">
              In the kitchen · {current.length}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {current.map((item) => (
                <Chip key={item.id} item={item} onRemove={() => void remove(item)} />
              ))}
            </div>
          </section>
        )
      )}

      {/*
        Staples, still folded. They are the least interesting rows in the list —
        you own salt — and unfolded they doubled its length for no decision.
        The toggle is a heading now rather than a sentence, so it reads as the
        third section of the panel rather than as a stray link at the bottom.
      */}
      {staples.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowStaples((v) => !v)}
            aria-expanded={showStaples}
            className="text-eyebrow text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Staples · {staples.length}
            <ChevronDown
              size={13}
              className={cn(
                'transition-transform duration-[var(--dur-quick)]',
                showStaples && 'rotate-180',
              )}
            />
          </button>
          {showStaples && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {staples.map((item) => (
                <Chip key={item.id} item={item} onRemove={() => void remove(item)} muted />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * One ingredient.
 *
 * The × is its own button inside the chip rather than the whole chip being the
 * target. Staples used to work the other way — tap the word, it is gone — which
 * is survivable for a list of six condiments you barely look at and not for the
 * list the recipe is written from. A visible target for the destructive half
 * also means the chip itself can stay inert, which is what lets thirty of them
 * sit in a block without the block reading as thirty buttons.
 */
function Chip({
  item,
  onRemove,
  muted = false,
}: {
  item: PantryItem;
  onRemove: () => void;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        'border-border text-footnote flex max-w-full items-center gap-1 rounded-full border-2 py-1 pr-1 pl-3 font-semibold',
        muted ? 'bg-muted' : 'bg-secondary',
      )}
    >
      <span className="min-w-0 truncate">
        {item.name}
        {item.quantity_desc && (
          <span className="text-muted-foreground font-medium"> · {item.quantity_desc}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="text-muted-foreground hover:bg-card hover:text-foreground grid size-5 shrink-0 place-items-center rounded-full transition-colors"
      >
        <X size={12} strokeWidth={3} />
      </button>
    </span>
  );
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
}
