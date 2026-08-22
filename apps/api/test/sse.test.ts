import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { openEventStream } from '../src/routes/sse.ts';

/**
 * The two things this file gets right that a route test cannot see.
 *
 * A reader that walks away and a connection that sits idle are both invisible
 * to `app.inject()`, which always has an attentive client and never waits long
 * enough for a heartbeat. They are also the two failures that only show up in
 * production: a phone that changed network holding a socket open forever, and
 * a proxy quietly closing a turn that had nothing to say for thirty seconds.
 */

afterEach(() => {
  vi.useRealTimers();
});

function fakes() {
  const raw = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn(), writableEnded: false };
  const reply = { hijack: vi.fn(), raw } as unknown as FastifyReply;
  const incoming = new EventEmitter();
  const request = { raw: incoming } as unknown as FastifyRequest;
  return { raw, reply, request, incoming };
}

describe('openEventStream', () => {
  /**
   * The whole reason the head is deferred: until something is sent, the route
   * still owns the status line and can answer a 429 or a 502 properly.
   */
  it('writes nothing at all until there is something to say', () => {
    const { raw, reply, request } = fakes();
    const stream = openEventStream(request, reply);

    expect(stream.started).toBe(false);
    expect(raw.writeHead).not.toHaveBeenCalled();
    expect(reply.hijack).not.toHaveBeenCalled();
  });

  it('opens with the headers a stream needs, once', () => {
    const { raw, reply, request } = fakes();
    const stream = openEventStream(request, reply);

    stream.send({ type: 'text', text: 'Logged' });
    stream.send({ type: 'text', text: '.' });

    expect(stream.started).toBe(true);
    expect(raw.writeHead).toHaveBeenCalledTimes(1);
    expect(raw.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      }),
    );
    expect(raw.write.mock.calls.map(([frame]) => frame)).toEqual([
      'data: {"type":"text","text":"Logged"}\n\n',
      'data: {"type":"text","text":"."}\n\n',
    ]);
  });

  /**
   * The gap this covers is the longest in a turn — a photo log spending the
   * better part of a minute inside a tool call — and it is measured against
   * idle proxy timeouts, which start at thirty seconds.
   */
  it('keeps the connection alive through a silence', () => {
    vi.useFakeTimers();
    const { raw, reply, request } = fakes();
    const stream = openEventStream(request, reply);
    stream.send({ type: 'text', text: 'Working' });

    vi.advanceTimersByTime(31_000);
    expect(raw.write.mock.calls.filter(([frame]) => frame === ': keep-alive\n\n')).toHaveLength(2);
  });

  /**
   * A reader who left. The turn deliberately keeps running — its tools have
   * already written to the log and the message is committed at the end — but
   * nothing may be written to a dead socket, and a heartbeat must not be what
   * holds it open.
   */
  it('goes quiet when the reader disconnects, and stops beating', () => {
    vi.useFakeTimers();
    const { raw, reply, request, incoming } = fakes();
    const stream = openEventStream(request, reply);
    stream.send({ type: 'text', text: 'Working' });
    raw.write.mockClear();

    incoming.emit('close');
    stream.send({ type: 'text', text: 'nobody is reading this' });
    vi.advanceTimersByTime(60_000);

    expect(raw.write).not.toHaveBeenCalled();
    // And the turn's own ending cannot end an already-ended response twice.
    stream.close();
    expect(raw.end).not.toHaveBeenCalled();
  });

  it('ends a stream that was never written to, rather than hanging', () => {
    const { raw, reply, request } = fakes();
    openEventStream(request, reply).close();

    expect(raw.writeHead).toHaveBeenCalledTimes(1);
    expect(raw.end).toHaveBeenCalledTimes(1);
  });

  it('ignores a disconnect once the response has already finished', () => {
    const { raw, reply, request, incoming } = fakes();
    const stream = openEventStream(request, reply);
    stream.send({ type: 'text', text: 'Logged.' });
    stream.close();

    raw.writableEnded = true;
    // Node emits `close` on the request after a normal end too; treating that
    // as a disconnect would be harmless here but wrong, and the guard is what
    // keeps it from being either.
    expect(() => incoming.emit('close')).not.toThrow();
    expect(raw.end).toHaveBeenCalledTimes(1);
  });
});
