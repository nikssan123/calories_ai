import { describe, expect, it } from 'vitest';
import { applyFileEnv, readEnv, required, testDatabaseUrl } from '../src/env.ts';

const BASE = { DATABASE_URL: 'postgres://ct:ct@localhost:5433/calorytracker' };

describe('required', () => {
  it('returns the value when set', () => {
    expect(required({ A: 'x' }, 'A')).toBe('x');
  });

  it('names the variable and points at .env.example when missing', () => {
    expect(() => required({}, 'DATABASE_URL')).toThrow(/DATABASE_URL.*\.env\.example/s);
  });

  it('treats an empty string as missing', () => {
    expect(() => required({ A: '' }, 'A')).toThrow();
  });
});

describe('testDatabaseUrl', () => {
  it('appends the suffix', () => {
    expect(testDatabaseUrl(BASE.DATABASE_URL)).toContain('/calorytracker_test');
  });

  it('is idempotent, so a suffixed URL is not double-suffixed', () => {
    const once = testDatabaseUrl(BASE.DATABASE_URL);
    expect(testDatabaseUrl(once)).toBe(once);
  });
});

describe('readEnv', () => {
  it('applies documented defaults', () => {
    const env = readEnv({ ...BASE });
    expect(env).toMatchObject({
      port: 4000,
      allowSignup: true,
      secureCookies: false,
      isTest: false,
    });
    expect(env.databaseUrl).toBe(BASE.DATABASE_URL);
  });

  it('closes signup only for the exact string "false"', () => {
    expect(readEnv({ ...BASE, ALLOW_SIGNUP: 'false' }).allowSignup).toBe(false);
    expect(readEnv({ ...BASE, ALLOW_SIGNUP: 'no' }).allowSignup).toBe(true);
  });

  it('enables secure cookies only for the exact string "true"', () => {
    expect(readEnv({ ...BASE, SECURE_COOKIES: 'true' }).secureCookies).toBe(true);
    expect(readEnv({ ...BASE, SECURE_COOKIES: '1' }).secureCookies).toBe(false);
  });

  /**
   * The guarantee that makes `pnpm test` safe to run on a laptop whose
   * DATABASE_URL points at the real development database.
   */
  it('redirects to a _test database under test, whatever DATABASE_URL says', () => {
    const env = readEnv({ ...BASE, NODE_ENV: 'test' });
    expect(env.databaseUrl).toContain('/calorytracker_test');
    expect(env.isTest).toBe(true);
  });

  it('detects the vitest runner as well as NODE_ENV', () => {
    expect(readEnv({ ...BASE, VITEST: 'true' }).isTest).toBe(true);
  });

  it('lets DATABASE_URL_TEST override the derived name', () => {
    const env = readEnv({ ...BASE, NODE_ENV: 'test', DATABASE_URL_TEST: 'postgres://x/y' });
    expect(env.databaseUrl).toBe('postgres://x/y');
  });

  it('keeps test uploads out of the real upload directory', () => {
    expect(readEnv({ ...BASE, NODE_ENV: 'test' }).uploadDir).toContain('.test-uploads');
    expect(readEnv({ ...BASE }).uploadDir).toMatch(/uploads$/);
  });

  /**
   * The upload-directory half of the same guarantee the _test database gives.
   * .env sets UPLOAD_DIR for development, and honouring it under test pointed
   * the suite — which writes and deletes photos — at the real uploads folder.
   */
  it('ignores UPLOAD_DIR under test, whatever .env says', () => {
    const env = readEnv({ ...BASE, NODE_ENV: 'test', UPLOAD_DIR: './uploads' });
    expect(env.uploadDir).toContain('.test-uploads');
  });

  it('honours an explicit UPLOAD_DIR', () => {
    expect(readEnv({ ...BASE, UPLOAD_DIR: './custom' }).uploadDir).toMatch(/custom$/);
  });

  it('reads PORT as a number', () => {
    expect(readEnv({ ...BASE, PORT: '5000' }).port).toBe(5000);
  });
});

/**
 * `.env` used to be loaded over process.env, which made the file outrank the
 * shell: `PORT=4300 pnpm dev:api` bound 4000 anyway and died with EADDRINUSE.
 */
describe('applyFileEnv', () => {
  it('fills in variables the environment has not set', () => {
    const target: NodeJS.ProcessEnv = {};
    applyFileEnv(target, { PORT: '4000' });
    expect(target.PORT).toBe('4000');
  });

  it('leaves a variable the environment already set alone', () => {
    const target: NodeJS.ProcessEnv = { PORT: '4300' };
    applyFileEnv(target, { PORT: '4000' });
    expect(target.PORT).toBe('4300');
  });

  it('treats an empty string as set, so a deliberate blank is not overwritten', () => {
    const target: NodeJS.ProcessEnv = { ALLOW_SIGNUP: '' };
    applyFileEnv(target, { ALLOW_SIGNUP: 'true' });
    expect(target.ALLOW_SIGNUP).toBe('');
  });
});
