import type { ToolContext } from '../tools.ts';
import { createAnthropicProvider } from './anthropic.ts';
import { createAnthropicApiProvider } from './messages.ts';
import { createOpenAiProvider } from './openai.ts';
import type { AiProvider } from './types.ts';

export type { AgentMessage, AgentRequest, AiProvider, Outcome, ToolDefinition } from './types.ts';

/**
 * `anthropic` and `anthropic-api` are the same models and the same tools,
 * differing only in what sits between them: the Agent SDK spawning the
 * signed-in `claude` binary, or a direct call to the Messages API on a metered
 * key. The subscription is the right thing in development and the wrong thing
 * in production, where a process per turn is what caps the box.
 */
const PROVIDERS = ['anthropic', 'anthropic-api', 'openai'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

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
 * Build the provider for this run. The tool context is per-turn — it collects the
 * actions a turn performed — so this is called per turn rather than once at boot.
 */
export function createProvider(toolContext: ToolContext): AiProvider {
  switch (providerId()) {
    case 'openai':
      return createOpenAiProvider();
    case 'anthropic-api':
      return createAnthropicApiProvider();
    case 'anthropic':
      return createAnthropicProvider(toolContext);
  }
}
