import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env.ts';

/**
 * Getting a message to Resend, and the two ways of not doing that.
 *
 * Resend's own SDK is a wrapper around one POST, and it pulls a React renderer
 * in behind it — this project builds its HTML with strings, so `fetch` against
 * the documented endpoint is both smaller and one less thing to keep current.
 * The interface exists so the rest of the codebase never learns which it is.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** List-Unsubscribe and friends. Set by the sender, not by templates. */
  headers?: Record<string, string>;
  /**
   * Passed to the provider as well as recorded locally, so a retry that gets
   * past our own check is still refused at the far end.
   */
  idempotencyKey?: string;
  /**
   * One of many, rather than one somebody is waiting for. Takes a slot from the
   * rate limiter below; an ordinary message does not queue behind it.
   */
  bulk?: boolean;
}

export interface DeliveryResult {
  /** The provider's message id, where there is a provider. */
  id: string | null;
  /** 'sent' when it left the building; 'logged' when there is no provider. */
  status: 'sent' | 'logged';
}

export interface EmailTransport {
  readonly name: string;
  send(message: OutboundEmail): Promise<DeliveryResult>;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * How many times one message is offered to the provider before giving up.
 *
 * Three, and the number is small on purpose: this is the *inline* retry, the
 * one that happens inside a single send while a caller waits. It is sized for
 * the failure it can actually fix — a rate-limit answer, a bad thirty seconds
 * at the provider, a connection that never opened. Anything that outlives three
 * attempts a second apart is an outage, and an outage is not something to hold
 * a scheduler pass open for; `email_deliveries` remembers the failure and the
 * next tick claims it again. See `MAX_DELIVERY_ATTEMPTS` in `send.ts`, which is
 * the bound on *that* loop.
 */
const MAX_SEND_ATTEMPTS = 3;

/** First backoff, doubled each attempt. Overridden by `Retry-After`. */
const BACKOFF_MS = 500;

/**
 * Requests per second the bulk lane will make, unless configured otherwise.
 *
 * Resend's own default is two per second on a new account and is raised on
 * request, so this matches what a deployment has before anybody asks. It is the
 * one number here worth revisiting on the day the review pass gets big: at two
 * a second a thousand reviews take eight minutes to post, which disappears
 * against the model time in front of them — and at ten thousand it is eighty,
 * which does not.
 */
export const DEFAULT_BULK_RATE_PER_SECOND = 2;

/**
 * A send that failed at the provider. Carries the status so the caller can tell
 * "your key is wrong" (never going to work) from "try later".
 */
export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** What the provider's own `Retry-After` asked for, where it sent one. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export function resendTransport(options: {
  apiKey: string;
  from: string;
  replyTo?: string | null;
  fetchImpl?: typeof fetch;
  /** Requests per second the bulk lane may make. */
  bulkRatePerSecond?: number;
  /** Overridable so a test does not spend the backoff in real time. */
  sleepImpl?: (ms: number) => Promise<void>;
}): EmailTransport {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const pause = options.sleepImpl ?? sleep;
  const slot = pacer(options.bulkRatePerSecond ?? DEFAULT_BULK_RATE_PER_SECOND, pause);

  /** One offer of one message. Throws `EmailDeliveryError` on anything but 2xx. */
  const post = async (message: OutboundEmail): Promise<DeliveryResult> => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
    };
    // Resend honours this itself, which matters because our own guard is a
    // row written before the request: a crash in between would otherwise let
    // a retry send a second copy. It is also what makes the retry below safe
    // to make after a timeout — see `worthRetrying`.
    if (message.idempotencyKey) headers['idempotency-key'] = message.idempotencyKey;

    let response: Response;
    try {
      response = await doFetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          // Sent alongside the HTML rather than instead of it. Every client
          // picks the part it wants, and spam filters read this one.
          text: message.text,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
          ...(message.headers ? { headers: message.headers } : {}),
        }),
        // Nothing upstream of an email is worth holding a request open for.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      // A timeout or a DNS failure. Status 0: not the provider's answer.
      throw new EmailDeliveryError(
        `Could not reach Resend: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    const body = await response.text();
    if (!response.ok) {
      throw new EmailDeliveryError(
        providerMessage(body, response.status),
        response.status,
        retryAfterMs(response),
      );
    }

    const parsed = safeJson(body) as { id?: string } | undefined;
    return { id: parsed?.id ?? null, status: 'sent' };
  };

  return {
    name: 'resend',
    async send(message) {
      // Before the first attempt and not before each one: a retry is paying for
      // a slot it already holds, and making it queue again behind the rest of
      // the Monday backlog is how a transient failure becomes a lost message.
      if (message.bulk) await slot();

      for (let attempt = 1; ; attempt += 1) {
        try {
          return await post(message);
        } catch (error) {
          const last = attempt >= MAX_SEND_ATTEMPTS;
          if (last || !worthRetrying(error, message)) throw error;

          const after = error instanceof EmailDeliveryError ? error.retryAfterMs : null;
          await pause(after ?? BACKOFF_MS * 2 ** (attempt - 1));
        }
      }
    },
  };
}

/**
 * Whether offering this message again could plausibly do anything but repeat
 * itself.
 *
 * The three yeses are the provider saying "not now" (429), the provider being
 * briefly broken (5xx), and never having reached it at all — and the third one
 * carries the only real risk in this function, so it is the one with a
 * condition on it. A request that timed out may have been received and acted on
 * before the connection died, which makes a blind retry a possible second copy
 * in somebody's inbox. With an idempotency key the far end refuses that copy
 * itself, so the retry is free; without one there is nothing standing between
 * the reader and two of the same email, and a message that failed to send is
 * the better of those two outcomes.
 *
 * Everything else — a rejected address, a malformed payload, a key that is not
 * valid — is a request that will fail identically forever, and retrying it
 * costs a delay and a quota and changes nothing.
 */
function worthRetrying(error: unknown, message: OutboundEmail): boolean {
  if (!(error instanceof EmailDeliveryError)) return false;
  if (error.status === 429 || error.status >= 500) return true;
  return error.status === 0 && Boolean(message.idempotencyKey);
}

/** `Retry-After`, in milliseconds, when the provider named a number. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers?.get?.('retry-after');
  // Tested before `Number`, which reads both an absent header and an empty one
  // as zero — and a zero here does not mean "no header", it means "come back
  // immediately", which is the one instruction that would undo the backoff
  // entirely and retry three times inside a millisecond.
  if (header === null || header === undefined || header.trim() === '') return null;

  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Capped: a provider that asks for five minutes is asking for longer than a
  // send is worth holding open, and the delivery row will bring it back.
  return Math.min(seconds, 30) * 1000;
}

/**
 * Hands out evenly spaced slots, at most `perSecond` of them.
 *
 * A stamp rather than a bucket, and a good deal simpler than one: the next slot
 * is always exactly one interval after the last, so callers sleep until their
 * own turn instead of waking up together to fight over a refill. Slots are
 * taken in the order they are asked for, which means a burst of three thousand
 * queues rather than colliding.
 *
 * It governs one process. That is the right scope for what it is protecting
 * against — a single scheduler pass posting its whole backlog at once — and it
 * is deliberately not the shared bucket `ai/token-bucket.ts` uses: a per-second
 * limit paced through Postgres would cost a round trip per email to save a
 * fraction of one, and the pass that needs pacing is the one thing in this
 * product that only ever runs in one place, behind a job lock.
 */
function pacer(perSecond: number, pause: (ms: number) => Promise<void>): () => Promise<void> {
  const interval = perSecond > 0 ? 1000 / perSecond : 0;
  let next = 0;

  return async function slot(): Promise<void> {
    if (interval === 0) return;

    const now = Date.now();
    const at = Math.max(now, next);
    next = at + interval;
    if (at > now) await pause(at - now);
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * What runs when no provider is configured.
 *
 * Deliberately not a silent no-op: an install without RESEND_API_KEY is a
 * supported way to run this, and someone testing a password reset on their
 * laptop needs the link. It goes to the log, where they are already looking.
 */
export function logTransport(logger?: FastifyBaseLogger): EmailTransport {
  return {
    name: 'log',
    async send(message) {
      const summary = { to: message.to, subject: message.subject };
      if (logger) {
        logger.info({ email: summary, text: message.text }, 'email not sent (no RESEND_API_KEY)');
      } else {
        console.info(
          `\n[email] would send to ${message.to}: ${message.subject}\n${message.text}\n`,
        );
      }
      return { id: null, status: 'logged' };
    },
  };
}

let override: EmailTransport | null = null;
let resolved: EmailTransport | null = null;

/**
 * The transport this deployment uses, built once. Tests replace it outright
 * rather than intercepting `fetch`, so what they assert on is the message this
 * code decided to send rather than the shape of somebody's HTTP client.
 */
export function transport(logger?: FastifyBaseLogger): EmailTransport {
  if (override) return override;
  if (!resolved) {
    resolved = env.email.apiKey
      ? resendTransport({
          apiKey: env.email.apiKey,
          from: env.email.from,
          replyTo: env.email.replyTo,
          bulkRatePerSecond: env.email.bulkRatePerSecond,
        })
      : logTransport(logger);
  }
  return resolved;
}

export function setTransport(next: EmailTransport | null): void {
  override = next;
  if (next === null) resolved = null;
}

/** A transport that keeps what it was given. The suite's whole mail server. */
export function captureTransport(): EmailTransport & { sent: OutboundEmail[] } {
  const sent: OutboundEmail[] = [];
  return {
    name: 'capture',
    sent,
    async send(message) {
      sent.push(message);
      return { id: `test-${sent.length}`, status: 'sent' };
    },
  };
}

/** Resend answers errors as `{ name, message, statusCode }`; fall back to the body. */
function providerMessage(body: string, status: number): string {
  const parsed = safeJson(body) as { message?: string; name?: string } | undefined;
  return parsed?.message ?? parsed?.name ?? `Resend returned ${status}`;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
