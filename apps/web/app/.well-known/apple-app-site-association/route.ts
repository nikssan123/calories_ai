import { NextResponse } from 'next/server';

import { APP_LINK_PATHS, IOS_BUNDLE_ID } from '@/lib/app-links';

/**
 * What tells iOS that this domain and the app are the same product.
 *
 * Without this file, every link in every email we send opens Safari, including
 * for the person who has the app installed and is reading the mail on the phone
 * it is installed on. With it, the same `https://daysofar.com/progress` in the
 * weekly review opens the app on Progress, and still opens the web app for
 * everyone else — one URL, no interstitial, no `daysofar://` prompt.
 *
 * A route handler rather than a file in `public/`, for one blunt reason: Apple
 * requires `application/json` and the file has no extension, so a static server
 * serves it as `application/octet-stream` and the association silently never
 * takes. Here the content type is stated.
 *
 * Absent configuration this 404s rather than serving a partial document. That
 * is deliberate — Apple's CDN caches this aggressively, and a malformed
 * association is considerably harder to undo than a missing one.
 */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new NextResponse('Not configured', { status: 404 });

  return NextResponse.json(
    {
      applinks: {
        /*
         * An allowlist, never a wildcard.
         *
         * `/verify`, `/reset` and the Google OAuth callback all have to stay in
         * the browser — a sign-in link that opens an app which cannot complete
         * it is a dead end, and the callback is not ours to intercept at all.
         * Claiming only the paths we mean leaves every one of those alone.
         */
        details: [{ appIDs: [`${teamId}.${IOS_BUNDLE_ID}`], components: APP_LINK_PATHS.map((path) => ({ '/': path })) }],
      },
    },
    {
      headers: {
        'content-type': 'application/json',
        // Long enough that Apple's CDN is not hammered, short enough that a
        // correction lands the same day.
        'cache-control': 'public, max-age=3600',
      },
    },
  );
}
