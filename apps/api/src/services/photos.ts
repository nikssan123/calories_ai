import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { env } from '../env.ts';
import { queryOne } from '../db.ts';
import { objectStore } from './storage.ts';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * How long a signed photo URL stays good for.
 *
 * Long, because the cost of it being too short is a broken image in the middle
 * of someone's history and the cost of it being too long is small: the URL only
 * ever reaches the client that was already entitled to the photo. Every read of
 * the conversation mints fresh links, so this only binds an app left open
 * without reloading.
 */
const URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SavedPhoto {
  id: string;
  /** Set when the bytes went to local disk, null when they went to a bucket. */
  filePath: string | null;
  /** Set when the bytes went to a bucket, null when they went to local disk. */
  storageKey: string | null;
}

export async function savePhoto(
  userId: string,
  mediaType: string,
  base64: string,
): Promise<SavedPhoto> {
  const bytes = Buffer.from(base64, 'base64');
  const fileName = `${randomUUID()}${EXTENSIONS[mediaType] ?? '.bin'}`;

  const store = objectStore();
  let filePath: string | null = null;
  let storageKey: string | null = null;

  if (store) {
    /*
     * Keyed by owner, which buys two things beyond tidiness: a bucket listing
     * is readable by a human, and a lifecycle rule or a bulk delete can be
     * scoped to one account without consulting the database. The uuid still
     * carries the uniqueness — the prefix is for whoever has to look.
     */
    storageKey = `photos/${userId}/${fileName}`;
    await store.put(storageKey, mediaType, bytes);
  } else {
    const dir = resolve(env.uploadDir);
    await mkdir(dir, { recursive: true });
    filePath = join(dir, fileName);
    await writeFile(filePath, bytes);
  }

  /*
   * Written after the bytes are safely stored, so the failure mode is an
   * orphaned object rather than a row pointing at nothing. An orphan costs a
   * fraction of a cent and is reclaimable; a row whose photo never arrived is a
   * permanent hole in somebody's history.
   */
  const row = await queryOne<{ id: string }>(
    `INSERT INTO photos (user_id, media_type, file_path, storage_key, byte_size)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [userId, mediaType, filePath, storageKey, bytes.byteLength],
  );
  return { id: row!.id, filePath, storageKey };
}

/**
 * A place for a client to put a photo, without it passing through here.
 *
 * The base64 path this replaces is expensive in a way that does not show up on
 * the model bill: the encoding is a third larger than the bytes, the whole of it
 * arrives as one JSON body, and an API worker holds it for as long as the phone
 * takes to send it. On a slow uplink that is a request open for tens of seconds
 * to move data the bucket would have taken directly.
 *
 * No row is written here, deliberately. `savePhoto` writes one only once the
 * bytes are safely stored, and reserving an id up front would give up exactly
 * that: a row whose photo never arrived is a permanent hole in somebody's
 * history, while an unclaimed object is a fraction of a cent and reclaimable by
 * a lifecycle rule. So this hands back a key and a URL, and `claimPhoto` writes
 * the row afterwards, once there is something to point at.
 *
 * Null when no bucket is configured. That is not an error — it is a local-disk
 * deployment, where there is nowhere to upload to and the client should send
 * the bytes the old way.
 */
export interface PhotoUpload {
  key: string;
  url: string;
  expiresInSeconds: number;
}

export async function reservePhotoUpload(
  userId: string,
  mediaType: string,
): Promise<PhotoUpload | null> {
  const store = objectStore();
  if (!store) return null;

  // The same shape `savePhoto` writes, and the owner in the key is what makes
  // `claimPhoto` able to refuse somebody else's object without a second lookup.
  const key = `photos/${userId}/${randomUUID()}${EXTENSIONS[mediaType] ?? '.bin'}`;
  return { key, url: await store.presignPut(key, mediaType), expiresInSeconds: 900 };
}

/**
 * How long a read handed to a *model* stays good for.
 *
 * Longer than the one handed to a browser, and for the opposite reason. An
 * `<img>` spends its URL immediately; a model's is spent by somebody else's
 * fetch at the far end of a turn that may have run a tool loop first, and a
 * link that expired mid-turn fails the whole thing rather than showing a broken
 * image somebody can reload past.
 */
const MODEL_READ_SECONDS = 900;

/**
 * Somewhere the model can fetch the photo from, instead of being handed it.
 *
 * Null when the deployment keeps photos on local disk — there is no URL to
 * give, and the caller has to read the bytes as it always did.
 */
export async function presignPhotoRead(storageKey: string): Promise<string | null> {
  const store = objectStore();
  return store ? store.presignGet(storageKey, MODEL_READ_SECONDS) : null;
}

/**
 * Turn an uploaded object into a photo row, or refuse it.
 *
 * Three things have to be true, and the first is the one that matters: the key
 * has to name this user. The client chooses what to send here, so without that
 * check a guessed key would let one account attach another's photo to its own
 * journal. The owner is in the key precisely so this is a string comparison
 * rather than a question the database has to be asked.
 *
 * Then the object has to exist — a client that asked for a URL and never used
 * it must not be able to leave a row pointing at nothing — and its size is read
 * while we are there, since `byte_size` is what the storage report is built on.
 *
 * Claiming twice returns the first row rather than writing a second. A retried
 * turn is the ordinary way that happens, and two rows sharing one object is a
 * deletion away from a permanent broken image.
 */
export async function claimPhoto(
  userId: string,
  key: string,
  mediaType: string,
): Promise<SavedPhoto | null> {
  if (!key.startsWith(`photos/${userId}/`)) return null;

  const store = objectStore();
  if (!store) return null;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM photos WHERE storage_key = $1 AND user_id = $2',
    [key, userId],
  );
  if (existing) return { id: existing.id, filePath: null, storageKey: key };

  const bytes = await store.get(key);
  if (!bytes) return null;

  const row = await queryOne<{ id: string }>(
    `INSERT INTO photos (user_id, media_type, file_path, storage_key, byte_size)
     VALUES ($1,$2,NULL,$3,$4) RETURNING id`,
    [userId, mediaType, key, bytes.byteLength],
  );
  return { id: row!.id, filePath: null, storageKey: key };
}

/**
 * How a photo should reach the client.
 *
 * A union rather than always-bytes, because the two backends want different
 * answers and flattening them would throw away the better one. Local disk has
 * to be read and sent. A bucket should not be: proxying the bytes spends our
 * bandwidth and holds a multi-megabyte buffer in the event loop for a file the
 * bucket will serve for free, which is most of the reason for having a bucket.
 * So the API stays the thing that decides *whether* the read is allowed, and
 * hands off the transfer once it has.
 */
export type PhotoDelivery =
  | { kind: 'bytes'; mediaType: string; bytes: Buffer }
  | { kind: 'redirect'; url: string };

interface PhotoRow {
  media_type: string;
  file_path: string | null;
  storage_key: string | null;
}

const COLUMNS = 'media_type, file_path, storage_key';

/** The owner's own read. Scoped by user, so a wrong id is indistinguishable
    from someone else's photo. */
export async function readPhoto(userId: string, photoId: string): Promise<PhotoDelivery | null> {
  const row = await queryOne<PhotoRow>(
    `SELECT ${COLUMNS} FROM photos WHERE id = $1 AND user_id = $2`,
    [photoId, userId],
  );
  return row ? deliver(row) : null;
}

/**
 * A read authorised by a signature rather than a session, so there is no user
 * to scope by. Only call this once `verifyPhotoUrl` has passed — the signature
 * is what stands in for ownership here.
 */
export async function readPhotoById(photoId: string): Promise<PhotoDelivery | null> {
  const row = await queryOne<PhotoRow>(`SELECT ${COLUMNS} FROM photos WHERE id = $1`, [photoId]);
  return row ? deliver(row) : null;
}

/**
 * The bytes themselves, whichever backend holds them.
 *
 * Separate from `deliver` because a caller that genuinely needs the content —
 * as opposed to a caller serving it to a browser — should not have to know
 * that one of the two answers is a URL.
 */
export async function readPhotoBytes(photoId: string): Promise<Buffer | null> {
  const row = await queryOne<PhotoRow>(`SELECT ${COLUMNS} FROM photos WHERE id = $1`, [photoId]);
  if (!row) return null;
  if (row.storage_key) return (await objectStore()?.get(row.storage_key)) ?? null;
  return loadFile(row);
}

async function deliver(row: PhotoRow): Promise<PhotoDelivery | null> {
  if (row.storage_key) {
    const store = objectStore();
    /*
     * A key with no store configured is a deployment that turned the bucket
     * off after writing to it. Nothing here can serve that, and guessing —
     * looking for a local file that was never written — would turn a
     * configuration mistake into a confusing 404 rather than a loud one.
     */
    if (!store) throw new Error('This photo is in object storage, which is not configured.');
    return { kind: 'redirect', url: await store.presignGet(row.storage_key) };
  }

  const bytes = await loadFile(row);
  return bytes ? { kind: 'bytes', mediaType: row.media_type, bytes } : null;
}

async function loadFile(row: PhotoRow): Promise<Buffer | null> {
  if (!row.file_path) return null;

  // The stored path is written by savePhoto, never by a client, but confine the
  // read to the upload directory anyway.
  const dir = resolve(env.uploadDir);
  const filePath = resolve(row.file_path);
  if (!filePath.startsWith(dir)) return null;
  if (!EXTENSIONS[row.media_type] && extname(filePath) !== '.bin') return null;

  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * A photo URL that carries its own authorisation.
 *
 * An `<img>` — and React Native's `<Image>` especially — fetches on its own and
 * cannot be made to send an Authorization header, so a session-scoped photo
 * route is unreachable from the one element that needs it. Signing the path
 * moves the proof into the URL itself, which is the same shape object storage
 * uses — and now literally is what happens on the far side, since the route
 * trades this signature for the bucket's own.
 *
 * Returned as a path rather than an absolute URL because the API does not know
 * what hostname it is reached by: the browser goes through the Next proxy at
 * `/api`, the app talks to the origin directly, and each joins this to its own
 * base.
 */
export function signPhotoUrl(photoId: string, secret: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + URL_TTL_SECONDS;
  const signature = photoSignature(photoId, expiresAt, secret);
  return `/photos/${photoId}?exp=${expiresAt}&sig=${signature}`;
}

export function verifyPhotoUrl(
  photoId: string,
  exp: unknown,
  sig: unknown,
  secret: string,
  now = Date.now(),
): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string') return false;

  const expiresAt = Number(exp);
  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now) return false;

  const expected = Buffer.from(photoSignature(photoId, expiresAt, secret));
  const given = Buffer.from(sig);
  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/**
 * The expiry is inside the signed material, not merely beside it — otherwise
 * anyone holding a link could extend it by editing the query string.
 */
function photoSignature(photoId: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${photoId}.${expiresAt}`).digest('base64url');
}
