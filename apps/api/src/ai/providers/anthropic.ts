import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../../env.ts';
import { executeAgent } from '../agent.ts';
import { AUTH_HELP, hasSubscriptionAuth, MODELS } from '../client.ts';
import { buildNutritionServer, SERVER_NAME, type ToolContext } from '../tools.ts';
import type { AgentRequest, AiProvider, Outcome } from './types.ts';

/**
 * Claude Code. The only provider that can run on a subscription rather than a
 * metered key, because the Agent SDK spawns the signed-in `claude` binary and
 * inherits its OAuth credentials.
 *
 * It also owns the agent loop and the conversation store, so this adapter is
 * mostly a translation of our request shape into `Options` — the behaviour is
 * unchanged from before the provider split.
 */
export function createAnthropicProvider(toolContext: ToolContext): AiProvider {
  return {
    id: 'anthropic',
    label: 'Claude Code',
    // Sessions live on the Claude side; we hand back an id, not a transcript.
    needsHistory: false,

    checkAuth() {
      if (hasSubscriptionAuth() || process.env.ANTHROPIC_API_KEY) return null;
      return AUTH_HELP;
    },

    async run(request: AgentRequest, state: string | null): Promise<Outcome> {
      // Rebuilt here rather than passed in: the MCP server closes over the
      // per-turn tool context, and only this provider speaks MCP.
      const { server, toolNames } = buildNutritionServer(toolContext, {
        readOnly: request.readOnly,
      });

      const choice = MODELS[request.kind];

      const options: Options = {
        systemPrompt: request.systemPrompt,
        mcpServers: { [SERVER_NAME]: server },
        allowedTools: toolNames,
        // Strip every built-in. The agent cannot read files, run bash, or search
        // the web — it has the nutrition tools and nothing more.
        tools: [],
        // Do not load ~/.claude or the repo's CLAUDE.md, skills, or settings.
        settingSources: [],
        permissionMode: 'bypassPermissions',
        model: choice.model,
        // Spread rather than assign: Haiku 4.5 rejects `effort` with a 400, and
        // an explicit `effort: undefined` is not the same as omitting the key.
        ...(choice.effort ? { effort: choice.effort } : {}),
        maxTurns: request.maxTurns,
        cwd: env.agentCwd,
      };

      // Streaming input exists to carry an image; a text-only turn goes as a
      // plain string, which is what the review path has always sent and what
      // the SDK reports back verbatim.
      const prompt = request.photo ? promptStream(request) : request.text;
      const outcome = await executeAgent(prompt, options, state);
      // Reported back so the turn can be costed against the model that ran it.
      return { ...outcome, model: choice.model };
    },
  };
}

/**
 * Streaming input mode. A single message, closed immediately — it is the only
 * way to attach an image, and it terminates the turn cleanly.
 */
async function* promptStream(request: AgentRequest): AsyncGenerator<SDKUserMessage> {
  const content: SDKUserMessage['message']['content'] = [];

  if (request.photo) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: request.photo.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: request.photo.base64,
      },
    });
  }
  content.push({ type: 'text', text: request.text });

  yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
}
