import { beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../src/db.ts';
import { createUser, type TestUser } from './helpers/factories.ts';

/**
 * Uploading a photo straight to the bucket, and claiming it afterwards.
 *
 * The claim is the security boundary of the whole feature: the client chooses
 * what key to send, so everything that stops one account attaching another's
 * photo to its own journal lives in `claimPhoto`. The rest of these cases are
 * about the ordering — no row until there are bytes to point at — which is what
 * keeps a permanent hole out of somebody's history.
 */

const objects = new Map<string, Buffer>();

vi.mock('../src/services/storage.ts', () => ({
  objectStore: () => ({
    put: async (key: string, _type: string, bytes: Buffer) => void objects.set(key, bytes),
    get: async (key: string) => objects.get(key) ?? null,
    remove: async (key: string) => void objects.delete(key),
    presignGet: async (key: string) => `https://bucket.test/${key}?sig=read`,
    presignPut: async (key: string) => `https://bucket.test/${key}?sig=write`,
  }),
}));

const { claimPhoto, presignPhotoRead, reservePhotoUpload } = await import(
  '../src/services/photos.ts',
);

let user: TestUser;
let other: TestUser;

beforeEach(async () => {
  objects.clear();
  user = await createUser();
  other = await createUser();
});

describe('reserving somewhere to upload', () => {
  it('hands back a key under the caller and a URL to PUT to', async () => {
    const ticket = await reservePhotoUpload(user.id, 'image/jpeg');

    expect(ticket!.key).toMatch(new RegExp(`^photos/${user.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(ticket!.url).toContain(ticket!.key);
    expect(ticket!.expiresInSeconds).toBeGreaterThan(0);
  });

  /**
   * The row comes later, in `claimPhoto`. Reserving one here would trade an
   * unclaimed object — a fraction of a cent, and reclaimable — for a row whose
   * photo never arrived, which is a broken image forever.
   */
  it('writes no row, because there are no bytes yet', async () => {
    await reservePhotoUpload(user.id, 'image/jpeg');
    const rows = await query('SELECT id FROM photos WHERE user_id = $1', [user.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('claiming what was uploaded', () => {
  async function uploaded(owner: TestUser) {
    const ticket = await reservePhotoUpload(owner.id, 'image/jpeg');
    objects.set(ticket!.key, Buffer.from('jpegbytes'));
    return ticket!.key;
  }

  it('writes the row once the object is really there', async () => {
    const key = await uploaded(user);
    const claimed = await claimPhoto(user.id, key, 'image/jpeg');

    expect(claimed).not.toBeNull();
    const rows = await query<{ storage_key: string; byte_size: number; file_path: string | null }>(
      'SELECT storage_key, byte_size, file_path FROM photos WHERE id = $1',
      [claimed!.id],
    );
    expect(rows[0]).toMatchObject({ storage_key: key, byte_size: 9, file_path: null });
  });

  /**
   * The one that matters. The owner is in the key so this is a string
   * comparison rather than a question the database has to be asked — and
   * without it a guessed key would attach somebody else's photo to this journal.
   */
  it('refuses a key belonging to another account', async () => {
    const key = await uploaded(other);

    expect(await claimPhoto(user.id, key, 'image/jpeg')).toBeNull();
    const rows = await query('SELECT id FROM photos WHERE user_id = $1', [user.id]);
    expect(rows).toHaveLength(0);
  });

  it('refuses a key that was never uploaded to', async () => {
    const ticket = await reservePhotoUpload(user.id, 'image/jpeg');
    // Reserved, never PUT — the object is absent.
    expect(await claimPhoto(user.id, ticket!.key, 'image/jpeg')).toBeNull();
    expect(await query('SELECT id FROM photos WHERE user_id = $1', [user.id])).toHaveLength(0);
  });

  it('refuses a key that does not name a user at all', async () => {
    objects.set('photos/../secrets.jpg', Buffer.from('x'));
    expect(await claimPhoto(user.id, 'photos/../secrets.jpg', 'image/jpeg')).toBeNull();
  });

  /**
   * A retried turn is the ordinary way this happens. Two rows sharing one
   * object is one deletion away from a permanently broken image on the other.
   */
  it('returns the same row when the same key is claimed twice', async () => {
    const key = await uploaded(user);
    const first = await claimPhoto(user.id, key, 'image/jpeg');
    const second = await claimPhoto(user.id, key, 'image/jpeg');

    expect(second!.id).toBe(first!.id);
    expect(await query('SELECT id FROM photos WHERE storage_key = $1', [key])).toHaveLength(1);
  });
});

/**
 * What the model is handed.
 *
 * The bytes went phone-to-bucket on the way in; a presigned read is what stops
 * them coming back through this process on the way out. If this ever reverts to
 * base64 nothing breaks and nothing errors — the photo still gets read, the API
 * just quietly starts carrying every megabyte of it again.
 */
describe('handing the photo to the model', () => {
  it('presigns a read rather than loading the bytes', async () => {
    const ticket = await reservePhotoUpload(user.id, 'image/jpeg');
    objects.set(ticket!.key, Buffer.from('jpegbytes'));
    const claimed = await claimPhoto(user.id, ticket!.key, 'image/jpeg');

    const url = await presignPhotoRead(claimed!.storageKey!);
    expect(url).toContain(ticket!.key);
    expect(url).toContain('sig=read');
  });
});
