import type { FastifyInstance } from 'fastify';
import { Locale } from '@ct/shared';
import { getPublicLibraryRecipe, listPublicLibrary } from '../services/library.ts';
import { publicIndex, publicPost, publicSitemap } from '../services/content.ts';

/**
 * The read-only, session-less corner of the API.
 *
 * Everything under `/public/` answers the same to a crawler, a logged-out
 * visitor and a signed-in one, and nothing under it touches a user row. That
 * uniformity is the security argument as well as the caching one: there is no
 * per-caller branch here to get wrong.
 *
 * It exists because `/library/:slug` never could. The route needs a `userId` to
 * work out `saved`, `have`, `missing` and `fits_today`, so a page built on it
 * could not be rendered for somebody who is not signed in — which is every
 * search engine. Ninety-nine recipes with real ingredients, real method and
 * measured per-portion nutrition sat behind that, invisible.
 *
 * `/public/` is on the allowlist in app.ts as a prefix rather than route by
 * route, which is the opposite of the rule applied to `/billing`. The reason is
 * the shape of the mistake each namespace invites: a new billing route is
 * private until proved otherwise, and a new `/public/` route is public by its
 * own name. Nothing may be added here that reads a session.
 */
export async function registerPublicRoutes(app: FastifyInstance) {
  /** Every recipe as a card, for the library index and the sitemap. */
  app.get('/public/library', async () => ({ recipes: await listPublicLibrary() }));

  app.get('/public/library/:slug', async (request, reply) => {
    const recipe = await getPublicLibraryRecipe((request.params as any).slug);
    if (!recipe) return reply.status(404).send({ error: 'No such recipe' });
    return recipe;
  });

  // ---- The blog ------------------------------------------------------------
  //
  // Only `status = 'published'` ever leaves here; see services/content.ts. A
  // draft is an unreviewed nutrition claim, and the whole review step is worth
  // nothing if a URL can be guessed to see one early.

  app.get('/public/posts/:locale', async (request, reply) => {
    const locale = Locale.safeParse((request.params as any).locale);
    if (!locale.success) return reply.status(404).send({ error: 'No such language' });
    return { posts: await publicIndex(locale.data) };
  });

  app.get('/public/posts/:locale/:slug', async (request, reply) => {
    const params = request.params as any;
    const locale = Locale.safeParse(params.locale);
    if (!locale.success) return reply.status(404).send({ error: 'No such language' });
    const post = await publicPost(locale.data, params.slug);
    if (!post) return reply.status(404).send({ error: 'No such post' });
    return post;
  });

  /** Every published post in every language, for the sitemap. */
  app.get('/public/posts', async () => ({ posts: await publicSitemap() }));
}
