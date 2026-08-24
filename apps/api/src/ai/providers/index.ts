import { providerId } from '../lane.ts';
import type { ToolContext } from '../tools.ts';
import { createAnthropicProvider, subscriptionAuthError } from './anthropic.ts';
import { createAnthropicApiProvider, meteredApiAuthError } from './messages.ts';
import { createOpenAiProvider, openAiAuthError } from './openai.ts';
import type { AiProvider, ProviderId } from './types.ts';

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
 *
 * Which of them a given person gets — and whether anybody is billed for it —
 * is decided in `lane.ts`, re-exported here so the callers that already reach
 * for this barrel still find those answers where they have always been. The
 * definitions moved out because the session hook and the plan meters ask the
 * same questions and have no business importing a provider to do it.
 */
export { laneFor, providerId, unmeteredFor } from '../lane.ts';

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
