import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../../env.ts';
import { executeAgent } from '../agent.ts';
import { AUTH_HELP, hasSubscriptionAuth, MODELS } from '../client.ts';
import { buildNutritionServer, SERVER_NAME, type ToolContext } from '../tools.ts';
import type { AgentRequest, AiProvider, Outcome, StreamSink } from './types.ts';

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

    run(request: AgentRequest, state: string | null): Promise<Outcome> {
      return execute(toolContext, request, state);
    },

    runStream(request: AgentRequest, state: string | null, emit: StreamSink): Promise<Outcome> {
      return execute(toolContext, request, state, emit);
    },
  };
}

/**
 * One turn, watched or not.
 *
 * Both entry points build the identical `Options` and hand them to the same
 * `executeAgent`, because a streamed turn on this lane differs from an
 * unstreamed one in nothing but whether the message loop tells anyone what it
 * is reading. Splitting them would be two copies of the SDK configuration —
 * the stripped built-ins, the empty `settingSources`, the effort spread — and
 * that block is the one place where a silent divergence would be expensive.
 */
async function execute(
  toolContext: ToolContext,
  request: AgentRequest,
  state: string | null,
  emit?: StreamSink,
): Promise<Outcome> {
  // Rebuilt here rather than passed in: the MCP server closes over the
  // per-turn tool context, and only this provider speaks MCP.
  const { server, toolNames } = buildNutritionServer(toolContext, {
    readOnly: request.readOnly,
    toolset: request.toolset,
  });

  const choice = request.model ?? MODELS[request.kind];

  const options: Options = {
    // An array with the boundary marker, not one joined string. Everything
    // before the marker is cacheable across turns and sessions; everything
    // after it is this turn's clock and numbers. Joined, the volatile half
    // invalidated the stable half and the whole prefix was rewritten every
    // turn — which was the single largest line on the bill.
    // The boundary is only worth placing when there is a volatile half to
    // put after it. The review agent has none — its whole prompt is stable
    // and the week's numbers ride in the user turn — and an empty trailing
    // block is the kind of thing an API rejects.
    systemPrompt: request.dynamicSystemPrompt
      ? [request.staticSystemPrompt, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, request.dynamicSystemPrompt]
      : [request.staticSystemPrompt],
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
    env: subscriptionEnv(),
  };

  // Streaming input exists to carry an image; a text-only turn goes as a
  // plain string, which is what the review path has always sent and what
  // the SDK reports back verbatim.
  const prompt = request.photo ? promptStream(request) : request.text;
  const outcome = await executeAgent(prompt, options, state, emit);
  // Reported back so the turn can be costed against the model that ran it.
  return { ...outcome, model: choice.model };
}

/**
 * The environment the `claude` subprocess is handed.
 *
 * This exists for one reason, and without it this whole lane is a lie on any
 * deployment that also runs the metered one. **The Agent SDK prefers
 * `ANTHROPIC_API_KEY` to the subscription login.** So on a box where both are
 * present — which is now every box running both lanes — spawning the subprocess
 * with the ambient environment produces a turn that is billed to the key *and*
 * pays for a process to do it: strictly worse than either lane alone, and
 * completely silent. `docker-compose.prod.yml` says as much next to the key.
 *
 * `Options.env` replaces the subprocess environment rather than merging into
 * it, so the whole of `process.env` is passed through minus the one variable —
 * `PATH` and `HOME` matter to a spawned binary, and `HOME` is how it finds
 * `.credentials.json` in the first place.
 *
 * Only when there is a login to fall back on. A deployment holding a key and no
 * credentials file has exactly one credential, and taking it away would turn a
 * working configuration into a broken one to make a point.
 */
function subscriptionEnv(): Record<string, string | undefined> | undefined {
  if (!hasSubscriptionAuth()) return undefined;
  const { ANTHROPIC_API_KEY: _billed, ...rest } = process.env;
  return rest;
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
