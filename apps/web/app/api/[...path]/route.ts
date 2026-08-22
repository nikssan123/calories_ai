import { NextResponse } from 'next/server';

/**
 * Thin proxy to the API service. It exists so the browser talks to one origin
 * and the session cookie is relayed in both directions.
 *
 * React Native will call the API directly with a bearer token instead; the API
 * and the shared client are unchanged either way.
 */

// Server-only: the browser talks to this route, never to the API directly, so
// the internal hostname must not be inlined into the client bundle.
const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function forward(request: Request, path: string[]) {
  const url = new URL(request.url);
  const target = `${API_URL}/${path.join('/')}${url.search}`;

  const headers = new Headers();
  // Pass the caller's session through to the API.
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const canHaveBody = request.method !== 'GET' && request.method !== 'HEAD';
  const requestBody = canHaveBody ? await request.text() : '';
  // A bodyless request must arrive at the API bodyless and unlabelled: an empty
  // string still makes fetch stamp a content-type on the way out, and the API
  // rejects a content-type with nothing behind it.
  const contentType = request.headers.get('content-type');
  if (requestBody && contentType) headers.set('content-type', contentType);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: requestBody || undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

    const responseType = response.headers.get('content-type') ?? 'application/json';
    // Images come back as bytes; everything else is JSON.
    const body = responseType.startsWith('image/')
      ? await response.arrayBuffer()
      : await response.text();

    const out = new NextResponse(body as BodyInit, {
      status: response.status,
      headers: { 'content-type': responseType },
    });

    /*
     * Relay a redirect rather than swallowing it.
     *
     * Everything else here is a fetch from the page, which never redirects. The
     * Google sign-in handshake is the exception and is nothing but redirects:
     * the browser navigates to `/api/auth/google/start`, and a 302 that arrives
     * with its Location stripped is a blank page instead of Google's consent
     * screen. `redirect: 'manual'` above is what leaves the 3xx intact for this
     * to forward — following it here would send the API's request to Google
     * rather than the person's browser.
     */
    const location = response.headers.get('location');
    if (location) out.headers.set('location', location);

    /*
     * And relay the cacheability along with it, which for one route is the
     * difference between a working image and a broken one. A photo in object
     * storage answers with a redirect to a URL that expires in minutes, while
     * the redirect itself describes a photo that does not — so the API marks it
     * `no-store`, and dropping that here would let a browser keep serving a
     * dead link. A 302 is not cacheable by default, which makes this a belt
     * rather than the braces, but the intent should survive the proxy.
     */
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) out.headers.set('cache-control', cacheControl);

    // Relay Set-Cookie so login and logout actually take effect in the browser.
    // getSetCookie() preserves multiple cookies, which .get() would collapse.
    for (const value of response.headers.getSetCookie?.() ?? []) {
      out.headers.append('set-cookie', value);
    }
    return out;
  } catch {
    return NextResponse.json(
      { error: `Cannot reach the API at ${API_URL}. Is it running?` },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
