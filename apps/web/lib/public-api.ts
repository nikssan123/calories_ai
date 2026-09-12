import type { Locale, LibraryCard, PostCard, PublicLibraryRecipe, PublicPost } from '@ct/shared';

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
  /*
   * Three attempts, because the failure this guards against is a deploy.
   *
   * `docker compose up -d` recreates the web and API containers together, and
   * the web app can be answering requests a second or two before the API is.
   * A single attempt would return null there — and then ISR would cache that
   * null for the full hour, which is how a deploy shipped a four-URL sitemap
   * and a recipe index reading "the library is not loading just now" while the
   * API beside it was serving all ninety-nine perfectly well.
   *
   * A transient failure must not become an hour of a wrong page.
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    try {
      const response = await fetch(`${API_URL}${path}`, {
        headers: { accept: 'application/json' },
        next: { revalidate: REVALIDATE },
      });
      // A 404 is an answer, not a failure: the slug does not exist and retrying
      // will not change that.
      if (response.status === 404) return null;
      if (!response.ok) continue;
      return (await response.json()) as T;
    } catch {
      // Network-level: the API is not listening yet, or not any more.
    }
  }

  /*
   * Null rather than a throw, and every caller treats it as "not found" or "no
   * rows". The alternatives are worse than a thin page: an unhandled throw is a
   * 500 that Google records as a site-level fault, and an error page would be
   * cached exactly as long as the empty one.
   */
  return null;
}

export async function publicRecipe(slug: string): Promise<PublicLibraryRecipe | null> {
  return get<PublicLibraryRecipe>(`/public/library/${encodeURIComponent(slug)}`);
}

export async function publicLibrary(): Promise<LibraryCard[]> {
  const body = await get<{ recipes: LibraryCard[] }>('/public/library');
  return body?.recipes ?? [];
}

// ---- The blog ---------------------------------------------------------------

export async function publicPosts(locale: Locale): Promise<PostCard[]> {
  const body = await get<{ posts: PostCard[] }>(`/public/posts/${locale}`);
  return body?.posts ?? [];
}

export async function publicPost(locale: Locale, slug: string): Promise<PublicPost | null> {
  return get<PublicPost>(`/public/posts/${locale}/${encodeURIComponent(slug)}`);
}

/** Every published post in every language, for the sitemap. */
export async function publicPostSitemap(): Promise<
  { locale: Locale; slug: string; updated_at: string }[]
> {
  const body = await get<{ posts: { locale: Locale; slug: string; updated_at: string }[] }>(
    '/public/posts',
  );
  return body?.posts ?? [];
}
