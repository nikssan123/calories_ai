import { beforeEach, describe, expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '../src/db.ts';
import { env } from '../src/env.ts';
import {
  readPhoto,
  readPhotoById,
  savePhoto,
  signPhotoUrl,
  verifyPhotoUrl,
} from '../src/services/photos.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let user: TestUser;
let other: TestUser;

beforeEach(async () => {
  user = await createUser();
  other = await createUser();
});

describe('savePhoto', () => {
  it('writes the bytes and records the row', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const bytes = await readFile(saved.filePath);
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
    expect(saved.filePath.endsWith(extension)).toBe(true);
  });
});

describe('readPhoto', () => {
  it('returns the bytes to their owner', async () => {
    const saved = await savePhoto(user.id, 'image/png', PIXEL);
    const photo = await readPhoto(user.id, saved.id);
    expect(photo!.mediaType).toBe('image/png');
    expect(photo!.bytes.equals(Buffer.from(PIXEL, 'base64'))).toBe(true);
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
    await rm(saved.filePath);
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
    const photo = await readPhotoById(saved.id);
    expect(photo!.bytes.equals(Buffer.from(PIXEL, 'base64'))).toBe(true);
  });

  it('returns null for an id that does not exist', async () => {
    expect(await readPhotoById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
