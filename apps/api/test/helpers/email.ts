import { captureTransport, setTransport, type OutboundEmail } from '../../src/email/transport.ts';

/**
 * The suite's mail server: a list.
 *
 * Installed for every test rather than only the ones that care, for the same
 * reason the Agent SDK is mocked globally — a route that quietly grew an email
 * should not start writing to a log, or worse to a network, in a test about
 * something else. With no key configured the real fallback is a log transport,
 * which would bury the suite's output in confirmation emails.
 */
let current = captureTransport();

export function resetMailbox(): void {
  current = captureTransport();
  setTransport(current);
}

/** Everything sent since the last reset, oldest first. */
export function mailbox(): OutboundEmail[] {
  return current.sent;
}

export function lastEmail(): OutboundEmail | undefined {
  return current.sent.at(-1);
}

/** The one email sent to this address, or undefined. Fails loudly on two. */
export function emailTo(address: string): OutboundEmail | undefined {
  const matches = current.sent.filter((message) => message.to === address);
  if (matches.length > 1) {
    throw new Error(`Expected at most one email to ${address}, found ${matches.length}`);
  }
  return matches[0];
}
