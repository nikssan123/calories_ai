import type { LibraryCard, PublicLibraryRecipe } from '@ct/shared';

/**
 * The server's own read path to the API, for the pages a crawler has to be able
 * to see.
 *
 * Not `lib/api.ts`. That one is the browser's client: it talks to `/api/...` on
 * this origin so the session cookie is relayed, which is exactly wrong here —
 * a server component rendering for a crawler has no cookie to relay and no
 * business making a round trip out through its own proxy to get back to a
 * service sitting next to it in the compose file.
 *
 * Server components only. Nothing enforces that with a `server-only` import —
 * the package is not in the workspace — but the shape of the thing does:
 * `API_INTERNAL_URL` carries no `NEXT_PUBLIC_` prefix, so Next never inlines it
 * into a client bundle and this would read `undefined` in a browser. Keep it
 * that way; a `NEXT_PUBLIC_` fallback here would publish the internal hostname.
 */
const API_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * How long a rendered recipe page may be served before it is rebuilt.
 *
 * An hour, because the library is seeded from a file and changes when somebody
 * deploys a new one. The number that matters more is the floor: without it the
 * page would be rebuilt per request, and a crawler working through ninety-nine
 * of them would be ninety-nine round trips to Postgres for rows that had not
 * moved.
 */
const REVALIDATE = 3600;

async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: REVALIDATE },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    /*
     * Null rather than a throw, and every caller treats it as "not found".
     *
     * The API being unreachable during a render is a real possibility — a
     * restart, a cold start, a deploy — and the alternatives are worse than a
     * 404: an unhandled throw is a 500 that Google records as a site-level
     * fault, and a cached error page would outlive the outage that caused it.
     */
    return null;
  }
}

export async function publicRecipe(slug: string): Promise<PublicLibraryRecipe | null> {
  return get<PublicLibraryRecipe>(`/public/library/${encodeURIComponent(slug)}`);
}

export async function publicLibrary(): Promise<LibraryCard[]> {
  const body = await get<{ recipes: LibraryCard[] }>('/public/library');
  return body?.recipes ?? [];
}
