import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { scanFridgePhoto } from '../src/ai/pantry.ts';
import {
  addPantryItems,
  ageInDays,
  deletePantryItem,
  listPantry,
  PantryFullError,
  updatePantryItem,
} from '../src/services/pantry.ts';
import { limitsFor } from '../src/services/plans.ts';
import { agentCalls, scriptAgent, systemPromptOf, userTurnOf } from './helpers/agent-mock.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * The pantry is a memory, not an inventory, and almost everything worth testing
 * here is a consequence of that: a second sighting refreshes rather than
 * duplicates, ages are real, and a fridge photo proposes rather than saves.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
});

const named = (...names: string[]) => names.map((name) => ({ name }));

describe('addPantryItems', () => {
  it('adds what it is given', async () => {
    const items = await addPantryItems(user.id, 'free', named('Chicken breast', 'Rice'));
    expect(items.map((i) => i.name).sort()).toEqual(['Chicken breast', 'Rice']);
  });

  /**
   * The failure that makes a pantry unusable inside a month. A scan run twice
   * reads the same eggs both times, and the second reading arrives capitalised
   * differently as often as not.
   */
  it('refreshes an item instead of duplicating it, whatever the case', async () => {
    await addPantryItems(user.id, 'free', named('Eggs'));
    await query(
      "UPDATE pantry_items SET last_seen_at = now() - interval '9 days' WHERE user_id = $1",
      [user.id],
    );

    const items = await addPantryItems(user.id, 'free', named('EGGS'));

    expect(items).toHaveLength(1);
    expect(ageInDays(items[0]!)).toBe(0);
  });

  /** The same thing listed twice in one batch — two shelves, one model, one call. */
  it('collapses duplicates within a single batch', async () => {
    const items = await addPantryItems(user.id, 'free', named('Peppers', 'peppers', 'Peppers'));
    expect(items).toHaveLength(1);
  });

  /**
   * A scan can see there is a carton but not how full it is. Overwriting what
   * the user typed with that nothing is a downgrade dressed as an update.
   */
  it('keeps an existing amount when the new sighting has none', async () => {
    await addPantryItems(user.id, 'free', [{ name: 'Milk', quantity_desc: 'about half left' }]);
    const [item] = await addPantryItems(user.id, 'free', [
      { name: 'Milk', quantity_desc: null, source: 'photo' },
    ]);
    expect(item!.quantity_desc).toBe('about half left');
  });

  it('never demotes a staple back to a perishable', async () => {
    await addPantryItems(user.id, 'free', [{ name: 'Olive oil', is_staple: true }]);
    const [item] = await addPantryItems(user.id, 'free', named('Olive oil'));
    expect(item!.is_staple).toBe(true);
  });

  describe('the cap', () => {
    const fill = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `Ingredient ${i}` }));

    it('refuses to go past the plan limit', async () => {
      const limit = limitsFor('free').pantryItems;
      await addPantryItems(user.id, 'free', fill(limit));
      await expect(addPantryItems(user.id, 'free', named('One too many'))).rejects.toBeInstanceOf(
        PantryFullError,
      );
    });

    /**
     * Only new names count against it. Re-confirming a full kitchen is most of
     * what a second scan does, and blocking that would make the cap punish the
     * people using the feature properly.
     */
    it('still lets a full pantry be refreshed', async () => {
      const limit = limitsFor('free').pantryItems;
      const existing = fill(limit);
      await addPantryItems(user.id, 'free', existing);
      await expect(addPantryItems(user.id, 'free', existing)).resolves.toHaveLength(limit);
    });

    it('gives a paid account more room', async () => {
      const free = limitsFor('free').pantryItems;
      await expect(addPantryItems(user.id, 'coach', fill(free + 10))).resolves.toHaveLength(free + 10);
    });
  });
});

describe('updatePantryItem', () => {
  it('marks an item as still there', async () => {
    const [item] = await addPantryItems(user.id, 'free', named('Spinach'));
    await query(
      "UPDATE pantry_items SET last_seen_at = now() - interval '12 days' WHERE id = $1",
      [item!.id],
    );

    const refreshed = await updatePantryItem(user.id, item!.id, { seen: true });
    expect(ageInDays(refreshed!)).toBe(0);
  });

  it('will not touch another account’s kitchen', async () => {
    const other = await createUser();
    const [item] = await addPantryItems(other.id, 'free', named('Butter'));

    expect(await updatePantryItem(user.id, item!.id, { name: 'Mine now' })).toBeNull();
    expect(await deletePantryItem(user.id, item!.id)).toBe(false);
    expect(await listPantry(other.id)).toHaveLength(1);
  });
});

describe('ageInDays', () => {
  /**
   * Staples never age. Asking someone to re-confirm they still own salt is
   * exactly the friction that makes a pantry not worth opening.
   */
  it('reports a staple as fresh however long it has sat there', async () => {
    const [item] = await addPantryItems(user.id, 'free', [{ name: 'Salt', is_staple: true }]);
    const ancient = { ...item!, last_seen_at: new Date('2020-01-01').toISOString() };
    expect(ageInDays(ancient)).toBe(0);
  });

  it('counts whole days for everything else', async () => {
    const [item] = await addPantryItems(user.id, 'free', named('Coriander'));
    const now = new Date(new Date(item!.last_seen_at).getTime() + 3.5 * 24 * 60 * 60 * 1000);
    expect(ageInDays(item!, now)).toBe(3);
  });
});

describe('scanFridgePhoto', () => {
  const PHOTO = { mediaType: 'image/jpeg', base64: 'iVBORw0KGgo=' };

  async function scanReporting(items: unknown[], note: string | null = null) {
    const tools = await import('../src/ai/tools.ts');
    const spy = vi.spyOn(tools, 'buildNutritionServer');

    scriptAgent({
      text: 'Here is what I can see.',
      act: async () => {
        const built = spy.mock.results.at(-1)!.value as ReturnType<typeof tools.buildNutritionServer>;
        const note_ = built.tools.find((t) => t.name === 'note_pantry_items')!;
        await note_.handler({ items, note } as never, {});
      },
    });

    return scanFridgePhoto(user.id, PHOTO);
  }

  it('reports what the model saw', async () => {
    const proposal = await scanReporting([
      { name: 'Eggs', quantity_desc: 'half a box', confidence: 'high' },
      { name: 'Something green', quantity_desc: null, confidence: 'low' },
    ]);

    expect(proposal.found).toEqual([
      { name: 'Eggs', quantity_desc: 'half a box', confidence: 'high' },
      { name: 'Something green', quantity_desc: null, confidence: 'low' },
    ]);
  });

  /**
   * The whole design of the scan. A photograph is the front row of one shelf
   * past a milk bottle; the person holding the phone settles it in four seconds,
   * but only if nothing was written behind their back first.
   */
  it('writes nothing to the pantry', async () => {
    await scanReporting([{ name: 'Chicken', quantity_desc: null, confidence: 'high' }]);
    expect(await listPantry(user.id)).toEqual([]);
  });

  it('says which finds are already listed, ignoring case', async () => {
    await addPantryItems(user.id, 'free', named('eggs'));
    const proposal = await scanReporting([
      { name: 'Eggs', quantity_desc: null, confidence: 'high' },
      { name: 'Chorizo', quantity_desc: null, confidence: 'medium' },
    ]);
    expect(proposal.already_known).toEqual(['Eggs']);
  });

  /** Its own prompt and its own tools — no way to reach the nutrition log. */
  it('runs on the scan prompt with only the kitchen tools', async () => {
    await scanReporting([]);

    const call = agentCalls.at(-1)!;
    expect(systemPromptOf(call)).toContain('photo of someone');
    expect(call.options.allowedTools.sort()).toEqual([
      'mcp__nutrition__note_pantry_items',
      'mcp__nutrition__propose_recipe',
    ]);
  });

  /**
   * The fourth agent session that writes measurements at somebody, after the
   * journal, the review and the recipe writer — the quantities it notes land on
   * the kitchen list and are read there.
   */
  it('tells an imperial account\'s scan to note quantities in ounces', async () => {
    await query('UPDATE users SET units = $1 WHERE id = $2', ['imperial', user.id]);
    await scanReporting([]);
    expect(userTurnOf(agentCalls.at(-1)!)).toContain('reads imperial');
  });

  it('says nothing about units to a metric account', async () => {
    await scanReporting([]);
    expect(userTurnOf(agentCalls.at(-1)!)).not.toContain('reads imperial');
  });

  it('records the turn against its own kind', async () => {
    await scanReporting([]);
    const row = await queryOne<{ kind: string }>(
      'SELECT kind FROM ai_usage WHERE user_id = $1',
      [user.id],
    );
    expect(row!.kind).toBe('pantry_scan');
  });

  /** The photo is kept, so a scan that read the fridge wrongly can be looked at. */
  it('stores the photo', async () => {
    await scanReporting([]);
    const row = await queryOne<{ n: string }>(
      'SELECT count(*) AS n FROM photos WHERE user_id = $1',
      [user.id],
    );
    expect(Number(row!.n)).toBe(1);
  });
});
