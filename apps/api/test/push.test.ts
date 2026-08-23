import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { query } from '../src/db.ts';
import {
  countPushTokens,
  dropToken,
  forgetPushToken,
  pushTokensFor,
  registerPushToken,
} from '../src/services/push-tokens.ts';
import { sendPush } from '../src/push/send.ts';
import { nudgeReachedAPhone, sendNudgePush } from '../src/push/notify.ts';
import { appFor, createUser } from './helpers/factories.ts';

function ok(count: number) {
  return {
    ok: true,
    json: async () => ({ data: Array.from({ length: count }, () => ({ status: 'ok', id: 'x' })) }),
    text: async () => '',
  } as unknown as Response;
}

describe('push tokens', () => {
  it('keeps one row per device, however often it registers', async () => {
    const user = await createUser();

    await registerPushToken(user.id, { token: 'ExponentPushToken[a]', platform: 'ios' });
    await registerPushToken(user.id, { token: 'ExponentPushToken[a]', platform: 'ios' });

    expect(await countPushTokens(user.id)).toBe(1);
  });

  it('moves a device to whoever signed in on it last', async () => {
    const first = await createUser();
    const second = await createUser();

    await registerPushToken(first.id, { token: 'ExponentPushToken[shared]', platform: 'android' });
    await registerPushToken(second.id, { token: 'ExponentPushToken[shared]', platform: 'android' });

    // The point of the unique index: two rows here would mean one phone
    // buzzing with another person's food log.
    expect(await countPushTokens(first.id)).toBe(0);
    expect(await countPushTokens(second.id)).toBe(1);
  });

  it('will not let a stale client unregister a device it no longer owns', async () => {
    const first = await createUser();
    const second = await createUser();
    await registerPushToken(first.id, { token: 'ExponentPushToken[b]', platform: 'ios' });
    await registerPushToken(second.id, { token: 'ExponentPushToken[b]', platform: 'ios' });

    await forgetPushToken(first.id, 'ExponentPushToken[b]');

    expect(await countPushTokens(second.id)).toBe(1);
  });

  it('goes with the account, because a token is an address and not a record', async () => {
    const user = await createUser();
    await registerPushToken(user.id, { token: 'ExponentPushToken[c]', platform: 'ios' });

    await query('DELETE FROM users WHERE id = $1', [user.id]);

    const left = await query('SELECT 1 FROM push_tokens WHERE token = $1', [
      'ExponentPushToken[c]',
    ]);
    expect(left).toHaveLength(0);
  });
});

describe('sendPush', () => {
  it('says so rather than throwing when there is nowhere to send', async () => {
    expect(await sendPush([], { title: 't', body: 'b' })).toMatchObject({ status: 'skipped' });
  });

  it('reports a relay that refuses, and does not throw', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 502, text: async () => 'bad gateway' }) as Response,
    );

    const result = await sendPush(
      [{ token: 'ExponentPushToken[d]', platform: 'ios' }],
      { title: 't', body: 'b' },
      undefined,
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toMatchObject({ status: 'failed' });
  });

  it('forgets a device the relay says is gone', async () => {
    const user = await createUser();
    await registerPushToken(user.id, { token: 'ExponentPushToken[e]', platform: 'android' });

    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
          }),
          text: async () => '',
        }) as unknown as Response,
    );

    await sendPush(
      await pushTokensFor(user.id),
      { title: 't', body: 'b' },
      undefined,
      fetchImpl as unknown as typeof fetch,
    );

    expect(await countPushTokens(user.id)).toBe(0);
  });

  it('leaves a device alone when the failure was not about the device', async () => {
    const user = await createUser();
    await registerPushToken(user.id, { token: 'ExponentPushToken[f]', platform: 'android' });

    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: [{ status: 'error', details: { error: 'MessageTooBig' } }],
          }),
          text: async () => '',
        }) as unknown as Response,
    );

    await sendPush(
      await pushTokensFor(user.id),
      { title: 't', body: 'b' },
      undefined,
      fetchImpl as unknown as typeof fetch,
    );

    expect(await countPushTokens(user.id)).toBe(1);
  });

  it('names the channel, so nothing is filed under a fallback with a machine name', async () => {
    // Parameters declared, unused, so `mock.calls[0][1]` below is typed as the
    // request rather than as an empty tuple.
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => ok(1));
    await sendPush(
      [{ token: 'ExponentPushToken[k]', platform: 'android' }],
      { title: 't', body: 'b' },
      undefined,
      fetchImpl as unknown as typeof fetch,
    );

    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body[0]).toMatchObject({ channelId: 'default', sound: 'default' });
  });

  it('counts the devices that accepted it', async () => {
    const fetchImpl = vi.fn(async () => ok(2));
    const result = await sendPush(
      [
        { token: 'ExponentPushToken[g]', platform: 'ios' },
        { token: 'ExponentPushToken[h]', platform: 'android' },
      ],
      { title: 't', body: 'b' },
      undefined,
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toMatchObject({ status: 'sent', delivered: 2 });
  });
});

describe('the nudge policy', () => {
  it('does not reach a phone that opted out, whatever devices it has', async () => {
    const user = await createUser();
    await registerPushToken(user.id, { token: 'ExponentPushToken[i]', platform: 'ios' });
    // `notify_nudges` is false by default, which is the whole point of it.

    const result = await sendNudgePush(user.id, {
      id: '00000000-0000-0000-0000-000000000001',
      content: 'You have logged four days running.',
    } as never);

    expect(result).toMatchObject({ status: 'skipped', reason: 'opted out' });
    // And the mail still goes, because the pocket stayed quiet.
    expect(nudgeReachedAPhone(result)).toBe(false);
  });

  it('reports no devices as not having reached a phone, so the email still goes', async () => {
    const user = await createUser();
    await query('UPDATE users SET notify_nudges = true WHERE id = $1', [user.id]);

    const result = await sendNudgePush(user.id, {
      id: '00000000-0000-0000-0000-000000000002',
      content: 'Still nothing logged today.',
    } as never);

    expect(result).toMatchObject({ status: 'skipped', reason: 'no devices' });
    expect(nudgeReachedAPhone(result)).toBe(false);
  });
});

describe('dropToken', () => {
  it('removes an address without needing to know whose it was', async () => {
    const user = await createUser();
    await registerPushToken(user.id, { token: 'ExponentPushToken[j]', platform: 'ios' });

    await dropToken('ExponentPushToken[j]');

    expect(await countPushTokens(user.id)).toBe(0);
  });
});

describe('the device routes', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  async function session() {
    const user = await createUser();
    const made = await appFor(user);
    app = made.app;
    return { user, cookie: made.cookie, app: made.app };
  }

  it('registers a device and gives it back again', async () => {
    const { user, cookie, app: server } = await session();

    const registered = await server.inject({
      method: 'POST',
      url: '/notifications/device',
      headers: { cookie },
      payload: { token: 'ExponentPushToken[route]', platform: 'ios' },
    } as never);
    expect(registered.statusCode).toBe(200);
    expect(await countPushTokens(user.id)).toBe(1);

    const forgotten = await server.inject({
      method: 'DELETE',
      url: '/notifications/device',
      headers: { cookie },
      payload: { token: 'ExponentPushToken[route]' },
    } as never);
    expect(forgotten.statusCode).toBe(200);
    expect(await countPushTokens(user.id)).toBe(0);
  });

  it('refuses a platform it cannot send to', async () => {
    const { cookie, app: server } = await session();

    const response = await server.inject({
      method: 'POST',
      url: '/notifications/device',
      headers: { cookie },
      payload: { token: 'ExponentPushToken[web]', platform: 'web' },
    } as never);

    expect(response.statusCode).toBe(400);
  });

  it('refuses an empty token rather than storing an address nothing can reach', async () => {
    const { cookie, app: server } = await session();

    const response = await server.inject({
      method: 'POST',
      url: '/notifications/device',
      headers: { cookie },
      payload: { token: '   ', platform: 'android' },
    } as never);

    expect(response.statusCode).toBe(400);
  });

  it('needs a session, since a token with no owner is nobody\'s address', async () => {
    const { app: server } = await session();

    const response = await server.inject({
      method: 'POST',
      url: '/notifications/device',
      payload: { token: 'ExponentPushToken[anon]', platform: 'ios' },
    } as never);

    expect(response.statusCode).toBe(401);
  });
});
