import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ChatAction, ChatResponse, Profile } from '@ct/shared';
import { queryOne, query as sql } from '../db.ts';
import { env } from '../env.ts';
import type { DayContext } from '../time.ts';
import { localDateFor } from '../time.ts';
import { buildDaySummary } from '../services/summary.ts';
import { latestWeight } from '../services/log.ts';
import { missingProfileFields } from '../services/user.ts';
import { AUTH_HELP, EFFORT, hasSubscriptionAuth, MAX_TURNS, MODEL } from './client.ts';
import { dayContextPrompt, onboardingPrompt, STABLE_SYSTEM_PROMPT } from './prompt.ts';
import { buildNutritionServer, SERVER_NAME, type ToolContext } from './tools.ts';

export interface RunTurnInput {
  userId: string;
  ctx: DayContext;
  profile: Profile;
  text: string;
  photo?: { id: string; mediaType: string; base64: string } | null;
}

export async function runTurn(input: RunTurnInput): Promise<ChatResponse> {
  if (!hasSubscriptionAuth() && !process.env.ANTHROPIC_API_KEY) throw new Error(AUTH_HELP);

  const now = new Date();
  const today = localDateFor(now, input.ctx);
  const day = await buildDaySummary(input.userId, today);

  const actions: ChatAction[] = [];
  const toolContext: ToolContext = {
    userId: input.userId,
    ctx: input.ctx,
    now,
    photoId: input.photo?.id ?? null,
    actions,
  };

  const { server, toolNames } = buildNutritionServer(toolContext);

  // Setup mode is additive: the agent keeps every logging capability while it
  // collects the missing profile values.
  const missing = missingProfileFields(input.profile);
  const currentWeight = await latestWeight(input.userId);
  const needsOnboarding = missing.length > 0 || currentWeight === null;
  const onboarding = needsOnboarding
    ? `\n\n---\n\n${onboardingPrompt(input.profile, missing, currentWeight)}`
    : '';

  const options: Options = {
    // A plain string means "no Claude Code preset" — the agent gets this prompt
    // and nothing else. The volatile half (today's numbers, entry ids) is
    // regenerated every turn.
    systemPrompt: `${STABLE_SYSTEM_PROMPT}\n\n---\n\n${dayContextPrompt(input.profile, day)}${onboarding}`,
    mcpServers: { [SERVER_NAME]: server },
    allowedTools: toolNames,
    // Strip every built-in. The agent cannot read files, run bash, or search the
    // web — it has the nutrition tools and nothing more.
    tools: [],
    // Do not load ~/.claude or the repo's CLAUDE.md, skills, or settings. This
    // agent must not inherit the developer's Claude Code configuration.
    settingSources: [],
    // There is no terminal to approve anything; every tool is pre-approved above.
    permissionMode: 'bypassPermissions',
    model: MODEL,
    effort: EFFORT,
    maxTurns: MAX_TURNS,
    cwd: env.agentCwd,
  };

  const sessionId = await loadSessionId(input.userId);

  let outcome = await runQuery(input, options, sessionId);
  if (outcome.staleSession) {
    // The stored session is gone (cleared cache, another machine). Start a new
    // one — the nutrition data lives in Postgres, so only chat continuity is lost.
    await saveSessionId(input.userId, null);
    outcome = await runQuery(input, options, null);
  }
  if (outcome.error) throw new Error(outcome.error);

  if (outcome.sessionId && outcome.sessionId !== sessionId) {
    await saveSessionId(input.userId, outcome.sessionId);
  }

  // The user's message is persisted only now, so a failed turn doesn't leave a
  // dangling prompt in the conversation.
  const userMessage = await insertMessage(
    input.userId,
    'user',
    input.text,
    input.photo?.id ?? null,
    null,
  );
  const assistantMessage = await insertMessage(input.userId, 'assistant', outcome.text, null, {
    session_id: outcome.sessionId,
    num_turns: outcome.numTurns,
    cost_usd: outcome.costUsd,
    tools: actions.map((a) => a.kind),
  });
  void userMessage;

  // Re-read the day: tools may have written to it, and the client should not
  // have to make a second request to see the result.
  const updatedDay = await buildDaySummary(input.userId, today);

  return { message: assistantMessage, actions, day: updatedDay };
}

interface Outcome {
  text: string;
  sessionId: string | null;
  numTurns: number;
  costUsd: number;
  error?: string;
  staleSession?: boolean;
}

async function runQuery(
  input: RunTurnInput,
  options: Options,
  resume: string | null,
): Promise<Outcome> {
  const outcome: Outcome = { text: '', sessionId: null, numTurns: 0, costUsd: 0 };
  const assistantChunks: string[] = [];

  try {
    for await (const message of query({
      prompt: promptStream(input),
      options: resume ? { ...options, resume } : options,
    })) {
      if (message.type === 'assistant') {
        outcome.sessionId = message.session_id;
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) assistantChunks.push(block.text);
        }
      } else if (message.type === 'result') {
        outcome.sessionId = message.session_id;
        outcome.numTurns = message.num_turns;
        outcome.costUsd = message.total_cost_usd ?? 0;
        if (message.subtype === 'success') {
          outcome.text = message.result.trim();
        } else {
          outcome.error = `The agent stopped early (${message.subtype}).`;
        }
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (resume && /session|resume|not found/i.test(detail)) {
      return { ...outcome, staleSession: true };
    }
    return { ...outcome, error: detail };
  }

  // A success result carries the final text; fall back to streamed chunks if the
  // run ended without one (e.g. hit maxTurns after doing the logging work).
  if (!outcome.text) outcome.text = assistantChunks.join('\n').trim();
  if (!outcome.text && !outcome.error) outcome.text = 'Logged.';
  return outcome;
}

/**
 * Streaming input mode. A single message, closed immediately — it is the only
 * way to attach an image, and it terminates the turn cleanly.
 */
async function* promptStream(input: RunTurnInput): AsyncGenerator<SDKUserMessage> {
  const content: SDKUserMessage['message']['content'] = [];

  if (input.photo) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.photo.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: input.photo.base64,
      },
    });
  }
  content.push({ type: 'text', text: input.text });

  yield {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
  };
}

async function loadSessionId(userId: string): Promise<string | null> {
  const row = await queryOne<{ agent_session_id: string | null }>(
    'SELECT agent_session_id FROM users WHERE id = $1',
    [userId],
  );
  return row?.agent_session_id ?? null;
}

async function saveSessionId(userId: string, sessionId: string | null): Promise<void> {
  await sql('UPDATE users SET agent_session_id = $1 WHERE id = $2', [sessionId, userId]);
}

async function insertMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  photoId: string | null,
  toolTrace: unknown,
) {
  const row = await queryOne<any>(
    `INSERT INTO chat_messages (user_id, role, content, photo_id, tool_trace)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, role, content, photo_id, created_at`,
    [userId, role, content, photoId, toolTrace ? JSON.stringify(toolTrace) : null],
  );
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    photo_id: row.photo_id,
    created_at: new Date(row.created_at).toISOString(),
  };
}
