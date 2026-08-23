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
 * The privacy policy and the terms.
 *
 * Public for a harder reason than the landing page is. Someone has to be able
 * to read what they are agreeing to *before* they agree to it, the app stores
 * fetch both URLs from a listing that has never held a session, and the address
 * in a GDPR erasure request has to be findable by someone who has already
 * deleted their account. Every one of those is a visit with no cookie.
 *
 * They keep their own chrome even for a signed-in reader, unlike the emailed
 * routes above, which lose it only for a stranger. These are documents rather
 * than screens: the shell owns the viewport and never scrolls, and eight
 * hundred lines of prose inside it would be a dead page with a tab bar.
 */
export const LEGAL_ROUTES = ['/privacy', '/terms'] as const;

export function isLegalRoute(pathname: string): boolean {
  return (LEGAL_ROUTES as readonly string[]).includes(pathname);
}
