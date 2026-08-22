import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ChatStreamEvent } from '@ct/shared';
import { createApiClient } from '@ct/api-client';
import { scriptAgent } from './helpers/agent-mock.ts';
import { appFor, createUser, setUserTargets, type TestUser } from './helpers/factories.ts';

/**
 * Both ends of `/chat/stream`, against each other.
 *
 * The route's own tests assert what it writes and the provider's assert what it
 * emits, but the parser that turns one into the other lives in `@ct/api-client`
 * and runs in a browser — which is the one place nothing else in this
 * repository executes. That gap is exactly where an SSE bug lives comfortably:
 * a frame reader that assumes each network chunk is a whole message works
 * perfectly against a fast local server and corrupts long replies in
 * production, because a chunk boundary falls wherever TCP decides.
 *
 * So these tests take the real bytes the real route produces, hand them to the
 * real client through a `fetch` that chops them into deliberately awkward
 * pieces, and check that what comes out the far end is what went in.
 */

let user: TestUser;
let app: FastifyInstance;
let cookie: string;

beforeEach(async () => {
  user = await createUser();
  ({ app, cookie } = await appFor(user));
  await setUserTargets(user, '2020-01-01', { kcal: 2200, protein_g: 160 });
});

afterEach(async () => {
  await app.close();
});

/**
 * A `fetch` that answers from the Fastify app and re-delivers the body in
 * fixed-size slices.
 *
 * `chunk` is the whole point. At one byte a frame is split across dozens of
 * reads, including in the middle of a JSON string and between the two newlines
 * that terminate it — every boundary a real network can produce, and several it
 * would have to be unlucky to.
 */
function chunkedFetch(chunk: number): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    const response = await app.inject({
      method: (init.method ?? 'GET') as never,
      url: new URL(url).pathname,
      headers: { cookie, ...(init.headers instanceof Headers ? Object.fromEntries(init.headers) : {}) },
      payload: init.body as string,
    });

    const bytes = new TextEncoder().encode(response.payload);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += chunk) {
          controller.enqueue(bytes.slice(at, at + chunk));
        }
        controller.close();
      },
    });

    return new Response(body, { status: response.statusCode, headers: response.headers as never });
  }) as unknown as typeof fetch;
}

const clientWith = (chunk: number) =>
  createApiClient({ baseUrl: 'http://api.test', fetchImpl: chunkedFetch(chunk) });

describe('a streamed turn, end to end', () => {
  it('reassembles the reply whatever the chunk boundaries are', async () => {
    // Long enough, and multi-byte enough, that a naive reader mangles it: an
    // em dash is three bytes and will be split by the one-byte case below.
    const reply = 'Added to lunch — chicken and rice, about 620 kcal and 42 g of protein.';

    for (const chunk of [1, 7, 4096]) {
      scriptAgent({ turns: [{ text: 'One moment.' }], text: reply });

      const events: ChatStreamEvent[] = [];
      const response = await clientWith(chunk).chatStream({ text: 'chicken and rice' }, (e) =>
        events.push(e),
      );

      expect(events).toContainEqual({ type: 'text', text: 'One moment.' });
      expect(events).toContainEqual({ type: 'text', text: reply });
      // The resolved response is the authority, and it is byte-identical to
      // what the plain route would have returned.
      expect(response.message.content).toBe(reply);
      expect(response.day.local_date).toBeTruthy();
    }
  });

  /**
   * Applying the events the way the journal does must land on the same string
   * the server stored. This is the property the `tool` event exists for: text
   * before a tool call is a preamble, not part of the answer, so a client that
   * keeps it shows something that jumps when the real reply arrives.
   */
  it('leaves a client that clears on `tool` holding exactly the stored reply', async () => {
    scriptAgent({
      turns: [{ text: 'Let me log that.', toolUse: 'mcp__nutrition__log_food' }],
      text: 'Logged — 140 kcal.',
    });

    let shown = '';
    const response = await clientWith(13).chatStream({ text: 'two eggs' }, (event) => {
      if (event.type === 'text') shown += event.text;
      else shown = '';
    });

    expect(shown).toBe('Logged — 140 kcal.');
    expect(shown).toBe(response.message.content);
  });

  it('raises a pre-flight rejection as an ordinary error, not as a silent stream', async () => {
    await expect(clientWith(64).chatStream({ text: '' }, () => {})).rejects.toThrow();
  });

  it('raises a failure that arrived inside the stream', async () => {
    scriptAgent({ turns: [{ text: 'Working on it.' }], throwsLate: 'the model exploded' });
    await expect(clientWith(64).chatStream({ text: 'hi' }, () => {})).rejects.toThrow(
      'the model exploded',
    );
  });

  /**
   * A connection that dies mid-turn resolves with nothing to render, and
   * "nothing" must not be mistaken for an empty reply — the turn may well have
   * landed, and the caller's reconciliation is what should run next.
   */
  it('refuses to resolve when the stream ends without a terminal frame', async () => {
    const truncating = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"text","text":"Log'));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: 'http://api.test', fetchImpl: truncating });
    await expect(client.chatStream({ text: 'hi' }, () => {})).rejects.toThrow(/dropped/);
  });
});
