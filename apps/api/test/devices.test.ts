import { describe, expect, it } from 'vitest';
import { query } from '../src/db.ts';
import { describeDevice, rememberDevice } from '../src/services/devices.ts';
import { createUser } from './helpers/factories.ts';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

describe('rememberDevice', () => {
  it('reports the first sighting as new and the second as familiar', async () => {
    const user = await createUser();

    expect(await rememberDevice(user.id, CHROME_MAC, '1.2.3.4')).toMatchObject({ isNew: true });
    expect(await rememberDevice(user.id, CHROME_MAC, '1.2.3.4')).toMatchObject({ isNew: false });
  });

  it('ignores the address, so a change of network is not a change of device', async () => {
    const user = await createUser();
    await rememberDevice(user.id, CHROME_MAC, '1.2.3.4');

    // Same laptop, mobile data. An alert here is the kind people learn to
    // ignore, which costs the alert its value on the day it matters.
    expect(await rememberDevice(user.id, CHROME_MAC, '203.0.113.9')).toMatchObject({
      isNew: false,
    });
  });

  it('records the latest address seen, for the email to quote', async () => {
    const user = await createUser();
    await rememberDevice(user.id, CHROME_MAC, '1.2.3.4');
    await rememberDevice(user.id, CHROME_MAC, '203.0.113.9');

    const rows = await query<{ last_ip: string }>('SELECT last_ip FROM known_devices');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.last_ip).toBe('203.0.113.9');
  });

  it('treats a different client as a different device', async () => {
    const user = await createUser();
    await rememberDevice(user.id, CHROME_MAC, '1.2.3.4');

    expect(await rememberDevice(user.id, SAFARI_IPHONE, '1.2.3.4')).toMatchObject({ isNew: true });
    expect(await query('SELECT 1 FROM known_devices')).toHaveLength(2);
  });

  it('keeps accounts apart', async () => {
    const first = await createUser();
    const second = await createUser();
    await rememberDevice(first.id, CHROME_MAC, '1.2.3.4');

    // A shared family laptop is a new device for the second person on it.
    expect(await rememberDevice(second.id, CHROME_MAC, '1.2.3.4')).toMatchObject({ isNew: true });
  });

  it('survives signing out — which is why it is not a session', async () => {
    const user = await createUser();
    await rememberDevice(user.id, CHROME_MAC, '1.2.3.4');
    await query('DELETE FROM auth_sessions');

    expect(await rememberDevice(user.id, CHROME_MAC, '1.2.3.4')).toMatchObject({ isNew: false });
  });

  it('handles a client that sends no user agent at all', async () => {
    const user = await createUser();
    const first = await rememberDevice(user.id, undefined, null);

    expect(first).toEqual({ isNew: true, label: 'an unrecognised device' });
    expect(await rememberDevice(user.id, undefined, null)).toMatchObject({ isNew: false });
  });

  it('decides "new" once, even when two sign-ins race', async () => {
    const user = await createUser();
    const results = await Promise.all([
      rememberDevice(user.id, CHROME_MAC, '1.2.3.4'),
      rememberDevice(user.id, CHROME_MAC, '1.2.3.4'),
    ]);

    expect(results.filter((result) => result.isNew)).toHaveLength(1);
  });

  it('dies with the account', async () => {
    const user = await createUser();
    await rememberDevice(user.id, CHROME_MAC, '1.2.3.4');
    await query('DELETE FROM users WHERE id = $1', [user.id]);

    expect(await query('SELECT 1 FROM known_devices')).toHaveLength(0);
  });
});

describe('describeDevice', () => {
  it('names the browser and the system', () => {
    expect(describeDevice(CHROME_MAC)).toBe('Chrome on macOS');
    expect(describeDevice(SAFARI_IPHONE)).toBe('Safari on iPhone');
  });

  it('picks the real browser out of the ones that impersonate Safari', () => {
    expect(describeDevice(`${CHROME_MAC} Edg/131.0.0.0`)).toBe('Edge on macOS');
    expect(describeDevice(`${CHROME_MAC} OPR/115.0.0.0`)).toBe('Opera on macOS');
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
      ),
    ).toBe('Firefox on Windows');
  });

  it('prefers Android over the Linux it also claims to be', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android');
  });

  it('recognises the native app', () => {
    expect(describeDevice('DaySoFar/1.2 (iPhone)')).toBe('the Day So Far app on iPhone');
  });

  it('falls back to one half when it only knows one', () => {
    expect(describeDevice('curl/8.7.1')).toBe('curl/8.7.1');
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
  });

  it('truncates something long and unrecognised rather than pasting it whole', () => {
    const label = describeDevice('x'.repeat(200));
    expect(label).toHaveLength(61);
    expect(label.endsWith('…')).toBe(true);
  });

  it('says so plainly when there is nothing to go on', () => {
    expect(describeDevice('')).toBe('an unrecognised device');
    expect(describeDevice('   ')).toBe('an unrecognised device');
  });
});
