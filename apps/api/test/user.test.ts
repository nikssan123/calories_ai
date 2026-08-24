import { beforeEach, describe, expect, it } from 'vitest';
import { query, queryOne } from '../src/db.ts';
import {
  authenticate,
  countAccounts,
  createAccount,
  emailInUse,
  findUserByEmail,
  getUser,
  getUserContext,
  listActiveUsers,
  markOnboarded,
  missingProfileFields,
  updateUser,
} from '../src/services/user.ts';
import { createUser } from './helpers/factories.ts';

describe('getUser', () => {
  it('maps a row onto the wire shape', async () => {
    const user = await createUser({ display_name: 'Nik' });
    expect(await getUser(user.id)).toMatchObject({
      id: user.id,
      email: user.email,
      display_name: 'Nik',
      sex: 'male',
      birth_date: '1990-01-01',
      height_cm: 180,
      day_start_hour: 4,
      is_setup_complete: true,
    });
  });

  it('throws for an id that does not exist', async () => {
    await expect(getUser('00000000-0000-0000-0000-000000000000')).rejects.toThrow('User not found');
  });

  it('nulls the optional fields on a bare account', async () => {
    const bare = await createUser({
      sex: null,
      birth_date: null,
      height_cm: null,
      target_weight_kg: null,
      activity_level: null,
      goal: null,
      // Null, not 'metric': "never asked" is what the journal reads to know it
      // still has a question to put.
      units: null,
      is_setup_complete: false,
    });
    const profile = await getUser(bare.id);
    expect(profile).toMatchObject({ sex: null, birth_date: null, height_cm: null, target_weight_kg: null });
  });
});

describe('getUserContext', () => {
  it('extracts the day-boundary settings', async () => {
    const user = await createUser({ timezone: 'America/Los_Angeles', day_start_hour: 2 });
    expect(await getUserContext(user.id)).toEqual({
      userId: user.id,
      timezone: 'America/Los_Angeles',
      dayStartHour: 2,
      units: 'metric',
    });
  });

  it('carries the units, resolved, for the strings the server writes itself', async () => {
    const asked = await createUser({ email: 'ohio@example.com', units: 'imperial' });
    expect((await getUserContext(asked.id)).units).toBe('imperial');

    // Null is "onboarding never asked", and every reader of this wants an
    // answer rather than a third case to handle.
    const bare = await createUser({ email: 'new@example.com', units: null });
    expect((await getUserContext(bare.id)).units).toBe('metric');
  });
});

describe('updateUser', () => {
  it('applies only the fields present in the patch', async () => {
    const user = await createUser({ display_name: 'Before' });
    const updated = await updateUser(user.id, { display_name: 'After' });
    expect(updated.display_name).toBe('After');
    expect(updated.height_cm).toBe(180);
  });

  it('ignores undefined but writes an explicit null', async () => {
    const user = await createUser();
    const updated = await updateUser(user.id, { target_weight_kg: null });
    expect(updated.target_weight_kg).toBeNull();
    expect(updated.goal).toBe('lose');
  });

  it('is a no-op with an empty patch', async () => {
    const user = await createUser();
    expect((await updateUser(user.id, {})).id).toBe(user.id);
  });
});

describe('missingProfileFields', () => {
  it('lists nothing for a complete profile', async () => {
    const user = await createUser();
    expect(missingProfileFields(await getUser(user.id))).toEqual([]);
  });

  /*
   * Units belongs on this list even though no target depends on it, because
   * this list is also what ends setup. Left off, the conversation would finish
   * the moment a target could be computed — and hand somebody in Ohio a number
   * in kilos without ever having asked.
   */
  it('asks which units when nobody has said', async () => {
    const user = await createUser({ units: null });
    expect(missingProfileFields(await getUser(user.id))).toEqual([
      'whether they read metric or imperial units',
    ]);
  });

  it('names each gap in plain words', async () => {
    const user = await createUser({
      sex: null, birth_date: null, height_cm: null, goal: null, activity_level: null, units: null,
    });
    expect(missingProfileFields(await getUser(user.id))).toEqual([
      'sex',
      'date of birth',
      'height',
      'goal',
      'activity level',
      'whether they read metric or imperial units',
    ]);
  });
});

describe('markOnboarded', () => {
  it('sets the flag and stamps the time once', async () => {
    const user = await createUser({ is_setup_complete: false, onboarding_completed_at: null });
    await markOnboarded(user.id);
    const first = await queryOne<any>('SELECT * FROM users WHERE id = $1', [user.id]);
    expect(first.is_setup_complete).toBe(true);
    expect(first.onboarding_completed_at).not.toBeNull();

    await markOnboarded(user.id);
    const second = await queryOne<any>('SELECT onboarding_completed_at FROM users WHERE id = $1', [user.id]);
    // The original completion time is preserved, not bumped.
    expect(second.onboarding_completed_at.toISOString()).toBe(
      first.onboarding_completed_at.toISOString(),
    );
  });
});

describe('accounts', () => {
  it('creates one and finds it case-insensitively', async () => {
    const id = await createAccount('Nik@Example.com', 'correct-horse', 'Nik', 'Europe/Sofia');
    expect((await findUserByEmail('nik@example.com'))!.id).toBe(id);
    expect(await emailInUse('NIK@EXAMPLE.COM')).toBe(true);
    expect(await emailInUse('someone@else.com')).toBe(false);
  });

  it('adopts the pre-account placeholder row rather than orphaning its data', async () => {
    // Migration 001 seeds exactly this: a user row with no email.
    const orphan = await queryOne<{ id: string }>(
      "INSERT INTO users (display_name, is_setup_complete) VALUES (NULL, FALSE) RETURNING id",
    );
    const id = await createAccount('first@example.com', 'correct-horse', 'Nik', 'Europe/Sofia');
    expect(id).toBe(orphan!.id);
    expect(await countAccounts()).toBe(1);
  });

  it('creates a fresh row once an account already exists', async () => {
    await createAccount('first@example.com', 'correct-horse', null, 'Europe/Sofia');
    await queryOne<{ id: string }>(
      "INSERT INTO users (display_name, is_setup_complete) VALUES (NULL, FALSE) RETURNING id",
    );
    const second = await createAccount('second@example.com', 'correct-horse', null, 'UTC');
    const row = await queryOne<any>('SELECT email FROM users WHERE id = $1', [second]);
    expect(row.email).toBe('second@example.com');
    expect(await countAccounts()).toBe(2);
  });

  it('defaults an empty timezone to UTC', async () => {
    const id = await createAccount('tz@example.com', 'correct-horse', null, '');
    expect((await getUser(id)).timezone).toBe('UTC');
  });

  it('authenticates the right password and rejects the wrong one', async () => {
    const id = await createAccount('auth@example.com', 'correct-horse', null, 'UTC');
    expect(await authenticate('AUTH@example.com', 'correct-horse')).toBe(id);
    expect(await authenticate('auth@example.com', 'wrong')).toBeNull();
    expect(await authenticate('nobody@example.com', 'correct-horse')).toBeNull();
  });

  it('refuses to authenticate a credential-less row', async () => {
    await query("INSERT INTO users (email, display_name) VALUES ('no-pw@example.com', NULL)");
    expect(await authenticate('no-pw@example.com', 'anything')).toBeNull();
  });

  it('counts only real accounts', async () => {
    expect(await countAccounts()).toBe(0);
    await query("INSERT INTO users (display_name) VALUES (NULL)");
    expect(await countAccounts()).toBe(0);
  });
});

describe('listActiveUsers', () => {
  it('returns onboarded accounts with their day settings', async () => {
    const ready = await createUser({ timezone: 'Europe/Sofia' });
    await createUser({ is_setup_complete: false });
    await query("INSERT INTO users (display_name, is_setup_complete) VALUES (NULL, TRUE)");

    const active = await listActiveUsers();
    // The plan rides along because both scheduled passes are entitlements —
    // see the note on the query.
    expect(active).toEqual([
      { id: ready.id, timezone: 'Europe/Sofia', day_start_hour: 4, plan: 'free' },
    ]);
  });
});
