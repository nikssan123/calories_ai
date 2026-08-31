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

function fakeFetch(
  response: Omit<Partial<Response>, 'body' | 'headers'> & {
    body?: string;
    responseHeaders?: Record<string, string>;
  },
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      headers: { get: (name: string) => response.responseHeaders?.[name] ?? null },
      text: async () => response.body ?? '{"id":"re_123"}',
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/**
 * A queue of answers, one per attempt, so a retry can be watched changing its
 * mind. Anything past the end repeats the last one.
 */
function scriptedFetch(...answers: Array<{ ok?: boolean; status?: number; body?: string }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    const answer = answers[Math.min(calls.length, answers.length - 1)]!;
    calls.push({ url, init });
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      headers: { get: (): string | null => null },
      text: async () => answer.body ?? '{"id":"re_ok"}',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** The backoff, collected instead of slept. Keeps the suite off the clock. */
function recordedSleeps() {
  const waited: number[] = [];
  return { waited, sleepImpl: async (ms: number) => void waited.push(ms) };
}

/**
 * The waits, allowing for the clock moving while they were being handed out.
 *
 * The pacer's arithmetic is exact, but it reads `Date.now()` between slots and
 * a few real milliseconds pass there — so a slot due half a second out is asked
 * for in 499. Exact equality would be a test that fails on a slow machine and
 * asserts nothing extra on a fast one.
 */
function expectWaits(waited: number[], expected: number[]): void {
  expect(waited).toHaveLength(expected.length);
  for (const [index, ms] of waited.entries()) {
    expect(ms).toBeLessThanOrEqual(expected[index]!);
    expect(ms).toBeGreaterThan(expected[index]! - 50);
  }
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
      resendTransport({
        apiKey: 'k',
        from: 'a@example.test',
        fetchImpl: impl,
        // A 502 is retried, so without this the assertion below waits out the
        // real backoff to reach the same answer.
        sleepImpl: async () => {},
      }).send(MESSAGE),
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

/**
 * Retrying, which is the difference between "the provider had a bad second" and
 * "that customer never got their weekly review". The whole reason it needs care
 * is that a retry of a message that did in fact arrive is a second copy in
 * somebody's inbox, so the rules about *when* are the substance here.
 */
describe('retrying a send', () => {
  const transportWith = (impl: typeof fetch, sleepImpl: (ms: number) => Promise<void>) =>
    resendTransport({ apiKey: 'k', from: 'a@example.test', fetchImpl: impl, sleepImpl });

  it('comes back from a rate-limit answer', async () => {
    const { impl, calls } = scriptedFetch({ ok: false, status: 429, body: '{}' }, {});
    const { waited, sleepImpl } = recordedSleeps();

    expect(await transportWith(impl, sleepImpl).send(MESSAGE)).toEqual({
      id: 're_ok',
      status: 'sent',
    });
    expect(calls).toHaveLength(2);
    expect(waited).toEqual([500]);
  });

  it('comes back from a provider that was briefly broken, backing off as it goes', async () => {
    const { impl, calls } = scriptedFetch(
      { ok: false, status: 500, body: '{}' },
      { ok: false, status: 503, body: '{}' },
      {},
    );
    const { waited, sleepImpl } = recordedSleeps();

    expect((await transportWith(impl, sleepImpl).send(MESSAGE)).status).toBe('sent');
    expect(calls).toHaveLength(3);
    expect(waited).toEqual([500, 1000]);
  });

  it('gives up after three attempts rather than holding the pass open', async () => {
    const { impl, calls } = scriptedFetch({ ok: false, status: 429, body: '{}' });
    const { sleepImpl } = recordedSleeps();

    await expect(transportWith(impl, sleepImpl).send(MESSAGE)).rejects.toMatchObject({ status: 429 });
    // Three, and then it is the delivery row's problem: `email_deliveries`
    // remembers the failure and the next tick claims it again.
    expect(calls).toHaveLength(3);
  });

  it('waits as long as the provider asked, not as long as it planned to', async () => {
    const { impl } = fakeFetch({
      ok: false,
      status: 429,
      body: '{}',
      responseHeaders: { 'retry-after': '3' },
    });
    const { waited, sleepImpl } = recordedSleeps();

    await expect(transportWith(impl, sleepImpl).send(MESSAGE)).rejects.toMatchObject({ status: 429 });
    expect(waited).toEqual([3000, 3000]);
  });

  it('caps an unreasonable Retry-After rather than sleeping through the morning', async () => {
    const { impl } = fakeFetch({
      ok: false,
      status: 429,
      body: '{}',
      responseHeaders: { 'retry-after': '600' },
    });
    const { waited, sleepImpl } = recordedSleeps();

    await expect(transportWith(impl, sleepImpl).send(MESSAGE)).rejects.toMatchObject({ status: 429 });
    expect(waited).toEqual([30_000, 30_000]);
  });

  it('does not retry a request that will fail identically forever', async () => {
    const { impl, calls } = scriptedFetch({
      ok: false,
      status: 422,
      body: JSON.stringify({ message: 'The from address is not verified' }),
    });
    const { sleepImpl } = recordedSleeps();

    await expect(transportWith(impl, sleepImpl).send(MESSAGE)).rejects.toThrow('not verified');
    expect(calls).toHaveLength(1);
  });

  /**
   * The one genuinely risky retry, and so the one with a condition on it. A
   * request that timed out may have been received and acted on before the
   * connection died — with a key the far end refuses the duplicate itself, and
   * without one there is nothing between the reader and two of the same email.
   */
  it('retries a timeout only when the provider can refuse the duplicate', async () => {
    const attempts: number[] = [];
    const impl = (async () => {
      attempts.push(1);
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;
    const { sleepImpl } = recordedSleeps();

    await expect(transportWith(impl, sleepImpl).send(MESSAGE)).rejects.toMatchObject({ status: 0 });
    expect(attempts).toHaveLength(1);

    attempts.length = 0;
    await expect(
      transportWith(impl, sleepImpl).send({ ...MESSAGE, idempotencyKey: 'safe-to-repeat' }),
    ).rejects.toMatchObject({ status: 0 });
    expect(attempts).toHaveLength(3);
  });
});

/**
 * The rate limiter in front of scheduled mail.
 *
 * Resend allows two requests a second on a new account, and the Monday review
 * pass is the one thing in this product that would post three thousand of them
 * at once. What matters as much as the pacing is who is not paced: a password
 * reset must never queue behind a morning's worth of weekly reviews.
 */
describe('the bulk lane', () => {
  it('spaces bulk sends at the configured rate', async () => {
    const { impl } = fakeFetch({});
    const { waited, sleepImpl } = recordedSleeps();
    const resend = resendTransport({
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: impl,
      bulkRatePerSecond: 2,
      sleepImpl,
    });

    await Promise.all([1, 2, 3, 4].map(() => resend.send({ ...MESSAGE, bulk: true })));

    // The first goes immediately; the rest are handed slots half a second
    // apart, and each waits for its own rather than all waking together.
    expectWaits(waited, [500, 1000, 1500]);
  });

  it('honours a raised rate', async () => {
    const { impl } = fakeFetch({});
    const { waited, sleepImpl } = recordedSleeps();
    const resend = resendTransport({
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: impl,
      bulkRatePerSecond: 10,
      sleepImpl,
    });

    await Promise.all([1, 2, 3].map(() => resend.send({ ...MESSAGE, bulk: true })));
    expectWaits(waited, [100, 200]);
  });

  it('does not make an ordinary message queue behind them', async () => {
    const { impl } = fakeFetch({});
    const { waited, sleepImpl } = recordedSleeps();
    const resend = resendTransport({
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: impl,
      bulkRatePerSecond: 1,
      sleepImpl,
    });

    // Twenty reviews already in the queue, and then somebody asks for a
    // password reset. It goes out now.
    await Promise.all(Array.from({ length: 20 }, () => resend.send({ ...MESSAGE, bulk: true })));
    const before = waited.length;
    await resend.send(MESSAGE);

    expect(waited).toHaveLength(before);
  });

  it('does not pay for its slot twice when a bulk send has to retry', async () => {
    const { impl } = scriptedFetch({ ok: false, status: 429, body: '{}' }, {});
    const { waited, sleepImpl } = recordedSleeps();
    const resend = resendTransport({
      apiKey: 'k',
      from: 'a@example.test',
      fetchImpl: impl,
      bulkRatePerSecond: 1,
      sleepImpl,
    });

    await resend.send({ ...MESSAGE, bulk: true });
    // The backoff only. Re-queueing a retry behind the rest of the backlog is
    // how a transient failure turns into a lost message.
    expect(waited).toEqual([500]);
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
