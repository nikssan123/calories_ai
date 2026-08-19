import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load the repo-root .env first, then apps/api/.env so a package-local file can
// override it. Without this, running via `pnpm --filter` would only look in
// apps/api and miss the root file.
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(apiRoot, '..', '..');
for (const candidate of [join(repoRoot, '.env'), join(apiRoot, '.env')]) {
  if (existsSync(candidate)) config({ path: candidate, override: true, quiet: true });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env at the repo root.`,
    );
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  /** Set false once your account exists to stop anyone else registering. */
  allowSignup: (process.env.ALLOW_SIGNUP ?? 'true') !== 'false',
  /** Session cookies must be Secure once served over HTTPS. */
  secureCookies: (process.env.SECURE_COOKIES ?? 'false') === 'true',
  uploadDir: resolve(apiRoot, process.env.UPLOAD_DIR ?? './uploads'),
  /**
   * Working directory for the spawned agent process. Deliberately its own empty
   * directory: the agent has no file tools, and its cwd should not be the folder
   * holding meal photos. It must exist before spawn — a missing cwd fails with
   * ENOENT, which the SDK reports as a confusing "binary failed to launch".
   */
  agentCwd: resolve(apiRoot, '.agent-workspace'),
};

/** Called once at boot so neither directory is missing when first needed. */
export async function ensureDirectories(): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(env.uploadDir, { recursive: true });
  await mkdir(env.agentCwd, { recursive: true });
}
