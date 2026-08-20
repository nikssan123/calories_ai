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
 * A send that failed at the provider. Carries the status so the caller can tell
 * "your key is wrong" (never going to work) from "try later".
 */
export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
}): EmailTransport {
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  return {
    name: 'resend',
    async send(message) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json',
      };
      // Resend honours this itself, which matters because our own guard is a
      // row written before the request: a crash in between would otherwise let
      // a retry send a second copy.
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
        throw new EmailDeliveryError(providerMessage(body, response.status), response.status);
      }

      const parsed = safeJson(body) as { id?: string } | undefined;
      return { id: parsed?.id ?? null, status: 'sent' };
    },
  };
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
