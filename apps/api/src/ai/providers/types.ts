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
 */
export type TurnKind = 'text_log' | 'photo_log' | 'setup' | 'review';

export interface AgentRequest {
  /** Which model tier this turn warrants. See `TurnKind`. */
  kind: TurnKind;
  systemPrompt: string;
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
  maxTurns: number;
}

export interface Outcome {
  text: string;
  /** The model that actually ran, so a turn can be costed against its own rates. */
  model?: string;
  /** Opaque provider state to hand back next turn. Null when the provider is stateless. */
  sessionId: string | null;
  numTurns: number;
  costUsd: number;
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
