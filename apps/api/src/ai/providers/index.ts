import { env } from '../../env.ts';
import { hasSubscriptionAuth } from '../client.ts';
import type { ToolContext } from '../tools.ts';
import { createAnthropicProvider, subscriptionAuthError } from './anthropic.ts';
import { createAnthropicApiProvider, meteredApiAuthError } from './messages.ts';
import { createOpenAiProvider, openAiAuthError } from './openai.ts';
import { PROVIDERS, type AiProvider, type ProviderId } from './types.ts';

export type { ProviderId } from './types.ts';
export type {
  AgentMessage,
  PhotoSource,
  AgentRequest,
  AiProvider,
  Outcome,
  StreamEvent,
  StreamSink,
  ToolDefinition,
} from './types.ts';

/**
 * `anthropic` and `anthropic-api` are the same models and the same tools,
 * differing only in what sits between them: the Agent SDK spawning the
 * signed-in `claude` binary, or a direct call to the Messages API on a metered
 * key. The subscription is the right thing in development and the wrong thing
 * in production, where a process per turn is what caps the box.
 */


export function providerId(source: NodeJS.ProcessEnv = process.env): ProviderId {
  const requested = (source.AI_PROVIDER ?? 'anthropic').trim().toLowerCase();
  if (!(PROVIDERS as readonly string[]).includes(requested)) {
    throw new Error(
      `Unknown AI_PROVIDER "${requested}". Supported: ${PROVIDERS.join(', ')}.`,
    );
  }
  return requested as ProviderId;
}

/**
 * Which lane this person's turns run on.
 *
 * `AI_PROVIDER` sets the deployment's lane and `SUBSCRIPTION_EMAILS` names the
 * exceptions: the addresses belonging to whoever runs the box, whose turns go
 * through the Claude Code subscription instead of being billed to the key.
 *
 * The asymmetry is deliberate. The allowlist can only ever move somebody *onto*
 * the subscription, never off it, so a deployment already running `anthropic`
 * for everyone — a personal install, or development — is unaffected by whatever
 * the list says. There is no configuration in which naming an address makes a
 * turn cost money that would otherwise have been free.
 *
 * Case-insensitive, and a user with no address on file is never on the list:
 * `null` is not an address, and an account without one is exactly the anonymous
 * signup the metered lane is for.
 *
 * The login has to actually exist, which is the second half of the guarantee.
 * Without `.credentials.json` the Agent SDK falls back to `ANTHROPIC_API_KEY`
 * and this lane becomes the metered one plus a subprocess — billed the same and
 * slower, for nobody's benefit. Better to leave the listed address on whatever
 * the deployment already does and let the absent credentials be a thing someone
 * notices, than to quietly hand it the worse of the two lanes.
 */
export function laneFor(email: string | null | undefined): ProviderId {
  const address = email?.trim().toLowerCase();
  if (address && env.subscriptionEmails.includes(address) && hasSubscriptionAuth()) {
    return 'anthropic';
  }
  return providerId();
}

/**
 * Whether a lane can authenticate, asked before a turn is built.
 *
 * The gates on the chat and review routes used to ask
 * `hasSubscriptionAuth() || ANTHROPIC_API_KEY` directly, which is a
 * Claude-shaped question asked on behalf of whichever provider is configured: it
 * 503s a correctly configured `openai` deployment, and since the lane became a
 * per-user decision it can also refuse a turn the user's own lane would have
 * run, or admit one it cannot.
 *
 * Defaults to the deployment's lane, for the callers that have no user in hand —
 * the scheduler's "is anything configured at all" bail. Callers that do know
 * whose turn it is should pass `laneFor(profile.email)` and get the answer for
 * the lane that will actually run.
 */
export function authErrorFor(lane: ProviderId = providerId()): string | null {
  switch (lane) {
    case 'openai':
      return openAiAuthError();
    case 'anthropic-api':
      return meteredApiAuthError();
    case 'anthropic':
      return subscriptionAuthError();
  }
}

/**
 * Build the provider for this run. The tool context is per-turn — it collects the
 * actions a turn performed — so this is called per turn rather than once at boot,
 * which is also what makes a per-user lane possible at all.
 *
 * `lane` defaults to the deployment's, so a caller with no user in hand — or one
 * that has no business making the choice — gets the old behaviour by saying
 * nothing.
 */
export function createProvider(
  toolContext: ToolContext,
  lane: ProviderId = providerId(),
): AiProvider {
  switch (lane) {
    case 'openai':
      return createOpenAiProvider();
    case 'anthropic-api':
      return createAnthropicApiProvider();
    case 'anthropic':
      return createAnthropicProvider(toolContext);
  }
}
