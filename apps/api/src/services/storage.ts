import { AwsClient } from 'aws4fetch';
import { env, type StorageEnv } from '../env.ts';

/**
 * Object storage for meal photos, and only for meal photos.
 *
 * A photo written to a container's local volume is a 404 from the second
 * replica, and unlike a rate-limit counter that miss is permanent — the bytes
 * exist, on a disk the request did not land on. This is the last thing pinning
 * the deployment to one box.
 *
 * Optional, on the same terms as Redis: unset the four variables and photos
 * stay in `UPLOAD_DIR`, which is exactly right for one process with a volume.
 * The switch is a configuration, not a migration — existing rows keep their
 * `file_path` and keep being read from disk after the bucket is turned on.
 *
 * Spoken to over plain SigV4 rather than through the AWS SDK. The SDK is tens
 * of megabytes and a meaningful slice of cold-start time for three verbs —
 * PUT, GET, DELETE — and one presigned URL; `aws4fetch` is 65 KB and signs the
 * `fetch` this code would be making anyway.
 */

/** How long a presigned read stays good for. */
const PRESIGN_SECONDS = 300;

/**
 * And a presigned write. Longer than a read, because a read is spent
 * immediately by an `<img>` already on screen while a write has to survive
 * somebody photographing their lunch on hotel wifi.
 */
const PRESIGN_PUT_SECONDS = 900;

export interface ObjectStore {
  put(key: string, mediaType: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
  /** A URL that authorises its own read, for handing to a browser. */
  presignGet(key: string, seconds?: number): Promise<string>;
  /**
   * A URL that authorises its own write, for handing to a phone.
   *
   * The point is the bytes never touching this process: a meal photo is a few
   * megabytes, base64 makes it a third bigger again, and sending it through the
   * API means holding all of it in the event loop for as long as the uplink
   * takes. The client PUTs to the bucket and tells us the key afterwards.
   *
   * `mediaType` is signed in, so the URL cannot be reused to upload something
   * else — the client must send the same `content-type` or the signature fails.
   */
  presignPut(key: string, mediaType: string, seconds?: number): Promise<string>;
}

let cached: { config: StorageEnv; store: ObjectStore } | null = null;

/**
 * The configured store, or null when this deployment keeps photos on disk.
 *
 * Read through a function rather than exported as a value so that a test can
 * build one against a different bucket, and so the client is constructed on
 * first use rather than at import — nothing should be signing anything just
 * because a module was loaded.
 */
export function objectStore(config: StorageEnv | null = env.storage): ObjectStore | null {
  if (!config) return null;
  if (cached?.config === config) return cached.store;

  const store = createObjectStore(config);
  cached = { config, store };
  return store;
}

export function createObjectStore(config: StorageEnv): ObjectStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: 's3',
    /*
     * Three attempts, not eleven. The default is ten retries on a 5xx or a 429,
     * backing off from 50ms by doubling — around fifty seconds in the worst
     * case, spent inside a request somebody is waiting on. Same argument as
     * `maxRetries: 1` on the model client: a blip is worth absorbing and an
     * outage is worth admitting to quickly.
     */
    retries: 2,
  });

  const url = (key: string) => objectUrl(config, key);

  return {
    async put(key, mediaType, bytes) {
      const response = await client.fetch(url(key), {
        method: 'PUT',
        // A `Uint8Array` rather than the Buffer directly, because a retry has to
        // be able to read the body a second time and a stream cannot.
        // `content-length` is left to `fetch`: it is computed from the body
        // anyway, and `aws4fetch` excludes it from the signature regardless.
        body: new Uint8Array(bytes),
        headers: { 'content-type': mediaType },
      });
      if (!response.ok) throw await storageError('store', key, response);
    },

    async get(key) {
      const response = await client.fetch(url(key), { method: 'GET' });
      // A missing object is a null, not a throw: the row can outlive the bytes
      // (a restored database, a half-finished delete), and every caller here
      // already has a "photo not found" branch that says the right thing.
      if (response.status === 404) return null;
      if (!response.ok) throw await storageError('read', key, response);
      return Buffer.from(await response.arrayBuffer());
    },

    async remove(key) {
      const response = await client.fetch(url(key), { method: 'DELETE' });
      // S3 returns 204 for a key that was never there, which is the semantics
      // wanted: deleting is meant to end with the object absent, and it is.
      if (!response.ok && response.status !== 404) throw await storageError('delete', key, response);
    },

    async presignPut(key, mediaType, seconds = PRESIGN_PUT_SECONDS) {
      const target = new URL(url(key));
      target.searchParams.set('X-Amz-Expires', String(seconds));
      const signed = await client.sign(target.toString(), {
        method: 'PUT',
        // Signed rather than merely expected: with the content type inside the
        // signature, a URL minted for a JPEG cannot be spent on anything else.
        headers: { 'content-type': mediaType },
        aws: { signQuery: true, allHeaders: true },
      });
      return signed.url;
    },

    async presignGet(key, seconds = PRESIGN_SECONDS) {
      const target = new URL(url(key));
      // Signed into the query string rather than a header, because the whole
      // point is a URL an `<img>` can fetch on its own.
      target.searchParams.set('X-Amz-Expires', String(seconds));
      const signed = await client.sign(target.toString(), {
        method: 'GET',
        aws: { signQuery: true },
      });
      return signed.url;
    },
  };
}

/**
 * Path-style unless the endpoint already names the bucket.
 *
 * R2 is path-style — `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`
 * — and so is an S3 endpoint given as `https://s3.<region>.amazonaws.com`. But
 * a virtual-hosted endpoint (`https://<bucket>.s3.<region>.amazonaws.com`) is
 * the more common way to write an AWS one, and appending the bucket to that
 * asks for `<bucket>/<bucket>/<key>`. Detecting it costs a line and spares
 * whoever configures this from having to know which convention we assumed.
 */
export function objectUrl(config: StorageEnv, key: string): string {
  const endpoint = new URL(config.endpoint);
  const hosted = endpoint.hostname.startsWith(`${config.bucket}.`);
  const path = hosted ? key : `${config.bucket}/${key}`;
  return `${config.endpoint}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The body carries S3's own explanation — `NoSuchBucket`, `SignatureDoesNotMatch`,
 * `AccessDenied` — and a bare status code sends whoever is reading the log to
 * check the wrong four things.
 */
async function storageError(verb: string, key: string, response: Response): Promise<Error> {
  const body = await response.text().catch(() => '');
  const detail = body.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? body.slice(0, 200);
  return new Error(
    `Could not ${verb} photo ${key} in object storage (${response.status}${detail ? `: ${detail}` : ''})`,
  );
}
