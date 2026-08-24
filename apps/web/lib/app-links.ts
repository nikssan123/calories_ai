/**
 * The one place that knows which URLs belong to the app as well as the web.
 *
 * Both association files read from here, so the two platforms cannot end up
 * claiming different paths — which would be invisible until someone on the
 * wrong OS reported that a link "sometimes" opens the app.
 */

export const IOS_BUNDLE_ID = 'com.daysofar.app';
export const ANDROID_PACKAGE = 'com.daysofar.app';

/**
 * Deliberately short, and it should stay short. Every entry here is a URL that
 * stops opening in the browser for anyone with the app installed, so the test
 * for adding one is that the app has a screen which is a *better* answer than
 * the web page at the same path.
 *
 * Not here, and not by accident:
 *
 * - `/verify` and `/reset` — links a signed-out person follows, often on a
 *   different device from the one that asked. The web page is the only thing
 *   that can finish them.
 * - `/api/*` — the Google OAuth callback lands there. Intercepting it breaks
 *   sign-in outright.
 * - `/unsubscribe` — someone opting out of email must never be made to open an
 *   app to do it.
 * - `/` — the landing page. Claiming it means sharing the product with someone
 *   opens *your* app instead of showing them the pitch.
 */
export const APP_LINK_PATHS = ['/progress', '/progress/*', '/today', '/today/*'] as const;
