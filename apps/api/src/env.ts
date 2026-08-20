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
  /** Where the browser reaches this deployment. Every link in an email is built from it. */
  appUrl: string;
  /**
   * Browser origins allowed to call this API cross-origin with credentials.
   * Native apps are not listed and do not need to be — they send no Origin.
   */
  webOrigins: string[];
  /**
   * Which peers may be believed when they set `X-Forwarded-For`: false for none,
   * or anything proxy-addr understands — a CIDR, or one of its named ranges.
   *
   * Named ranges rather than a bare `true`, because `true` trusts the entire
   * forwarded chain and lets any caller prepend an address of its choosing,
   * which for a rate limiter keyed on IP means picking your own bucket.
   */
  trustProxy: boolean | string;
  email: EmailEnv;
  isTest: boolean;
}

export interface EmailEnv {
  /** Absent means no provider: mail is written to the log instead of sent. */
  apiKey: string | null;
  /** The From header, as `Name <address@domain>` or a bare address. */
  from: string;
  replyTo: string | null;
  /**
   * Sends every message here instead of to the real recipient, with the intended
   * address in the subject. Resend will only deliver to your own address until a
   * domain is verified, and this makes that limitation usable rather than
   * confusing — set it and the whole flow can be exercised for real.
   */
  redirectTo: string | null;
  /**
   * Signs the inbound webhook, as `whsec_…`. Absent means the receiving side is
   * off and `POST /email/inbound` refuses everything — which is the only safe
   * default for a public endpoint whose whole authentication *is* the signature.
   */
  webhookSecret: string | null;
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
    /**
     * The public address of the web app, which is what a link in an email has to
     * point at — the API's own origin is behind a proxy and means nothing to a
     * mail client. Trailing slash trimmed here so every caller can concatenate.
     */
    appUrl: (source.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    /**
     * Defaults to the dev web server so a local checkout needs no configuration.
     * A deployment must name its real origins: once the API answers on its own
     * public hostname, reflecting whatever Origin arrives would let any site on
     * the internet make credentialed requests with a signed-in user's cookie.
     */
    webOrigins: (source.WEB_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    /**
     * Off by default: with nothing in front, `X-Forwarded-For` is written by
     * whoever is calling, and believing it would make the rate limiter trivially
     * evadable. Behind Caddy on a private Docker network this is `uniquelocal`.
     */
    trustProxy: source.TRUST_PROXY ? source.TRUST_PROXY.trim() : false,
    email: {
      /**
       * No key means no mail provider, and that is a supported way to run this:
       * the server logs what it would have sent and carries on. Nothing in the
       * product is gated on an email arriving, so a personal install needs a
       * Resend account only if it wants one.
       *
       * Forced off under test so a real key in the developer's .env can never
       * make the suite send mail to anyone.
       */
      apiKey: isTest ? null : (source.RESEND_API_KEY ?? null),
      /**
       * Resend's shared sandbox sender is the default because it works with a
       * fresh account and no DNS: it will deliver to the address that owns the
       * account and refuse everything else, which is exactly the right shape for
       * trying this out. Set your own once a domain is verified.
       */
      from: source.EMAIL_FROM ?? 'Day So Far <onboarding@resend.dev>',
      replyTo: source.EMAIL_REPLY_TO ?? null,
      redirectTo: source.EMAIL_REDIRECT_TO ?? null,
      // Forced off under test for the same reason the API key is: a real secret
      // in the developer's .env must not let the suite accept a live webhook.
      webhookSecret: isTest ? null : (source.RESEND_WEBHOOK_SECRET ?? null),
    },
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
