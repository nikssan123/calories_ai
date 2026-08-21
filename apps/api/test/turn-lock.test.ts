import { beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import { runTurn } from '../src/ai/run.ts';
import { getUser } from '../src/services/user.ts';
import {
  TURN_LEASE_SECONDS,
  TurnInProgressError,
  withTurnLock,
} from '../src/services/turn-lock.ts';
import { scriptAgent } from './helpers/agent-mock.ts';
import { addWeight, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * One turn at a time per account.
 *
 * The bug this exists to stop is not a load problem. A turn reads the day's
 * totals, spends twenty seconds in a model call, and then writes to the same
 * day through a tool — so two turns started a second apart both read the same
 * "before", and a double-tapped send logs the meal twice while each reply
 * quotes a total that does not include the other.
 */

let user: TestUser;

beforeEach(async () => {
  user = await createUser();
  await setUserTargets(user, '2026-01-01', { kcal: 2200, protein_g: 160 });
  await addWeight(user, '2026-03-01', 85);
});

const leaseOf = async () =>
  (
    await queryOne<{ turn_lock_until: Date | null }>(
      'SELECT turn_lock_until FROM users WHERE id = $1',
      [user.id],
    )
  )?.turn_lock_until ?? null;

/** A promise somebody else resolves, so a turn can be held mid-flight. */
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

/**
 * Work that parks until told to finish, and says when it has started.
 *
 * Both halves matter. Without `started` these cases race to acquire the lease
 * and the assertions are on whichever call happened to win, which is also how a
 * turn gets left in flight past the end of its own test — and the next
 * `beforeEach` truncate then deletes the user out from under it.
 */
function parked() {
  const started = deferred();
  const finish = deferred();
  return {
    started: started.promise,
    release: finish.release,
    run: async () => {
      started.release();
      await finish.promise;
    },
  };
}

describe('withTurnLock', () => {
  it('runs the work and gives the lease back', async () => {
    expect(await withTurnLock(user.id, async () => 'done')).toBe('done');
    expect(await leaseOf()).toBeNull();
  });

  it('refuses a second holder while the first is still running', async () => {
    const held = parked();
    const first = withTurnLock(user.id, held.run);
    await held.started;

    await expect(withTurnLock(user.id, async () => 'second')).rejects.toBeInstanceOf(
      TurnInProgressError,
    );

    held.release();
    await first;
  });

  it('gives the lease back even when the work throws', async () => {
    await expect(
      withTurnLock(user.id, async () => {
        throw new Error('tool exploded');
      }),
    ).rejects.toThrow('tool exploded');

    expect(await leaseOf()).toBeNull();
    // And the next turn is not locked out by the failed one.
    expect(await withTurnLock(user.id, async () => 'ok')).toBe('ok');
  });

  /**
   * The lease is what makes a killed process heal itself. Without the expiry a
   * crash mid-turn would lock someone out of their own journal permanently.
   */
  it('takes over a lease whose holder never came back', async () => {
    await query('UPDATE users SET turn_lock_until = now() - interval \'1 second\' WHERE id = $1', [
      user.id,
    ]);
    expect(await withTurnLock(user.id, async () => 'recovered')).toBe('recovered');
  });

  it('does not take over a lease that is still live', async () => {
    await query(
      `UPDATE users SET turn_lock_until = now() + ($2 || ' seconds')::interval WHERE id = $1`,
      [user.id, String(TURN_LEASE_SECONDS)],
    );
    await expect(withTurnLock(user.id, async () => 'nope')).rejects.toBeInstanceOf(
      TurnInProgressError,
    );
  });

  it('locks one account without touching another', async () => {
    const other = await createUser();
    const held = parked();
    const first = withTurnLock(user.id, held.run);
    await held.started;

    expect(await withTurnLock(other.id, async () => 'fine')).toBe('fine');

    held.release();
    await first;
  });
});

describe('a turn taking the lease', () => {
  async function turn(text: string) {
    const profile = await getUser(user.id);
    return runTurn({ userId: user.id, ctx: user.ctx, profile, text });
  }

  it('holds it for the length of the turn and releases it after', async () => {
    let duringTurn: Date | null = null;
    scriptAgent({
      text: 'Logged.',
      act: async () => {
        duringTurn = await leaseOf();
      },
    });

    await turn('two eggs');
    expect(duringTurn).not.toBeNull();
    expect(await leaseOf()).toBeNull();
  });

  /**
   * The double-tapped send, end to end. One turn answers; the other is told to
   * wait rather than being allowed to read a day the first has not written yet.
   */
  it('refuses a second turn started while the first is in flight', async () => {
    const held = parked();
    scriptAgent({ text: 'Logged.', act: held.run }, { text: 'Logged again.' });

    const first = turn('two eggs');
    // Not merely started — inside the model call, so the lease is definitely
    // held by this turn and not by whichever call happened to win a race.
    await held.started;

    await expect(turn('two eggs')).rejects.toBeInstanceOf(TurnInProgressError);

    held.release();
    await expect(first).resolves.toBeTruthy();
  });

  it('leaves the lease clear after a turn that failed', async () => {
    scriptAgent({ throws: 'the model fell over' });
    await expect(turn('two eggs')).rejects.toThrow();
    expect(await leaseOf()).toBeNull();
  });
});
