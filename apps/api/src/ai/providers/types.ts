import type { ZodRawShape } from 'zod';

/**
 * The provider-neutral seam. Everything above this file talks about "an agent
 * run"; everything below it knows about one vendor.
 *
 * Two shapes of provider have to fit through here, which is what most of the
 * design is reacting to:
 *
 *   - CLI-subprocess providers (Claude Code) authenticate from a signed-in
 *     binary, run the tool-calling loop themselves, and keep conversation state
 *     server-side behind an opaque session id.
 *   - HTTP-API providers (OpenAI and any OpenAI-compatible endpoint) authenticate
 *     with a key, have no session store, and need us to drive the loop and replay
 *     the conversation every turn.
 *
 * So `state` is deliberately opaque — a session id for one provider, null for the
 * other — and `history` is supplied for the providers that cannot remember.
 */

/**
 * A tool the agent may call — declared structurally rather than imported from the
 * Agent SDK, so this file stays free of any vendor. It is deliberately the same
 * shape the MCP definitions in `tools.ts` already have, so no tool is declared
 * twice and both providers share one set of handlers.
 *
 * `args` is `any` because the handlers are generated per-tool with precise
 * argument types; a stricter signature here would make them unassignable.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, extra: unknown) => Promise<ToolResult>;
}

export interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What this turn *is*, stated without reference to any vendor. Providers map it
 * onto their own model line-up — the caller never names a model.
 *
 * The split is by cost shape, not by feature:
 *
 *   - `text_log` is ~70% of all turns and is a well-specified extraction job
 *     ("two eggs and toast" -> items with macros). It sets the unit economics,
 *     so it belongs on the cheapest model that can do it.
 *   - `photo_log` needs vision, and estimating a portion from plate and cutlery
 *     cues is the genuinely hard task in this product.
 *   - `setup` runs once per account, for maybe ten turns. It is the first thing
 *     a new user sees and it maps vague language ("pretty active") onto enums,
 *     so quality matters and cost does not.
 *   - `review` runs once a week — 1/120th the volume of logging. Paying top rate
 *     for the one piece of writing the user actually reads is nearly free.
 *   - `pantry_scan` reads a fridge photo. Vision, but naming what is on a shelf
 *     is recognition rather than measurement, and the user confirms the list
 *     before anything uses it — that confirmation is what buys a cheaper model
 *     here than `photo_log`, which has no such safety net.
 *   - `recipe` writes the suggestions. Occasional, read end to end, and the
 *     reason anyone would pay: it sits with `review` on the side of the table
 *     where quality is visible and volume is not the problem.
 */
export type TurnKind =
  | 'text_log'
  | 'photo_log'
  | 'setup'
  | 'review'
  | 'pantry_scan'
  | 'recipe';

export type ToolsetName = 'journal' | 'kitchen';

export interface AgentRequest {
  /** Which model tier this turn warrants. See `TurnKind`. */
  kind: TurnKind;
  /**
   * The system prompt in two halves, because where the split falls is a billing
   * decision, not a formatting one.
   *
   * `staticSystemPrompt` is byte-identical on every turn and is what the prompt
   * cache can actually hold. `dynamicSystemPrompt` carries the clock, today's
   * totals and today's entry ids, so it differs every single turn — and while
   * the two were concatenated into one string, that difference invalidated the
   * whole prefix and the entire prompt was re-cached each turn (~20k tokens,
   * measured). Providers that can express a cache breakpoint put it between
   * these two; providers that cannot just join them.
   */
  staticSystemPrompt: string;
  dynamicSystemPrompt: string;
  /** This turn's user text. */
  text: string;
  photo?: { mediaType: string; base64: string } | null;
  tools: ToolDefinition[];
  /** Fully-qualified tool names, for providers that pre-approve by name. */
  toolNames: string[];
  /**
   * Prior turns, oldest first. Only read by providers with `needsHistory`;
   * session-based providers ignore it and resume instead.
   */
  history: AgentMessage[];
  /** Drop every write tool — the weekly review reads but must not mutate. */
  readOnly: boolean;
  /**
   * Which set of tools this run gets. `journal` is the nutrition log; `kitchen`
   * swaps in the pantry and recipe tools and nothing else.
   *
   * It has to travel on the request rather than being assembled by the caller
   * because the Anthropic provider rebuilds the MCP server itself — the server
   * closes over the per-turn tool context — so a tool list handed in from
   * outside would be invisible to it. The OpenAI provider reads `tools`
   * directly and needs only to be given the right ones.
   */
  toolset: ToolsetName;
  maxTurns: number;
}

/**
 * Tokens a turn consumed, normalised across providers.
 *
 * Cache reads and writes are kept apart from `inputTokens` rather than folded
 * in, because they bill at a tenth and 1.25x of the input rate respectively —
 * summing them would misprice a turn by more than the turn costs. Both
 * providers already report them separately.
 */
export interface TokenUsage {
  /** Uncached input. Excludes both cache figures below. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * Per-model split, when the provider gives one. A single turn can touch
   * several models — a subagent, a compaction pass — and the panel needs to
   * show that rather than attributing it all to the requested model.
   */
  byModel?: Record<string, TokenUsage & { costUsd?: number }>;
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * How much to trust `costUsd`. A provider that priced the turn itself is
 * authoritative; one we priced from a rate card is an estimate that ages; and
 * `unknown` means the tokens are real but nobody could put a price on them —
 * which is emphatically not the same as free.
 */
export type CostSource = 'reported' | 'estimated' | 'unknown';

export interface Outcome {
  text: string;
  /** The model that actually ran, so a turn can be costed against its own rates. */
  model?: string;
  /** Opaque provider state to hand back next turn. Null when the provider is stateless. */
  sessionId: string | null;
  numTurns: number;
  costUsd: number;
  /** Whether `costUsd` was priced by the provider, by us, or not at all. */
  costSource?: CostSource;
  usage?: TokenUsage;
  /** Wall-clock time inside the provider, for the latency half of viability. */
  durationMs?: number;
  error?: string;
  /** The resumed session is gone; the caller may retry without one. */
  staleSession?: boolean;
}

export interface AiProvider {
  /** Stable id, as written in AI_PROVIDER. */
  readonly id: string;
  /** Human label for logs and error messages. */
  readonly label: string;
  /**
   * True when the provider cannot remember the conversation itself and needs
   * `history` populated. Lets the caller skip a database read for those that can.
   */
  readonly needsHistory: boolean;
  /** Null when usable; otherwise the sentence telling the user how to fix it. */
  checkAuth(): string | null;
  run(request: AgentRequest, state: string | null): Promise<Outcome>;
}
