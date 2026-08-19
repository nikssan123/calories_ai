import { beforeEach, describe, expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { query } from '../src/db.ts';
import { env } from '../src/env.ts';
import { readPhoto, savePhoto } from '../src/services/photos.ts';
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
