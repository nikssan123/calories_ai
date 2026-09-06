import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  MODEL_READ_SECONDS,
  presignPhotoRead,
  readPhoto,
  readPhotoById,
  readPhotoBytes,
  savePhoto,
  signPhotoUrl,
  verifyPhotoUrl,
  type PhotoDelivery,
} from '../src/services/photos.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let user: TestUser;
let other: TestUser;

/**
 * Every case in this file runs with no bucket configured — `env.storage` is
 * forced null under test — so a delivery here is always the local-disk branch.
 * Asserting that before reaching for the bytes is what keeps a silent switch to
 * the other branch from reading as a type error thirty lines later.
 */
function servedBytes(photo: PhotoDelivery | null) {
  expect(photo).not.toBeNull();
  expect(photo!.kind).toBe('bytes');
  return photo as Extract<PhotoDelivery, { kind: 'bytes' }>;
}

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
});

describe('savePhoto', () => {
  it('writes the bytes and records the row', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const bytes = await readFile(saved.filePath!);
    expect(bytes.equals(Buffer.from(PIXEL, 'base64'))).toBe(true);

    const rows = await query<any>('SELECT * FROM photos WHERE id = $1', [saved.id]);
    expect(rows[0]).toMatchObject({ media_type: 'image/png', byte_size: bytes.byteLength });
  });

  it.each([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['application/octet-stream', '.bin'],
  ])('gives %s the %s extension', async (mediaType, extension) => {
    const saved = await savePhoto(user.id, mediaType, PIXEL);
    expect(saved.filePath!.endsWith(extension)).toBe(true);
  });
});

describe('readPhoto', () => {
  it('returns the bytes to their owner', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const photo = servedBytes(await readPhoto(user.id, saved.id));
    expect(photo.mediaType).toBe('image/png');
    expect(photo.bytes.equals(Buffer.from(PIXEL, 'base64'))).toBe(true);
  });

  it('refuses another account’s photo', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    expect(await readPhoto(other.id, saved.id)).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await readPhoto(user.id, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('returns null when the file has gone missing under the row', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    await rm(saved.filePath!);
    expect(await readPhoto(user.id, saved.id)).toBeNull();
  });

  /**
   * The stored path is written by savePhoto and never by a client, but a row
   * pointing outside the upload directory must still not be served.
   */
  it('will not read outside the upload directory', async () => {
    const outside = join(env.uploadDir, '..', 'escaped.png');
    await writeFile(outside, Buffer.from(PIXEL, 'base64'));
    const row = await query<{ id: string }>(
      `INSERT INTO photos (user_id, media_type, file_path, byte_size)
       VALUES ($1,'image/png',$2,1) RETURNING id`,
      [user.id, outside],
    );
    expect(await readPhoto(user.id, row[0]!.id)).toBeNull();
    await rm(outside, { force: true });
  });

  it('will not serve a row whose media type and extension disagree', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    await query('UPDATE photos SET media_type = $1 WHERE id = $2', ['text/html', saved.id]);
    expect(await readPhoto(user.id, saved.id)).toBeNull();
  });
});

describe('signed photo URLs', () => {
  const SECRET = 'test-signing-secret';

  function parse(url: string): { path: string; exp: string; sig: string } {
    const [path, search] = url.split('?');
    const params = new URLSearchParams(search);
    return { path: path!, exp: params.get('exp')!, sig: params.get('sig')! };
  }

  it('signs a path the client can join to its own base', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const { path, exp, sig } = parse(signPhotoUrl(saved.id, SECRET));

    expect(path).toBe(`/photos/${saved.id}`);
    expect(Number(exp) * 1000).toBeGreaterThan(Date.now());
    expect(sig).toMatch(/^[\w-]+$/);
  });

  it('verifies a signature it just produced', () => {
    const { exp, sig } = parse(signPhotoUrl('photo-1', SECRET));
    expect(verifyPhotoUrl('photo-1', exp, sig, SECRET)).toBe(true);
  });

  it('refuses a signature made for a different photo', () => {
    const { exp, sig } = parse(signPhotoUrl('photo-1', SECRET));
    expect(verifyPhotoUrl('photo-2', exp, sig, SECRET)).toBe(false);
  });

  it('refuses a signature made with a different secret', () => {
    const { exp, sig } = parse(signPhotoUrl('photo-1', SECRET));
    expect(verifyPhotoUrl('photo-1', exp, sig, 'rotated-secret')).toBe(false);
  });

  /** The expiry is signed, so extending it invalidates the signature — which is
      the only thing stopping a link from being made permanent by its holder. */
  it('refuses an expiry edited to a later time', () => {
    const { exp, sig } = parse(signPhotoUrl('photo-1', SECRET));
    const later = String(Number(exp) + 86_400);
    expect(verifyPhotoUrl('photo-1', later, sig, SECRET)).toBe(false);
  });

  it('refuses a link that has expired', () => {
    const signedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const { exp, sig } = parse(signPhotoUrl('photo-1', SECRET, signedAt));
    expect(verifyPhotoUrl('photo-1', exp, sig, SECRET)).toBe(false);
  });

  it('accepts a link that has not expired yet', () => {
    const signedAt = Date.now() - 6 * 24 * 60 * 60 * 1000;
    const { exp, sig } = parse(signPhotoUrl('photo-1', SECRET, signedAt));
    expect(verifyPhotoUrl('photo-1', exp, sig, SECRET)).toBe(true);
  });

  it.each([
    ['no expiry', undefined, 'whatever'],
    ['no signature', '99999999999', undefined],
    ['a non-numeric expiry', 'soon', 'whatever'],
    ['an expiry that is not an integer', '1.5e30', 'whatever'],
    ['a signature of the wrong length', '99999999999', 'short'],
  ])('refuses %s', (_label, exp, sig) => {
    expect(verifyPhotoUrl('photo-1', exp, sig, SECRET)).toBe(false);
  });
});

describe('readPhotoById', () => {
  it('returns the bytes without a user to scope by', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const photo = servedBytes(await readPhotoById(saved.id));
    expect(photo.bytes.equals(Buffer.from(PIXEL, 'base64'))).toBe(true);
  });

  it('returns null for an id that does not exist', async () => {
    expect(await readPhotoById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

/**
 * The bucket-backed path.
 *
 * `env.storage` is null everywhere else in this file — forced so under test —
 * which is what makes it possible to set it here for a handful of cases and get
 * the real code path rather than a mock of it. Only the network is stubbed, so
 * these exercise `savePhoto` and `deliver` against the actual client.
 */
describe('with object storage configured', () => {
  const CONFIG = {
    endpoint: 'https://acct123.r2.cloudflarestorage.com',
    bucket: 'meals',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
    region: 'auto',
  };

  const original = globalThis.fetch;
  let calls: Request[];

  beforeEach(() => {
    calls = [];
    (env as any).storage = { ...CONFIG };
    globalThis.fetch = vi.fn(async (input: any) => {
      calls.push(input as Request);
      return new Response('bytes', { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    (env as any).storage = null;
    globalThis.fetch = original;
  });

  it('puts the bytes in the bucket and records the key instead of a path', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);

    expect(saved.filePath).toBeNull();
    expect(saved.storageKey).toMatch(new RegExp(`^photos/${user.id}/[0-9a-f-]+\\.png$`));
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toBe(
      `https://acct123.r2.cloudflarestorage.com/meals/${saved.storageKey}`,
    );

    const rows = await query<any>('SELECT * FROM photos WHERE id = $1', [saved.id]);
    expect(rows[0]).toMatchObject({ file_path: null, storage_key: saved.storageKey });
    expect(rows[0].byte_size).toBe(Buffer.from(PIXEL, 'base64').byteLength);
  });

  /**
   * The whole reason for a bucket: the bytes are served by it rather than
   * proxied through here, so the API spends a signature and not its bandwidth.
   */
  it('hands the reader a presigned URL rather than the bytes', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const photo = await readPhoto(user.id, saved.id);

    expect(photo!.kind).toBe('redirect');
    const url = new URL((photo as Extract<PhotoDelivery, { kind: 'redirect' }>).url);
    expect(url.pathname).toBe(`/meals/${saved.storageKey}`);
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // The PUT, and nothing since: signing is arithmetic, not a round trip.
    expect(calls).toHaveLength(1);
  });

  it('still scopes the owner read by user', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    expect(await readPhoto(other.id, saved.id)).toBeNull();
  });

  it('fetches the bytes when a caller genuinely needs them', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const bytes = await readPhotoBytes(saved.id);

    expect(bytes!.toString()).toBe('bytes');
    expect(calls.at(-1)!.method).toBe('GET');
  });

  /**
   * Photos written before the bucket was turned on keep being read off the
   * volume. This is what makes the switch a configuration rather than a
   * migration with a cutover — nothing is backfilled, and nothing has to be.
   */
  it('keeps serving photos that were written to disk beforehand', async () => {
    (env as any).storage = null;
    const onDisk = await savePhoto(user.id, 'image/png', PIXEL);
    (env as any).storage = { ...CONFIG };

    const photo = servedBytes(await readPhoto(user.id, onDisk.id));
    expect(photo.bytes.equals(Buffer.from(PIXEL, 'base64'))).toBe(true);
  });

  /**
   * The other direction is not symmetrical, and must not fail quietly. A row in
   * the bucket with the bucket switched off is a misconfiguration, and looking
   * for a local file that was never written would report it as a missing photo
   * — sending whoever investigates to the wrong place entirely.
   */
  it('says so loudly when the bucket is switched off under a row that needs it', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    (env as any).storage = null;

    await expect(readPhoto(user.id, saved.id)).rejects.toThrow(/not configured/);
  });

  /**
   * The pin that would have caught this in August.
   *
   * A URL handed to a model is not spent when its turn ends. The Claude Code
   * lane resumes one session per user per day and replays the whole transcript,
   * so the image block — and the presigned URL inside it — is re-fetched on
   * every later turn of that day. At fifteen minutes the URL was dead long
   * before the session was, and one photo failed every turn after it with
   * `400 Unable to download the file` until the day rolled over.
   *
   * So the TTL's floor is not a turn, it is the longest a session can live, and
   * that is decided in `ai/run.ts` by the day-rollover rule. Nothing makes the
   * two files read each other, which is why the number drifted out from under
   * the rule unnoticed — this is the thing that notices.
   *
   * The bound: a local day, plus the 04:00 rollover offset, plus the widest
   * timezone either side. Twenty-six hours is generous and still true.
   */
  it('signs a model read for longer than a session can possibly live', () => {
    const LONGEST_SESSION_HOURS = 26;
    expect(MODEL_READ_SECONDS).toBeGreaterThan(LONGEST_SESSION_HOURS * 60 * 60);
  });

  /**
   * And that the number is the one actually signed into the URL, rather than a
   * constant the signer quietly ignores in favour of its own default.
   */
  it('carries that lifetime into the signature it hands the model', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const url = new URL((await presignPhotoRead(saved.storageKey!))!);

    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(MODEL_READ_SECONDS));
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });
});
