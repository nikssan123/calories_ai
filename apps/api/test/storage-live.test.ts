import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createObjectStore } from '../src/services/storage.ts';
import type { StorageEnv } from '../src/env.ts';

/**
 * A real round trip against a real bucket.
 *
 * `storage.test.ts` stubs `fetch`, which proves the code around the signature
 * and nothing about the signature — and a signature is precisely the thing that
 * cannot be checked locally. The failures this catches are the ones that only
 * a server can report: a token scoped to a different bucket, a region that
 * SigV4 disagrees with, an endpoint copied without the account id.
 *
 * Opt-in, and skipped rather than failed without credentials. Deliberately its
 * own `TEST_S3_*` variables rather than the deployment's `S3_*`: the suite
 * writes and deletes objects, and reading the live configuration would point
 * that at the bucket holding everybody's meal photos.
 *
 *   TEST_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
 *   TEST_S3_BUCKET=... TEST_S3_ACCESS_KEY_ID=... TEST_S3_SECRET_ACCESS_KEY=... \
 *   pnpm --filter @ct/api vitest run test/storage-live.test.ts
 */

const config: StorageEnv | null = (() => {
  const endpoint = process.env.TEST_S3_ENDPOINT?.trim().replace(/\/+$/, '');
  const bucket = process.env.TEST_S3_BUCKET?.trim();
  const accessKeyId = process.env.TEST_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.TEST_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.TEST_S3_REGION?.trim() || 'auto',
  };
})();

describe.skipIf(!config)('a real bucket', () => {
  const store = () => createObjectStore(config!);
  const key = () => `test/${randomUUID()}.txt`;

  it('stores an object, reads it back, and deletes it', async () => {
    const s = store();
    const k = key();
    const bytes = Buffer.from(`round trip ${Date.now()}`);

    await s.put(k, 'text/plain', bytes);
    expect((await s.get(k))!.equals(bytes)).toBe(true);

    await s.remove(k);
    expect(await s.get(k)).toBeNull();
  });

  /**
   * The half that the product actually depends on, and the half a stub cannot
   * check: a URL with the signature in its query string, fetched by something
   * holding no credentials at all. That is what a browser does with the 302.
   */
  it('mints a presigned URL that an unauthenticated fetch can read', async () => {
    const s = store();
    const k = key();
    const bytes = Buffer.from('presigned');
    await s.put(k, 'text/plain', bytes);

    try {
      const url = await s.presignGet(k, 60);
      // Plain global fetch, no signing, no headers.
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('presigned');
    } finally {
      await s.remove(k);
    }
  });

  /**
   * Not merely tidiness. If the bucket answers a bare GET, it is public, and
   * every photo in it is one guessed key away from anybody — which would make
   * the signed-URL scheme in `photos.ts` decoration.
   */
  it('refuses the same object without a signature', async () => {
    const s = store();
    const k = key();
    await s.put(k, 'text/plain', Buffer.from('private'));

    try {
      const bare = (await s.presignGet(k, 60)).split('?')[0]!;
      const response = await fetch(bare);
      expect(response.status).toBeGreaterThanOrEqual(400);
    } finally {
      await s.remove(k);
    }
  });
});
