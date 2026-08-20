import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { env } from '../env.ts';
import { queryOne } from '../db.ts';

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

export async function savePhoto(
  userId: string,
  mediaType: string,
  base64: string,
): Promise<{ id: string; filePath: string }> {
  const dir = resolve(env.uploadDir);
  await mkdir(dir, { recursive: true });

  const bytes = Buffer.from(base64, 'base64');
  const fileName = `${randomUUID()}${EXTENSIONS[mediaType] ?? '.bin'}`;
  const filePath = join(dir, fileName);
  await writeFile(filePath, bytes);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO photos (user_id, media_type, file_path, byte_size)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, mediaType, filePath, bytes.byteLength],
  );
  return { id: row!.id, filePath };
}

export interface StoredPhoto {
  mediaType: string;
  bytes: Buffer;
}

/** The owner's own read. Scoped by user, so a wrong id is indistinguishable
    from someone else's photo. */
export async function readPhoto(userId: string, photoId: string): Promise<StoredPhoto | null> {
  const row = await queryOne<{ media_type: string; file_path: string }>(
    'SELECT media_type, file_path FROM photos WHERE id = $1 AND user_id = $2',
    [photoId, userId],
  );
  return row ? loadFile(row) : null;
}

/**
 * A read authorised by a signature rather than a session, so there is no user
 * to scope by. Only call this once `verifyPhotoUrl` has passed — the signature
 * is what stands in for ownership here.
 */
export async function readPhotoById(photoId: string): Promise<StoredPhoto | null> {
  const row = await queryOne<{ media_type: string; file_path: string }>(
    'SELECT media_type, file_path FROM photos WHERE id = $1',
    [photoId],
  );
  return row ? loadFile(row) : null;
}

async function loadFile(row: { media_type: string; file_path: string }): Promise<StoredPhoto | null> {
  // The stored path is written by savePhoto, never by a client, but confine the
  // read to the upload directory anyway.
  const dir = resolve(env.uploadDir);
  const filePath = resolve(row.file_path);
  if (!filePath.startsWith(dir)) return null;
  if (!EXTENSIONS[row.media_type] && extname(filePath) !== '.bin') return null;

  try {
    return { mediaType: row.media_type, bytes: await readFile(filePath) };
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
 * uses when these files eventually move off local disk.
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
