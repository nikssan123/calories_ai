import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Auth: this app runs the agent on your Claude Code subscription rather than a
 * metered API key. The Agent SDK picks up the OAuth credentials that `claude`
 * writes to ~/.claude/.credentials.json, so there is no key to configure.
 *
 * An ANTHROPIC_API_KEY in the environment would take precedence and bill per
 * token instead, so `env.ts` deliberately does not set one.
 */

const CREDENTIALS_PATH = join(homedir(), '.claude', '.credentials.json');

export function hasSubscriptionAuth(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

export function authDescription(): string {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic-api-key';
  return hasSubscriptionAuth() ? 'claude-code-subscription' : 'none';
}

export const AUTH_HELP =
  'No Claude credentials found. Run `claude` once and sign in with your subscription, ' +
  'then restart the API. (Credentials are read from ~/.claude/.credentials.json.)';

export const MODEL = 'claude-opus-5';

/**
 * Reasoning depth. `high` is also the SDK's own default, but the default is the
 * harness's to change — pinning it keeps a Claude Code release from silently
 * moving the cost and latency of every meal log.
 */
export const EFFORT = 'high' as const;

/** Tool-call round trips per turn. A meal log needs 2–3; the cap is a runaway guard. */
export const MAX_TURNS = 12;
