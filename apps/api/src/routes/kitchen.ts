import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CookRequest,
  MealPlanBrief,
  PantryAddRequest,
  PantryUpdate,
  PhotoMediaType,
  RecipeBrief,
  RecipeImportRequest,
  RecipeSuggestRequest,
  ShoppingExtrasRequest,
  ShoppingExtraUpdate,
} from '@ct/shared';
import { authErrorFor, laneFor } from '../ai/providers/index.ts';
import { scanFridgePhoto, type ScanInput } from '../ai/pantry.ts';
import { generateMealPlan } from '../ai/plan.ts';
import { suggestRecipes } from '../ai/recipes.ts';
import { ModelBusyError } from '../ai/token-bucket.ts';
import { allowanceFor, PlanLimitError, requireAllowance } from '../services/usage.ts';
import {
  cookSlot,
  getMealPlan,
  planWeekFor,
  shoppingListFor,
  updateSlot,
} from '../services/mealPlans.ts';
import {
  addPantryItems,
  deletePantryItem,
  listPantry,
  PantryFullError,
  updatePantryItem,
} from '../services/pantry.ts';
import {
  addExtras,
  deleteExtra,
  ShoppingListFullError,
  updateExtra,
} from '../services/shopping.ts';
import {
  cookLibraryRecipe,
  getLibraryRecipe,
  listLibrary,
  setLibrarySaved,
} from '../services/library.ts';
import { cookRecipe, getRecipe, listRecipes, setRecipeSaved } from '../services/recipes.ts';
import { getUser, getUserContext } from '../services/user.ts';
import { claimPhoto, presignPhotoRead } from '../services/photos.ts';
import { type DayContext, localDateFor } from '../time.ts';
import { stripDataUrl } from './body.ts';
import { RECIPE_BURST, SCAN_BURST } from './limits.ts';

/**
 * The kitchen: what you have, and what you could cook with it.
 *
 * Registered as its own module rather than folded into `routes/index.ts` for
 * the same reason auth and admin are — it is a self-contained surface with its
 * own limits, and the journal's route file is long enough.
 */

/**
 * Whether this person's turns can run at all, asked of the lane that would run
 * them rather than of Claude in general.
 *
 * Five routes in this file asked `hasSubscriptionAuth() || ANTHROPIC_API_KEY`,
 * which 503s a correctly configured `openai` deployment and, now that the lane
 * is chosen per user, can refuse a turn their own lane would have run.
 */
async function laneAuthError(userId: string): Promise<string | null> {
  return authErrorFor(laneFor((await getUser(userId)).email));
}

const PhotoBody = z
  .object({
    photo_base64: z.string().min(1).optional(),
    /** An object the client already PUT to the bucket. See `ChatRequest`. */
    photo_key: z.string().max(200).optional(),
    photo_media_type: PhotoMediaType.default('image/jpeg'),
  })
  .refine((body) => body.photo_base64 || body.photo_key, {
    message: 'A photo is required',
  });

/**
 * Turns whatever the engine threw into a reply.
 *
 * The budget answers **402**, and it used to answer 429 alongside the rate
 * limiter on the grounds that "from the client's side it is the same event".
 * That was wrong in the one way that matters: a 429 means come back later and a
 * spent plan does not come back later, it comes back if you pay. The screens
 * differ — a retry against a paywall — so the statuses have to. The token
 * bucket keeps 429 and says something different again: not "you have had your
 * allowance" but "come back in a moment", which is why it carries the seconds.
 */
function recipeFailure(error: unknown, reply: FastifyReply) {
  if (error instanceof PlanLimitError) {
    return reply.status(402).send({ error: error.message, allowance: error.allowance });
  }
  if (error instanceof ModelBusyError) {
    return reply
      .status(429)
      .header('retry-after', String(error.retryAfterSeconds))
      .send({ error: error.message });
  }
  const message = (error as Error).message;
  if (message.includes('No such recipe')) return reply.status(404).send({ error: message });
  return reply.status(502).send({ error: message });
}

/** The brief, as the engine wants it. One place, so no route drops a field. */
function brief(body: RecipeBrief) {
  return {
    meal: body.meal ?? null,
    wants: body.wants ?? null,
    minutes: body.minutes ?? null,
    portions: body.portions ?? null,
    proteinMin: body.protein_min ?? null,
    kcalMax: body.kcal_max ?? null,
    focus: body.focus ?? null,
  };
}

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
  app.post('/pantry/scan', { config: { rateLimit: SCAN_BURST } }, async (request, reply) => {
    const parsed = PhotoBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'A photo is required' });
    const authError = await laneAuthError(request.userId!);
    if (authError) return reply.status(503).send({ error: authError });

    // Before the photo is claimed or presigned: a locked kitchen should cost
    // nothing to refuse, and the paywall reads better than a dead scanner.
    try {
      await requireAllowance(request.userId!, request.plan, 'pantry_scan');
    } catch (error) {
      if (error instanceof PlanLimitError) {
        return reply.status(402).send({ error: error.message, allowance: error.allowance });
      }
      throw error;
    }

    const mediaType = parsed.data.photo_media_type;
    let scan: ScanInput;

    if (parsed.data.photo_key) {
      const claimed = await claimPhoto(request.userId!, parsed.data.photo_key, mediaType);
      const url = claimed?.storageKey ? await presignPhotoRead(claimed.storageKey) : null;
      if (!claimed || !url) {
        return reply.status(400).send({ error: 'That photo upload could not be found.' });
      }
      // A presigned read, so a fridge photo never enters this process either.
      scan = { mediaType, url, photoId: claimed.id };
    } else {
      scan = { mediaType, base64: stripDataUrl(parsed.data.photo_base64!) };
    }

    try {
      return await scanFridgePhoto(request.userId!, scan);
    } catch (error) {
      // A spent per-minute budget is not a failed scan, and the shared funnel
      // already knows how to say so.
      if (error instanceof ModelBusyError) return recipeFailure(error, reply);
      request.log.error({ err: error }, 'fridge scan failed');
      return reply.status(502).send({ error: (error as Error).message });
    }
  });

  // ---- Recipes -------------------------------------------------------------

  app.post('/recipes/suggest', { config: { rateLimit: RECIPE_BURST } }, async (request, reply) => {
    const parsed = RecipeSuggestRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });
    const authError = await laneAuthError(request.userId!);
    if (authError) return reply.status(503).send({ error: authError });

    try {
      const result = await suggestRecipes(request.userId!, brief(parsed.data));
      // The fresh number, so the screen can shut the button behind the run that
      // just spent the last of it rather than on the next page load.
      return { ...result, allowance: await allowanceFor(request.userId!, request.plan, 'recipe') };
    } catch (error) {
      request.log.error({ err: error }, 'recipe suggestion failed');
      return recipeFailure(error, reply);
    }
  });

  app.get('/recipes', async (request) => {
    const q = request.query as any;
    const [recipes, allowance] = await Promise.all([
      listRecipes(request.userId!, {
        limit: Number(q?.limit ?? 20),
        savedOnly: q?.saved === 'true',
      }),
      // Carried on the list the Cook screen already fetches on load, rather
      // than a request of its own: the answer is one row, and a second round
      // trip to learn whether a button works is a second thing to go wrong.
      allowanceFor(request.userId!, request.plan, 'recipe'),
    ]);
    return { recipes, allowance };
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
   * Rework a library recipe so this person can actually cook it.
   *
   * Costs the same as inventing one from nothing, so it takes the same ceiling.
   * What it buys over a plain suggestion is a starting point somebody already
   * chose — the photograph they liked is the reason they pressed the button.
   */
  app.post(
    '/library/:slug/adapt',
    { config: { rateLimit: RECIPE_BURST } },
    async (request, reply) => {
      const parsed = RecipeBrief.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });
      const authError = await laneAuthError(request.userId!);
      if (authError) return reply.status(503).send({ error: authError });

      try {
        return await suggestRecipes(request.userId!, {
          ...brief(parsed.data),
          job: { kind: 'adapt', slug: (request.params as any).slug },
        });
      } catch (error) {
        request.log.error({ err: error }, 'recipe adaptation failed');
        return recipeFailure(error, reply);
      }
    },
  );

  /**
   * Price a recipe the user brought.
   *
   * Text only, and deliberately: somebody pasting the thing they already cook
   * is using their own recipe, where a server that fetched and stored arbitrary
   * pages would be doing something else entirely.
   */
  app.post('/recipes/import', { config: { rateLimit: RECIPE_BURST } }, async (request, reply) => {
    const parsed = RecipeImportRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Paste the recipe first' });
    }
    const authError = await laneAuthError(request.userId!);
    if (authError) return reply.status(503).send({ error: authError });

    try {
      return await suggestRecipes(request.userId!, {
        ...brief(parsed.data),
        job: { kind: 'import', text: parsed.data.text },
      });
    } catch (error) {
      request.log.error({ err: error }, 'recipe import failed');
      return recipeFailure(error, reply);
    }
  });

  // ---- The starter library -------------------------------------------------

  /**
   * A hundred real recipes, ranked by what is in the kitchen and what is left
   * of the day. No model call and no rate limit: it is a database read, and it
   * is what makes Cook worth opening before anyone has typed anything.
   */
  app.get('/library', async (request) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const q = request.query as any;
    return {
      recipes: await listLibrary(userId, ctx, {
        q: q?.q ?? null,
        category: q?.category ?? null,
        savedOnly: q?.saved === 'true',
        limit: Number(q?.limit ?? 12),
      }),
    };
  });

  app.get('/library/:slug', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const recipe = await getLibraryRecipe(userId, (request.params as any).slug, ctx);
    if (!recipe) return reply.status(404).send({ error: 'No such recipe' });
    return recipe;
  });

  app.patch('/library/:slug', async (request, reply) => {
    const parsed = z.object({ saved: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid update' });

    const found = await setLibrarySaved(
      request.userId!,
      (request.params as any).slug,
      parsed.data.saved,
    );
    if (!found) return reply.status(404).send({ error: 'No such recipe' });
    return reply.status(204).send();
  });

  app.post('/library/:slug/cook', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = CookRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    const entry = await cookLibraryRecipe(userId, (request.params as any).slug, {
      portions: parsed.data.portions,
      meal: parsed.data.meal,
      eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
      ctx,
    });
    if (!entry) return reply.status(404).send({ error: 'No such recipe' });
    return reply.status(201).send(entry);
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

  // ---- The week ahead ------------------------------------------------------

  /**
   * Plan the week.
   *
   * The most expensive call in the product, and the only one whose ceiling is
   * weekly — so it carries the same burst limit as a recipe run and its real
   * allowance is enforced in the engine, where the ledger can see it.
   */
  app.post('/plan', { config: { rateLimit: RECIPE_BURST } }, async (request, reply) => {
    const authError = await laneAuthError(request.userId!);
    if (authError) return reply.status(503).send({ error: authError });

    const parsed = MealPlanBrief.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    try {
      const { plan, message } = await generateMealPlan(request.userId!, { brief: parsed.data });
      return reply.status(201).send({ plan, message });
    } catch (error) {
      return recipeFailure(error, reply);
    }
  });

  /**
   * This week's plan, or the one for a week they name.
   *
   * 200 with a null plan rather than a 404: "you have not planned this week" is
   * an ordinary state of the screen, not a missing resource, and a 404 would
   * make every client special-case its own empty page.
   */
  app.get('/plan', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const weekStart = askedWeek(request, ctx);

    void reply;
    return { plan: await getMealPlan(userId, weekStart), week_start: weekStart };
  });

  /** Swapping a night for another recipe, or clearing it because they are out. */
  app.patch('/plan/slots/:id', async (request, reply) => {
    const parsed = SlotUpdate.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    // A slot may only point at a recipe this account owns. Without this check
    // the id in the body is a way to read anybody's recipe through their plan.
    if (parsed.data.recipe_id) {
      const recipe = await getRecipe(request.userId!, parsed.data.recipe_id);
      if (!recipe) return reply.status(404).send({ error: 'No such recipe' });
    }

    const plan = await updateSlot(request.userId!, (request.params as any).id, {
      recipeId: parsed.data.recipe_id,
      portions: parsed.data.portions ?? undefined,
    });
    if (!plan) return reply.status(404).send({ error: 'No such night in your plan' });
    return plan;
  });

  /** Cooking a planned night. `cookRecipe` unchanged, plus a stamp on the slot. */
  app.post('/plan/slots/:id/cook', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const parsed = CookRequest.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    const entry = await cookSlot(userId, (request.params as any).id, ctx, {
      portions: parsed.data.portions,
      eatenAt: parsed.data.eaten_at ? new Date(parsed.data.eaten_at) : undefined,
    });
    if (!entry) return reply.status(404).send({ error: 'Nothing to cook on that night' });
    return reply.status(201).send(entry);
  });

  /**
   * The week's ingredients and whatever they wrote on the list themselves.
   *
   * 200 with an empty list rather than a 404, for the reason `GET /plan` gives
   * for answering with a null plan: an empty list is an ordinary state of the
   * screen and not a missing resource. It used to 404 on an unplanned week,
   * which was defensible while the list was purely a projection of the plan and
   * is not any more — the screen has an "add" field on it now, and a client
   * cannot show an empty list it was told does not exist.
   */
  app.get('/plan/shopping-list', async (request, reply) => {
    const { userId, ...ctx } = await getUserContext(request.userId!);
    const weekStart = askedWeek(request, ctx);

    void reply;
    const list = await shoppingListFor(userId, weekStart);
    return list ?? { week_start: weekStart, items: [], have_already: [] };
  });

  /**
   * Writing lines nobody's recipe produced.
   *
   * The only stored part of the shopping list, and the only part a client may
   * write. Answers with the whole list rather than the rows it created, because
   * a written name can land on a row the plan already put there — the caller
   * needs to see where it went, not what it sent.
   */
  app.post('/plan/shopping-list/extras', async (request, reply) => {
    const parsed = ShoppingExtrasRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid items' });
    }

    const { userId, ...ctx } = await getUserContext(request.userId!);
    const weekStart = ISO_DATE.test(String(parsed.data.week_start ?? ''))
      ? planWeekFor(String(parsed.data.week_start))
      : askedWeek(request, ctx);

    try {
      await addExtras(userId, weekStart, parsed.data.items);
    } catch (error) {
      // Same shape a full kitchen answers with: well-formed request, fixable by
      // the caller, and the number they have to get under.
      if (error instanceof ShoppingListFullError) {
        return reply.status(409).send({ error: error.message, limit: error.limit });
      }
      throw error;
    }

    const list = await shoppingListFor(userId, weekStart);
    return reply
      .status(201)
      .send(list ?? { week_start: weekStart, items: [], have_already: [] });
  });

  /** Ticking a written line off, putting it back, or correcting what it says. */
  app.patch('/plan/shopping-list/extras/:id', async (request, reply) => {
    const parsed = ShoppingExtraUpdate.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid update' });

    const extra = await updateExtra(request.userId!, (request.params as any).id, parsed.data);
    if (!extra) return reply.status(404).send({ error: 'No such item' });
    return extra;
  });

  /** Off the list entirely — the answer to "we don't need that after all". */
  app.delete('/plan/shopping-list/extras/:id', async (request, reply) => {
    const gone = await deleteExtra(request.userId!, (request.params as any).id);
    if (!gone) return reply.status(404).send({ error: 'No such item' });
    return reply.status(204).send();
  });
}

/** The week a request is about: the one it asked for, or the one they are in. */
function askedWeek(request: { query?: unknown }, ctx: DayContext): string {
  const asked = (request.query as any)?.week_start;
  return ISO_DATE.test(String(asked ?? ''))
    ? planWeekFor(String(asked))
    : planWeekFor(localDateFor(new Date(), ctx));
}

/** Anything else in `week_start` is ignored rather than argued with. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SlotUpdate = z.object({
  /** Null clears the night. Omitted leaves it alone. */
  recipe_id: z.string().uuid().nullable().optional(),
  portions: z.number().int().min(1).max(12).optional(),
});
