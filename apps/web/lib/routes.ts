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
