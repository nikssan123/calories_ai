'use client';

import { cn } from '@/lib/utils';

/**
 * The quiet line under the ask.
 *
 * These are the three other ways to end up with a recipe — a photo, one you
 * already own, a whole week — and the thing they have in common is that none of
 * them is what you came here to do. They were rows with titles, sub-lines and
 * chevrons, which is the styling of a main menu, and three of those above the
 * results meant the page opened on a menu instead of on dinner.
 *
 * So: one line, small, muted, all three the same size. Being the same size is
 * the point — the previous version's crime was that four ways of asking the
 * same question were drawn at four different weights, so the screen looked like
 * it was making an argument about which one you wanted.
 *
 * Not hidden behind a menu, though. Something you cannot see is something you
 * do not know exists, and "photograph your fridge" is the one thing here nobody
 * would think to go looking for.
 */
export const chipClass = cn(
  'text-footnote text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5',
  'rounded-full px-2 py-1 font-medium transition-colors',
  'hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-60',
);

export function ActionChip({
  icon,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { icon: React.ReactNode }) {
  return (
    <button type="button" className={cn(chipClass, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

/** The dot between two chips. Decoration, so it never reaches a screen reader. */
export function ChipDot() {
  return (
    <span aria-hidden className="text-muted-foreground/50 text-footnote select-none">
      ·
    </span>
  );
}
