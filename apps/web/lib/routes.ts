import { isBlogPath } from '@/lib/blog';
import { isLandingPath } from '@/lib/landing';

/**
 * Screens reached from a link in an email rather than from inside the app.
 *
 * They share one awkward property: the person opening them may have no session,
 * may never have had one on this device, and in the case of a reset link is
 * there precisely because they cannot get one. So they sit outside the auth
 * gate, and outside the app's navigation — a tab bar offering "Progress" to
 * someone who is locked out is a row of dead ends.
 *
 * Listed once here because three different components have to agree about it,
 * and a route that is public in the gate but wrapped in chrome by the shell is
 * a bug nobody notices until it is in somebody's inbox.
 */
export const EMAILED_ROUTES = ['/reset', '/verify', '/unsubscribe'] as const;

export function isEmailedRoute(pathname: string): boolean {
  return (EMAILED_ROUTES as readonly string[]).includes(pathname);
}

/**
 * The documents: the policy, the terms, support, and the three pages that say
 * who builds this and how far to trust its numbers.
 *
 * Public for a harder reason than the landing page is. Someone has to be able
 * to read what they are agreeing to *before* they agree to it, the app stores
 * fetch all three URLs from a listing that has never held a session, and the
 * address in a GDPR erasure request has to be findable by someone who has
 * already deleted their account. Every one of those is a visit with no cookie.
 *
 * Support belongs here for the bluntest version of that argument: Apple
 * requires the URL on the listing and a reviewer opens it cold. It sat outside
 * this list until now, which meant the one page a locked-out person is sent to
 * bounced them to the sign-in form they could not use.
 *
 * About, how-it-works and accuracy are here because a person deciding whether
 * to believe a calorie estimate has not signed up yet, and because a product
 * that guesses at nutrition and will not say who wrote it or how well it does
 * has not earned the guess. They are the same shape as the rest: one column of
 * prose, no session, the same to everybody.
 *
 * They keep their own chrome even for a signed-in reader, unlike the emailed
 * routes above, which lose it only for a stranger. These are documents rather
 * than screens: the shell owns the viewport and never scrolls, and eight
 * hundred lines of prose inside it would be a dead page with a tab bar.
 */
export const DOCUMENT_ROUTES = [
  '/privacy',
  '/terms',
  '/support',
  '/about',
  '/how-it-works',
  '/accuracy',
] as const;

export function isDocumentRoute(pathname: string): boolean {
  return (DOCUMENT_ROUTES as readonly string[]).includes(pathname);
}

/**
 * The routes that are drawn the same way for everybody, and so can be drawn
 * before anyone knows who is asking.
 *
 * This is the list `<AuthGate>` is allowed to render *through* while the
 * session is still in flight — which, on the server, is always: `api.me()`
 * runs in an effect, and effects do not run during a render on the server. Any
 * route not on this list renders nothing until the answer arrives, so any
 * route not on this list is served to a crawler as an empty document.
 *
 * That was every route on the site until this list existed. A search engine
 * that executes JavaScript eventually recovers the page; Bing, GPTBot,
 * ClaudeBot, PerplexityBot and every link-unfurling bot in every chat app do
 * not execute anything and saw a blank body with a title.
 *
 * The bar for being on this list is that the anonymous rendering is the
 * *correct* one, not merely a harmless one. `/` qualifies because the landing
 * page is what `/` is for; the three documents qualify because they say the
 * same thing to everyone. `/login` deliberately does not: it is public, but it
 * is also inside the app shell, and drawing the shell around it before the
 * session resolves would put a tab bar on a sign-in form for one frame.
 */
export function isPrerenderableRoute(pathname: string): boolean {
  return (
    isLandingPath(pathname) ||
    isDocumentRoute(pathname) ||
    isRecipeLibraryRoute(pathname) ||
    isBlogRoute(pathname)
  );
}

/**
 * The coach's dashboard. See COACH.md §6.
 *
 * Its own shell rather than the journal's: a coach works on a laptop, reads a
 * roster rather than a ring, and has no journal on the web to put a tab bar
 * under. `AppFrame` hands these routes to `CoachFrame`.
 */
export function isCoachRoute(pathname: string): boolean {
  return pathname === '/coach' || pathname.startsWith('/coach/');
}

/**
 * An invite link, `/c/<code>`, opened from a message a coach sent.
 *
 * Public, and chrome-less for the same reason the emailed routes are: whoever
 * opens it is a client with the app on their phone and no session in this
 * browser, and the page's whole job is to hand them the code and the app.
 */
export function isInviteRoute(pathname: string): boolean {
  return pathname.startsWith('/c/');
}

/**
 * The starter library, read rather than cooked from.
 *
 * `/cook/library` and the ninety-nine pages under it are the only part of the
 * app that is worth landing on from a search result: real ingredients, real
 * method, and per-portion nutrition measured by the source rather than summed
 * by us. They are public and server-rendered for that reason alone.
 *
 * Note the boundary. `/cook` itself is the shelf — ranked against your kitchen
 * and your day, meaningless without a session — and `/cook/recipe/:id` is
 * somebody's own generated recipe. Neither is here, and neither should be.
 */
export function isRecipeLibraryRoute(pathname: string): boolean {
  return pathname === '/cook/library' || pathname.startsWith('/cook/library/');
}

/**
 * The blog, in any of the thirteen.
 *
 * Public, prerendered and chrome-less for the same reasons the recipes are: a
 * reader arrives from a search result with no session and nothing to sign into.
 * The matcher itself lives in lib/blog.ts, next to the functions that build
 * these URLs, so there is one definition of what a blog path looks like.
 */
export function isBlogRoute(pathname: string): boolean {
  return isBlogPath(pathname);
}
