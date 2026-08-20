import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CookRequest,
  PantryAddRequest,
  PantryUpdate,
  PhotoMediaType,
  RecipeSuggestRequest,
} from '@ct/shared';
import { AUTH_HELP, hasSubscriptionAuth } from '../ai/client.ts';
import { scanFridgePhoto } from '../ai/pantry.ts';
import { suggestRecipes } from '../ai/recipes.ts';
import {
  addPantryItems,
  deletePantryItem,
  listPantry,
  PantryFullError,
  updatePantryItem,
} from '../services/pantry.ts';
import { cookRecipe, getRecipe, listRecipes, setRecipeSaved } from '../services/recipes.ts';
import { getUserContext } from '../services/user.ts';
import { stripDataUrl } from './body.ts';
import { RECIPE_LIMIT, SCAN_LIMIT } from './limits.ts';

/**
 * The kitchen: what you have, and what you could cook with it.
 *
 * Registered as its own module rather than folded into `routes/index.ts` for
 * the same reason auth and admin are — it is a self-contained surface with its
 * own limits, and the journal's route file is long enough.
 */

const PhotoBody = z.object({
  photo_base64: z.string().min(1),
  photo_media_type: PhotoMediaType.default('image/jpeg'),
});

export async function registerKitchenRoutes(app: FastifyInstance) {
  // ---- The pantry ----------------------------------------------------------

  app.get('/pantry', async (request) => ({ items: await listPantry(request.userId!) }));

  app.post('/pantry', async (request, reply) => {
    const parsed = PantryAddRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid items' });
    }
    try {
      const items = await addPantryItems(request.userId!, request.plan, parsed.data.items);
      return reply.status(201).send({ items });
    } catch (error) {
      // A full kitchen is a 409, not a 500: the request was well formed and the
      // caller can fix it by removing something.
      if (error instanceof PantryFullError) {
        return reply.status(409).send({ error: error.message, limit: error.limit });
      }
      throw error;
    }
  });

  app.patch('/pantry/:id', async (request, reply) => {
    const parsed = PantryUpdate.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid update' });

    const item = await updatePantryItem(request.userId!, (request.params as any).id, parsed.data);
    if (!item) return reply.status(404).send({ error: 'No such item' });
    return item;
  });

  app.delete('/pantry/:id', async (request, reply) => {
    const gone = await deletePantryItem(request.userId!, (request.params as any).id);
    if (!gone) return reply.status(404).send({ error: 'No such item' });
    return reply.status(204).send();
  });

  /**
   * Read a fridge photo into a list to confirm.
   *
   * Answers with a proposal and writes nothing. The client posts what survives
   * the user's editing back to `POST /pantry`, which is the only way anything
   * reaches the kitchen — a photograph is a machine's reading of a cluttered
   * shelf, and the person holding the phone can settle it in four seconds.
   */
  app.post('/pantry/scan', { config: { rateLimit: SCAN_LIMIT } }, async (request, reply) => {
    const parsed = PhotoBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'A photo is required' });
    if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) {
      return reply.status(503).send({ error: AUTH_HELP });
    }

    try {
      return await scanFridgePhoto(request.userId!, {
        mediaType: parsed.data.photo_media_type,
        base64: stripDataUrl(parsed.data.photo_base64),
      });
    } catch (error) {
      request.log.error({ err: error }, 'fridge scan failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  // ---- Recipes -------------------------------------------------------------

  app.post('/recipes/suggest', { config: { rateLimit: RECIPE_LIMIT } }, async (request, reply) => {
    const parsed = RecipeSuggestRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });
    if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) {
      return reply.status(503).send({ error: AUTH_HELP });
    }

    try {
      return await suggestRecipes(request.userId!, {
        meal: parsed.data.meal ?? null,
        wants: parsed.data.wants ?? null,
      });
    } catch (error) {
      request.log.error({ err: error }, 'recipe suggestion failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  app.get('/recipes', async (request) => {
    const q = request.query as any;
    return {
      recipes: await listRecipes(request.userId!, {
        limit: Number(q?.limit ?? 20),
        savedOnly: q?.saved === 'true',
      }),
    };
  });

  app.get('/recipes/:id', async (request, reply) => {
    const recipe = await getRecipe(request.userId!, (request.params as any).id);
    if (!recipe) return reply.status(404).send({ error: 'No such recipe' });
    return recipe;
  });

  app.patch('/recipes/:id', async (request, reply) => {
    const parsed = z.object({ saved: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid update' });

    const recipe = await setRecipeSaved(
      request.userId!,
      (request.params as any).id,
      parsed.data.saved,
    );
    if (!recipe) return reply.status(404).send({ error: 'No such recipe' });
    return recipe;
  });

  /**
   * "I cooked this."
   *
   * The best entry the product can produce: nothing described, nothing
   * estimated twice, macros settled when the recipe was written. Answers with
   * the food entry so the client can update the day without a second request —
   * the same contract `/entries/food/:id/repeat` has.
   */
  app.post('/recipes/:id/cook', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = CookRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    const entry = await cookRecipe(userId, (request.params as any).id, {
      portions: parsed.data.portions,
      meal: parsed.data.meal,
      eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
      ctx,
    });
    if (!entry) return reply.status(404).send({ error: 'No such recipe' });
    return reply.status(201).send(entry);
  });
}
