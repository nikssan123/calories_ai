import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.ts';

/**
 * The receiving half.
 *
 * Resend takes delivery of anything sent to the domain, parses it, and POSTs
 * the metadata here as an `email.received` webhook. Two things then have to be
 * true before any of it is believed:
 *
 * 1. **The request really came from Resend.** This endpoint is public — it has
 *    to be, a mail provider cannot hold a session — so the signature is the
 *    only thing standing between the support inbox and anyone on the internet
 *    who finds the URL and would like to fill it with whatever they please.
 * 2. **It is recent.** A valid signature is valid forever, so without a
 *    timestamp check a request captured once can be replayed indefinitely.
 *
 * Resend signs with Svix, whose scheme is small enough to implement against
 * node's crypto rather than adding their SDK for one HMAC — and doing it here
 * means the verification is a pure function the tests can drive directly,
 * rather than something buried in a library's middleware.
 */

/** The webhook body, as far as this server cares about it. */
export interface ReceivedEmailEvent {
  type: string;
  created_at?: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string | null;
    attachments?: unknown[];
  };
}

/**
 * How far out of step with Resend's clock a request may be.
 *
 * Five minutes each way, which is Svix's own default. It is a replay window,
 * not a network-latency allowance: long enough that a stalled request or a
 * server whose clock has drifted still verifies, short enough that a captured
 * request is worthless by the time anyone could use it.
 */
const TOLERANCE_SECONDS = 5 * 60;

export interface SignatureInput {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  /** The raw body, byte for byte. A re-serialised object will not verify. */
  body: string;
  secret: string;
  now?: number;
}

export function verifyWebhookSignature(input: SignatureInput): boolean {
  const { id, timestamp, signature, body, secret } = input;
  if (!id || !timestamp || !signature || !secret) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  // Both directions: a request from the future is as suspicious as a stale one,
  // and a clock skewed the wrong way would otherwise fail closed forever.
  if (Math.abs(now - sent) > TOLERANCE_SECONDS) return false;

  // `whsec_` is a label, not part of the key. What follows it is base64.
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  /*
   * The header carries every signature currently valid for the endpoint, space
   * separated and version tagged — that is how Svix rotates a secret without a
   * gap, so both the old and the new one appear during the overlap. Any v1 that
   * matches is a pass; versions we do not know are skipped rather than failed,
   * because a scheme added later must not break an endpoint that still verifies
   * correctly under the one it does know.
   */
  return signature
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => constantTimeEquals(part.slice(3), expected));
}

function constantTimeEquals(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Whether this webhook is one we act on. Resend posts other types too. */
export function isReceivedEmail(body: unknown): body is ReceivedEmailEvent {
  const event = body as ReceivedEmailEvent | null;
  return (
    typeof event === 'object' &&
    event !== null &&
    event.type === 'email.received' &&
    typeof event.data?.email_id === 'string' &&
    typeof event.data?.from === 'string'
  );
}

export interface ReceivedEmailContent {
  text: string | null;
  html: string | null;
}

/**
 * The body, fetched separately.
 *
 * The webhook deliberately carries metadata only — a mail body is unbounded and
 * a webhook is not the place for it — so the message someone actually wrote
 * takes a second round trip. Failure here is not failure of the delivery: the
 * caller stores what it already knows and records why the body is missing,
 * because "somebody wrote in and we lost it" is the one outcome worth avoiding.
 */
export async function fetchReceivedEmail(
  emailId: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<ReceivedEmailContent> {
  if (!env.email.apiKey) throw new Error('No RESEND_API_KEY, so the body cannot be fetched');

  const response = await fetchImpl(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: { authorization: `Bearer ${env.email.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status} fetching the message body`);
  }

  const parsed = (await response.json()) as { text?: string | null; html?: string | null };
  return { text: parsed.text ?? null, html: parsed.html ?? null };
}

/**
 * `"Nik Lyutov" <nik@example.com>` split into its parts.
 *
 * A From header is a display name the sender chose plus an address the mail
 * system enforced, and only the second half means anything — which is why they
 * are stored in separate columns rather than as the one string. A name reading
 * "support@daysofar.com" is a thing a phisher writes; the address beside it is
 * the fact.
 */
export function parseAddress(header: string): { email: string; name: string | null } {
  const angled = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(header);
  if (angled) {
    const name = angled[1]!.replace(/^["']|["']$/g, '').trim();
    return { email: angled[2]!.trim().toLowerCase(), name: name || null };
  }
  return { email: header.trim().toLowerCase(), name: null };
}
