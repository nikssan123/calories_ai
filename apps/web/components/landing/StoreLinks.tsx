import type { Locale } from '@ct/shared';
import { cn } from '@/lib/utils';

/**
 * Google Play, live; the App Store, still in review.
 *
 * Deliberately not badges. Store badges are pills, and a pill in the hero reads
 * as a peer of "Get started" — four of them side by side left the section with
 * no primary action at all. These are the smallest thing that still carries the
 * two marks, so the eye reaches them last rather than fourth.
 *
 * A store with no `href` renders inert, and says "soon" for itself rather than
 * linking to nowhere: an empty `href` reloads the page and `#` scrolls it to
 * the top, and either one reads as a broken button. The label is per store
 * rather than a heading over the row, because the row is now half true — fill
 * in the App Store URL and its "soon" disappears by itself.
 *
 * Android leads the row, against the usual order, because it is the one a
 * visitor can act on. The store with a URL is also where every primary button
 * on the landing page points, so the row and the button agree.
 *
 * When the iOS listing is written: "barcode scanner" is one of the
 * highest-volume queries in the stores' nutrition category and belongs in the
 * subtitle and the keyword field, even though it has no business in the hero
 * headline on this page. Different surfaces, different jobs — a store listing
 * is answering a search, the landing page is making an argument.
 */
const STORES: { name: string; href: string | null; Mark: typeof AppleMark }[] = [
  {
    name: 'Google Play',
    href: 'https://play.google.com/store/apps/details?id=com.daysofar.app',
    Mark: PlayMark,
  },
  { name: 'App Store', href: null, Mark: AppleMark },
];

/**
 * Where the page's primary button points, now that the only way to open an
 * account is to install the app.
 *
 * The first store with a URL, or null while neither has one — in which case the
 * button scrolls to the section that says "soon" rather than pretending there
 * is somewhere to go. When both are live the difference is one tap on the wrong
 * platform's page, which every store redirects out of by itself.
 */
export const STORE_HREF: string | null = STORES.find((store) => store.href)?.href ?? null;

/** The App Store listing, once there is one — what an iPhone's button points at. */
export const APP_STORE_HREF: string | null = STORES.find((store) => store.name === 'App Store')?.href ?? null;

/**
 * The listing in the page's language. Play reads `hl`; Apple has no such
 * parameter and picks the storefront from the visitor's own account.
 */
function localized(href: string, locale: Locale | undefined): string {
  if (!locale || !href.includes('play.google.com')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}hl=${locale}`;
}

export function StoreLinks({
  className,
  locale,
  soon = 'soon',
}: {
  className?: string;
  locale?: Locale;
  /** "soon", in the page's language. The English pages outside the landing leave it be. */
  soon?: string;
}) {
  return (
    <div
      className={cn(
        'text-footnote text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1',
        className,
      )}
    >
      {STORES.map(({ name, href, Mark }) => {
        const face = (
          <>
            <Mark className="size-[15px] shrink-0" />
            {name}
            {!href && <span className="opacity-80">— {soon}</span>}
          </>
        );

        return href ? (
          <a
            key={name}
            href={localized(href, locale)}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            {face}
          </a>
        ) : (
          <span key={name} className="inline-flex items-center gap-1.5 opacity-70">
            {face}
          </span>
        );
      })}
    </div>
  );
}

/*
 * Both marks are drawn in `currentColor`. Google's is normally a four-colour
 * triangle, but one coloured glyph beside a monochrome apple is the kind of
 * mismatch that makes a row look assembled from clip art.
 */

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function PlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M1.34.92a1.49 1.49 0 0 0-.11.57v21.02c0 .21.04.42.12.6l11.15-11.09L1.34.92zm12.2 10.07 3.26-3.24L3.45.2a1.47 1.47 0 0 0-.95-.18l11.04 10.97zm0 2.07-11 10.93c.3.04.61-.02.91-.18l13.32-7.54-3.23-3.21zm8.48-2.35L18.1 12.9l-3.52-3.49 3.54-3.52 3.9 2.2a1.49 1.49 0 0 1 0 2.6z" />
    </svg>
  );
}
