import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureTransport,
  EmailDeliveryError,
  logTransport,
  resendTransport,
  setTransport,
  transport,
  type OutboundEmail,
} from '../src/email/transport.ts';

/**
 * What actually goes on the wire to Resend, and what happens when it does not
 * arrive. `fetch` is injected rather than patched globally so these are plain
 * assertions about a request object.
 */

const MESSAGE: OutboundEmail = {
  to: 'someone@example.test',
  subject: 'Subject',
  html: '<p>Body</p>',
  text: 'Body',
};

function fakeFetch(response: Omit<Partial<Response>, 'body'> & { body?: string }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: async () => response.body ?? '{"id":"re_123"}',
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

afterEach(() => {
  setTransport(null);
  vi.restoreAllMocks();
});

describe('resendTransport', () => {
  it('posts the documented shape and returns the provider id', async () => {
    const { impl, calls } = fakeFetch({});
    const result = await resendTransport({
      apiKey: 'key_test',
      from: 'Day So Far <hi@example.test>',
      replyTo: 'reply@example.test',
      fetchImpl: impl,
    }).send({ ...MESSAGE, headers: { 'List-Unsubscribe': '<https://example.test/u>' } });

    expect(result).toEqual({ id: 're_123', status: 'sent' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.init.method).toBe('POST');

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer key_test');
    expect(headers['content-type']).toBe('application/json');

    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      from: 'Day So Far <hi@example.test>',
      to: ['someone@example.test'],
      subject: 'Subject',
      html: '<p>Body</p>',
      // Both parts, always: the text one is what filters read.
      text: 'Body',
      reply_to: 'reply@example.test',
      headers: { 'List-Unsubscribe': '<https://example.test/u>' },
    });
  });

  it('omits reply_to and headers when there are none to send', async () => {
    const { impl, calls } = fakeFetch({});
    await resendTransport({ apiKey: 'k', from: 'a@example.test', fetchImpl: impl }).send(MESSAGE);

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).not.toHaveProperty('reply_to');
    expect(body).not.toHaveProperty('headers');
  });

  it('passes an idempotency key to the provider as well as keeping it locally', async () => {
    const { impl, calls } = fakeFetch({});
    await resendTransport({ apiKey: 'k', from: 'a@example.test', fetchImpl: impl }).send({
      ...MESSAGE,
      idempotencyKey: 'weekly_review:u1:2026-08-10',
    });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('weekly_review:u1:2026-08-10');
  });

  it('surfaces the provider’s own message on a rejection', async () => {
    const { impl } = fakeFetch({
      ok: false,
      status: 422,
      body: JSON.stringify({ name: 'validation_error', message: 'The from address is not verified' }),
    });

    const send = resendTransport({ apiKey: 'k', from: 'a@example.test', fetchImpl: impl }).send(
      MESSAGE,
    );
    await expect(send).rejects.toThrow('The from address is not verified');
    await expect(send).rejects.toMatchObject({ name: 'EmailDeliveryError', status: 422 });
  });

  it('falls back to the status when the error body is not JSON', async () => {
    const { impl } = fakeFetch({ ok: false, status: 502, body: '<html>bad gateway</html>' });

    await expect(
      resendTransport({ apiKey: 'k', from: 'a@example.test', fetchImpl: impl }).send(MESSAGE),
    ).rejects.toThrow('Resend returned 502');
  });

  it('reports an unreachable provider as status 0, not as a provider answer', async () => {
    const impl = (async () => {
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;

    try {
      await resendTransport({ apiKey: 'k', from: 'a@example.test', fetchImpl: impl }).send(MESSAGE);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(EmailDeliveryError);
      expect((error as EmailDeliveryError).status).toBe(0);
      expect((error as Error).message).toContain('Could not reach Resend');
    }
  });

  it('accepts a success body with no id rather than failing on it', async () => {
    const { impl } = fakeFetch({ body: '{}' });
    const result = await resendTransport({
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: impl,
    }).send(MESSAGE);

    expect(result).toEqual({ id: null, status: 'sent' });
  });
});

describe('logTransport', () => {
  it('writes the text part to the logger and reports it as logged, not sent', async () => {
    const logger = { info: vi.fn() };
    const result = await logTransport(logger as never).send(MESSAGE);

    expect(result).toEqual({ id: null, status: 'logged' });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: { to: MESSAGE.to, subject: MESSAGE.subject } }),
      expect.stringContaining('no RESEND_API_KEY'),
    );
  });

  it('falls back to the console when there is no logger', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await logTransport().send(MESSAGE);

    // The point of the fallback is that the reset link is visible to whoever is
    // running the server locally.
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('someone@example.test'));
  });
});

describe('transport selection', () => {
  it('is the log transport under test, where no key is configured', () => {
    // The suite installs a capture transport for every test; drop it to see
    // what an unconfigured deployment would actually resolve to.
    setTransport(null);
    expect(transport().name).toBe('log');
  });

  it('prefers an override, and forgets it when cleared', () => {
    const capture = captureTransport();
    setTransport(capture);
    expect(transport()).toBe(capture);

    setTransport(null);
    expect(transport().name).toBe('log');
  });
});

describe('captureTransport', () => {
  it('keeps what it was given and numbers the results', async () => {
    const capture = captureTransport();
    expect(await capture.send(MESSAGE)).toEqual({ id: 'test-1', status: 'sent' });
    expect(await capture.send({ ...MESSAGE, subject: 'Second' })).toEqual({
      id: 'test-2',
      status: 'sent',
    });
    expect(capture.sent.map((m) => m.subject)).toEqual(['Subject', 'Second']);
  });
});
