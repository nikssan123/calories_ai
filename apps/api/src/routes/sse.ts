import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatStreamEvent } from '@ct/shared';

/**
 * Server-sent events, with the head written late.
 *
 * SSE is the right transport for this: one direction, text frames, and the
 * browser's own reconnect semantics are not wanted (a turn is not resumable, it
 * is re-runnable, and re-running one logs the meal twice). What it does *not*
 * give for free is the thing this file is mostly about — the moment the status
 * line goes out.
 *
 * Writing `200 text/event-stream` immediately is the obvious implementation and
 * it throws away every status code the route still needs. The turn lease
 * rejects a double-tapped send before the model is ever called, and that answer
 * is a 429 with a `retry-after`, not a 200 containing an apology. So the head is
 * deferred until there is genuinely something to say, and `started` tells the
 * route which world it is in when something goes wrong.
 */

/** Heartbeat gap. See `beat` below for why this number and not a longer one. */
const HEARTBEAT_MS = 15_000;

export interface EventStream {
  /** True once the head has gone out and the status code is spent. */
  readonly started: boolean;
  send(event: ChatStreamEvent): void;
  /** Ends the response. Returns the reply, so a route can `return` it. */
  close(): FastifyReply;
}

export function openEventStream(request: FastifyRequest, reply: FastifyReply): EventStream {
  let started = false;
  let closed = false;
  let heartbeat: NodeJS.Timeout | null = null;

  /*
   * A reader that has gone away.
   *
   * The turn deliberately keeps running — its tools have already written to the
   * log and the message is committed at the end, so abandoning it would leave
   * the meal logged and the reply lost. What stops is the writing: further
   * frames go nowhere, and the heartbeat must not hold a dead socket open.
   */
  request.raw.on('close', () => {
    if (!reply.raw.writableEnded) stop();
  });

  function stop(): void {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  }

  function start(): void {
    started = true;
    // Taken off Fastify's hands: from here the socket is written directly, and
    // without this Fastify would also try to send a body of its own.
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      // The frames describe one turn and are meaningless replayed. `no-store`
      // rather than `no-cache` so nothing keeps a copy at all.
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // nginx buffers proxied responses by default, which turns a stream back
      // into the single blob this route exists to stop being. Caddy does not,
      // but the header costs nothing and the deployment is not the only place
      // this will ever run.
      'x-accel-buffering': 'no',
    });

    /*
     * A comment frame every fifteen seconds, ignored by every SSE parser.
     *
     * The gap it covers is real and is the longest one in a turn: a photo log
     * on Opus can spend the better part of a minute between the model's last
     * word and its next, with a tool call in between. Idle proxy timeouts start
     * at thirty seconds in common configurations, so the interval has to be
     * comfortably under that rather than merely under the turn's length.
     */
    heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(': keep-alive\n\n');
    }, HEARTBEAT_MS);
    // Node keeps the process alive for a pending timer; a heartbeat must never
    // be the reason a shutdown waits.
    heartbeat.unref?.();
  }

  return {
    get started() {
      return started;
    },

    send(event: ChatStreamEvent): void {
      if (closed) return;
      if (!started) start();
      // One line, always: `JSON.stringify` cannot emit a raw newline inside a
      // string, so a frame can never be split across two `data:` lines by
      // accident — which is the classic way an SSE writer corrupts a payload.
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    },

    close(): FastifyReply {
      if (closed) return reply;
      // Nothing was ever sent — an empty turn, which no path currently
      // produces, but ending the response is still the only correct move and a
      // client parsing zero frames is a better failure than a hung request.
      if (!started) start();
      stop();
      reply.raw.end();
      return reply;
    },
  };
}
