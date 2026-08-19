import { randomUUID } from 'node:crypto';
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

export async function readPhoto(
  userId: string,
  photoId: string,
): Promise<{ mediaType: string; bytes: Buffer } | null> {
  const row = await queryOne<{ media_type: string; file_path: string }>(
    'SELECT media_type, file_path FROM photos WHERE id = $1 AND user_id = $2',
    [photoId, userId],
  );
  if (!row) return null;

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
