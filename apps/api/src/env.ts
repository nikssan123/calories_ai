import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load the repo-root .env first, then apps/api/.env so a package-local file can
// override it. Without this, running via `pnpm --filter` would only look in
// apps/api and miss the root file.
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(apiRoot, '..', '..');

/**
 * Files are merged into their own object rather than straight into process.env,
 * so a real environment variable still outranks both — the dotenv convention.
 * Loading them with `override` against process.env instead made the .env file
 * win over the shell, which silently ignored anything passed per-invocation:
 * `PORT=4300 pnpm dev:api` bound 4000 anyway and died with EADDRINUSE.
 */
const fromFiles: Record<string, string> = {};
for (const candidate of [join(repoRoot, '.env'), join(apiRoot, '.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate, override: true, quiet: true, processEnv: fromFiles });
  }
}
applyFileEnv(process.env, fromFiles);

/** Files fill in only what the surrounding environment has not already set. */
export function applyFileEnv(target: NodeJS.ProcessEnv, fromFiles: Record<string, string>): void {
  for (const [key, value] of Object.entries(fromFiles)) {
    target[key] ??= value;
  }
}

export function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env at the repo root.`,
    );
  }
  return value;
}

/**
 * Under test, the database name always gains a `_test` suffix. The suite
 * truncates tables between cases, so this is not a convenience — it is the
 * thing that stops `pnpm test` from emptying the development database when
 * someone's shell has DATABASE_URL pointing at it.
 */
export function testDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith('_test')) parsed.pathname = `${parsed.pathname}_test`;
  return parsed.toString();
}

export interface Env {
  databaseUrl: string;
  port: number;
  allowSignup: boolean;
  secureCookies: boolean;
  uploadDir: string;
  agentCwd: string;
  /** Lower-cased emails granted the admin panel. Empty means "the first account". */
  adminEmails: string[];
  isTest: boolean;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const isTest = source.NODE_ENV === 'test' || source.VITEST === 'true';
  const databaseUrl = required(source, 'DATABASE_URL');

  return {
    databaseUrl: isTest
      ? (source.DATABASE_URL_TEST ?? testDatabaseUrl(databaseUrl))
      : databaseUrl,
    port: Number(source.PORT ?? 4000),
    /** Set false once your account exists to stop anyone else registering. */
    allowSignup: (source.ALLOW_SIGNUP ?? 'true') !== 'false',
    /** Session cookies must be Secure once served over HTTPS. */
    secureCookies: (source.SECURE_COOKIES ?? 'false') === 'true',
    /**
     * Who can open the admin panel. Deliberately config rather than a column:
     * on a self-hosted single-user install there is nothing to configure (the
     * fallback in `services/admin.ts` grants it to the first account), and on a
     * real deployment admin is a deploy-time decision rather than something a
     * row in the database can quietly acquire.
     */
    adminEmails: (source.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    /**
     * Forced under test for the same reason the database name is: the suite
     * writes and deletes meal photos, and an UPLOAD_DIR set in .env would aim
     * that at the developer's real uploads folder.
     */
    uploadDir: resolve(apiRoot, isTest ? './.test-uploads' : (source.UPLOAD_DIR ?? './uploads')),
    /**
     * Working directory for the spawned agent process. Deliberately its own empty
     * directory: the agent has no file tools, and its cwd should not be the folder
     * holding meal photos. It must exist before spawn — a missing cwd fails with
     * ENOENT, which the SDK reports as a confusing "binary failed to launch".
     */
    agentCwd: resolve(apiRoot, './.agent-workspace'),
    isTest,
  };
}

export const env = readEnv();

/** Called once at boot so neither directory is missing when first needed. */
export async function ensureDirectories(): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(env.uploadDir, { recursive: true });
  await mkdir(env.agentCwd, { recursive: true });
}
