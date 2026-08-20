import { describe, expect, it } from 'vitest';
import { env } from '../src/env.ts';
import {
  unsubscribeHeaders,
  unsubscribeLink,
  verifyUnsubscribe,
} from '../src/email/unsubscribe.ts';
import { EMAIL_UNSUBSCRIBE_SECRET, forgetSecrets, getSecret } from '../src/services/secrets.ts';
import { query } from '../src/db.ts';

/**
 * The unsubscribe link is permanent and unauthenticated, so the signature is
 * the whole of its security — and the only thing it can buy is silence.
 */

describe('unsubscribeLink', () => {
  it('points the visible link at the web app and the one-click one at the API', async () => {
    const link = await unsubscribeLink('user-1');

    expect(link.url.startsWith(`${env.appUrl}/unsubscribe?`)).toBe(true);
    // Through the Next proxy, which is the only origin the browser knows.
    expect(link.postUrl.startsWith(`${env.appUrl}/api/email/unsubscribe?`)).toBe(true);
    expect(new URL(link.url).searchParams.get('u')).toBe('user-1');
  });

  it('escapes an id that would otherwise break the query string', async () => {
    const link = await unsubscribeLink('a b&c=d');
    expect(new URL(link.url).searchParams.get('u')).toBe('a b&c=d');
  });

  it('produces the same link every time, so an old email still works', async () => {
    const first = await unsubscribeLink('user-1');
    forgetSecrets();
    const second = await unsubscribeLink('user-1');

    expect(second.url).toBe(first.url);
  });
});

describe('verifyUnsubscribe', () => {
  it('accepts the signature it produced', async () => {
    const secret = await getSecret(EMAIL_UNSUBSCRIBE_SECRET);
    const link = await unsubscribeLink('user-1');
    const signature = new URL(link.url).searchParams.get('s')!;

    expect(verifyUnsubscribe('user-1', signature, secret)).toBe(true);
  });

  it('refuses the same signature against a different id', async () => {
    const secret = await getSecret(EMAIL_UNSUBSCRIBE_SECRET);
    const signature = new URL((await unsubscribeLink('user-1')).url).searchParams.get('s')!;

    expect(verifyUnsubscribe('user-2', signature, secret)).toBe(false);
  });

  it('refuses a signature made with another server’s secret', async () => {
    const signature = new URL((await unsubscribeLink('user-1')).url).searchParams.get('s')!;

    expect(verifyUnsubscribe('user-1', signature, 'a-different-secret')).toBe(false);
  });

  it('stops rather than throwing on the wrong sort of input', async () => {
    const secret = await getSecret(EMAIL_UNSUBSCRIBE_SECRET);

    expect(verifyUnsubscribe(undefined, 'x', secret)).toBe(false);
    expect(verifyUnsubscribe('user-1', undefined, secret)).toBe(false);
    expect(verifyUnsubscribe(['user-1'], 'x', secret)).toBe(false);
    // A different length must not reach timingSafeEqual, which throws on one.
    expect(verifyUnsubscribe('user-1', 'short', secret)).toBe(false);
  });

  it('stops working once the secret is rotated out of the table', async () => {
    const signature = new URL((await unsubscribeLink('user-1')).url).searchParams.get('s')!;

    await query('DELETE FROM app_secrets WHERE name = $1', [EMAIL_UNSUBSCRIBE_SECRET]);
    forgetSecrets();
    const rotated = await getSecret(EMAIL_UNSUBSCRIBE_SECRET);

    expect(verifyUnsubscribe('user-1', signature, rotated)).toBe(false);
  });
});

describe('unsubscribeHeaders', () => {
  it('emits the pair a mail client needs to draw its own button', async () => {
    const link = await unsubscribeLink('user-1');

    expect(unsubscribeHeaders(link)).toEqual({
      // Angle brackets are not decoration; RFC 2369 requires them.
      'List-Unsubscribe': `<${link.postUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
