import type { FastifyBaseLogger } from 'fastify';
import { dropToken, type PushToken } from '../services/push-tokens.ts';

/**
 * The relay.
 *
 * Expo's push service takes one call and reaches both APNs and FCM, which is
 * why the tokens table stores its tokens and not the platform-native ones: the
 * alternative is this file learning two protocols and the deployment growing
 * two sets of credentials to say one sentence.
 *
 * No API key. Expo accepts unauthenticated sends to its own tokens, and a token
 * is only ever handed out to a build signed for the project it belongs to. An
 * `EXPO_ACCESS_TOKEN` can be added later to refuse sends that did not come from
 * us, which is worth doing the day the tokens are worth stealing.
 */
const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * A hundred per request, which is Expo's documented ceiling. Nobody in this
 * product owns a hundred phones, so this exists for the shape of the loop
 * rather than for a case anyone will hit.
 */
const BATCH = 100;

export interface PushMessage {
  title: string;
  body: string;
  /** Read by the app to decide where a tap should land. */
  data?: Record<string, string>;
}

export type PushStatus = 'sent' | 'skipped' | 'failed';

export interface PushResult {
  status: PushStatus;
  /** How many devices accepted it. */
  delivered?: number;
  reason?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends one message to every device given, and prunes the ones that answer
 * that they no longer exist.
 *
 * Answers rather than throws, exactly as `sendEmail` does, and for the same
 * reason: a notification is the least important thing happening in any job that
 * triggers one, and a phone that cannot be reached is not a reason to fail the
 * weekly review that was being delivered.
 */
export async function sendPush(
  tokens: PushToken[],
  message: PushMessage,
  logger?: FastifyBaseLogger,
  fetchImpl?: typeof fetch,
): Promise<PushResult> {
  if (tokens.length === 0) return { status: 'skipped', reason: 'no devices' };

  const doFetch = fetchImpl ?? globalThis.fetch;
  let delivered = 0;

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    const payload = batch.map((device) => ({
      to: device.token,
      title: message.title,
      body: message.body,
      data: message.data,
      // The app's own notification settings decide the rest. `default` is the
      // sound a person expects from something they asked to be told.
      sound: 'default' as const,
    }));

    let tickets: ExpoTicket[];
    try {
      const response = await doFetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger?.warn({ status: response.status, text }, 'push relay refused the batch');
        return { status: 'failed', reason: `relay ${response.status}` };
      }
      const body = (await response.json()) as { data?: ExpoTicket[] };
      tickets = body.data ?? [];
    } catch (error) {
      logger?.warn({ err: error }, 'push relay unreachable');
      return { status: 'failed', reason: (error as Error).message };
    }

    for (const [index, ticket] of tickets.entries()) {
      if (ticket.status === 'ok') {
        delivered += 1;
        continue;
      }
      /*
       * The one error worth acting on. `DeviceNotRegistered` means the app is
       * gone from that phone — uninstalled, or its permission revoked — and
       * Expo will keep saying so for as long as we keep asking. Everything else
       * is a bad request or a transient failure, which is worth a log and not
       * worth deleting an address over.
       */
      const device = batch[index];
      if (device && ticket.details?.error === 'DeviceNotRegistered') {
        await dropToken(device.token).catch(() => {});
      } else {
        logger?.warn({ error: ticket.details?.error, message: ticket.message }, 'push rejected');
      }
    }
  }

  return delivered > 0
    ? { status: 'sent', delivered }
    : { status: 'failed', reason: 'every device rejected it' };
}
