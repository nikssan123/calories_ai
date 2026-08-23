import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectStore, objectUrl } from '../src/services/storage.ts';
import { readEnv, storageEnv, type StorageEnv } from '../src/env.ts';

/**
 * The S3 client, against a stubbed `fetch`.
 *
 * What is worth testing here is not that SigV4 is correct — `aws4fetch` has its
 * own suite for that, and a re-implementation of the signature in the assertion
 * would only prove the two agree. It is everything around it: which URL each
 * verb aims at, which statuses mean "absent" rather than "broken", and whether
 * a failure says enough to act on. Those are the parts written here, and so the
 * parts that can be wrong here.
 *
 * A real bucket is exercised separately at the bottom, opt-in.
 */

const CONFIG: StorageEnv = {
  endpoint: 'https://acct123.r2.cloudflarestorage.com',
  bucket: 'meals',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  region: 'auto',
};

let calls: Request[];
const original = globalThis.fetch;

/** Answers every signed request with `reply`, recording what was asked. */
function stubFetch(reply: (request: Request) => Response) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: any) => {
    const request = input as Request;
    calls.push(request);
    return reply(request);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = original;
});

describe('objectUrl', () => {
  it('puts the bucket in the path for an endpoint that does not name it', () => {
    expect(objectUrl(CONFIG, 'photos/u/a.jpg')).toBe(
      'https://acct123.r2.cloudflarestorage.com/meals/photos/u/a.jpg',
    );
  });

  /**
   * The AWS convention. Appending the bucket to an endpoint that already names
   * it would ask for `meals/meals/…`, which fails as a 404 on a path nobody
   * wrote — the least informative way for a configuration mistake to surface.
   */
  it('leaves the bucket out when the endpoint already carries it', () => {
    const hosted = { ...CONFIG, endpoint: 'https://meals.s3.eu-west-1.amazonaws.com' };
    expect(objectUrl(hosted, 'photos/u/a.jpg')).toBe(
      'https://meals.s3.eu-west-1.amazonaws.com/photos/u/a.jpg',
    );
  });

  /**
   * Each segment separately, so the slashes that structure the key survive as
   * slashes. Encoding the whole key would turn the prefix into one flat name
   * and quietly undo the reason for having a prefix.
   */
  it('encodes each key segment without eating the separators', () => {
    expect(objectUrl(CONFIG, 'photos/a b/c+d.jpg')).toBe(
      'https://acct123.r2.cloudflarestorage.com/meals/photos/a%20b/c%2Bd.jpg',
    );
  });
});

describe('put', () => {
  it('sends the bytes to the object URL with its media type', async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    await createObjectStore(CONFIG).put('photos/u/a.jpg', 'image/jpeg', Buffer.from('bytes'));

    expect(calls).toHaveLength(1);
    const request = calls[0]!;
    expect(request.method).toBe('PUT');
    expect(request.url).toBe('https://acct123.r2.cloudflarestorage.com/meals/photos/u/a.jpg');
    expect(request.headers.get('content-type')).toBe('image/jpeg');
    expect(await request.text()).toBe('bytes');
  });

  it('signs the request rather than sending it bare', async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    await createObjectStore(CONFIG).put('photos/u/a.jpg', 'image/jpeg', Buffer.from('bytes'));

    expect(calls[0]!.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA/);
    expect(calls[0]!.headers.get('x-amz-content-sha256')).toBeTruthy();
  });

  /**
   * The status alone sends whoever reads the log to check the wrong things: a
   * 403 is a wrong key, a wrong region, a token scoped to another bucket, or a
   * clock skew, and S3 says which in the body.
   */
  it('carries the store’s own error code into the message', async () => {
    stubFetch(
      () =>
        new Response(
          '<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code></Error>',
          { status: 403 },
        ),
    );
    await expect(
      createObjectStore(CONFIG).put('photos/u/a.jpg', 'image/jpeg', Buffer.from('b')),
    ).rejects.toThrow(/403.*SignatureDoesNotMatch/);
  });
});

describe('get', () => {
  it('returns the bytes', async () => {
    stubFetch(() => new Response('bytes', { status: 200 }));
    const bytes = await createObjectStore(CONFIG).get('photos/u/a.jpg');
    expect(bytes!.toString()).toBe('bytes');
    expect(calls[0]!.method).toBe('GET');
  });

  /**
   * A row can outlive its object — a database restored past a delete, a purge
   * that got half way. Null rather than a throw, because every caller already
   * has a "photo not found" branch and none of them wants a 500 for it.
   */
  it('returns null for an object that is not there', async () => {
    stubFetch(() => new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }));
    expect(await createObjectStore(CONFIG).get('photos/u/gone.jpg')).toBeNull();
  });

  it('throws on anything else, rather than pretending the photo is missing', async () => {
    stubFetch(() => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }));
    await expect(createObjectStore(CONFIG).get('photos/u/a.jpg')).rejects.toThrow(/AccessDenied/);
  });
});

describe('remove', () => {
  it('deletes the object', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await createObjectStore(CONFIG).remove('photos/u/a.jpg');
    expect(calls[0]!.method).toBe('DELETE');
  });

  /**
   * Deleting is meant to end with the object absent, and a 404 means it is.
   * Treating that as a failure would make account deletion throw part-way
   * through a loop whose rows are already gone.
   */
  it('treats an already-absent object as done', async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    await expect(createObjectStore(CONFIG).remove('photos/u/gone.jpg')).resolves.toBeUndefined();
  });

  it('still throws when the store refuses', async () => {
    stubFetch(() => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }));
    await expect(createObjectStore(CONFIG).remove('photos/u/a.jpg')).rejects.toThrow(/AccessDenied/);
  });
});

describe('presignGet', () => {
  it('signs into the query string, so an <img> can fetch it unaided', async () => {
    const url = new URL(await createObjectStore(CONFIG).presignGet('photos/u/a.jpg'));

    expect(url.origin + url.pathname).toBe(
      'https://acct123.r2.cloudflarestorage.com/meals/photos/u/a.jpg',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIAEXAMPLE');
    // No header to send is the entire point: this URL is handed to an element
    // that does its own fetching and cannot be told to add one.
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('honours a shorter life when asked for one', async () => {
    const url = new URL(await createObjectStore(CONFIG).presignGet('photos/u/a.jpg', 60));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  /** Signing is local arithmetic; reaching the network here would be a bug. */
  it('does not call the store', async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    await createObjectStore(CONFIG).presignGet('photos/u/a.jpg');
    expect(calls).toHaveLength(0);
  });
});

describe('presignPut', () => {
  it('signs the content type in, so the URL cannot be spent on something else', async () => {
    const url = new URL(
      await createObjectStore(CONFIG).presignPut('photos/u/a.jpg', 'image/jpeg'),
    );

    expect(url.origin + url.pathname).toBe(
      'https://acct123.r2.cloudflarestorage.com/meals/photos/u/a.jpg',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // The header is named in the signature rather than merely expected: a URL
    // minted for a JPEG is refused if the client PUTs anything else under it.
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  });

  /** Longer than a read: a read is spent by an <img> already on screen, a write
      has to survive somebody photographing lunch on hotel wifi. */
  it('lasts fifteen minutes by default, and honours a shorter life', async () => {
    const store = createObjectStore(CONFIG);
    const dflt = new URL(await store.presignPut('photos/u/a.jpg', 'image/jpeg'));
    const short = new URL(await store.presignPut('photos/u/a.jpg', 'image/jpeg', 60));

    expect(dflt.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(short.searchParams.get('X-Amz-Expires')).toBe('60');
  });

  it('does not call the store', async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    await createObjectStore(CONFIG).presignPut('photos/u/a.jpg', 'image/jpeg');
    expect(calls).toHaveLength(0);
  });
});

describe('configuration', () => {
  const BASE: NodeJS.ProcessEnv = { DATABASE_URL: 'postgres://ct:ct@localhost:5433/ct' };
  const FULL = {
    S3_ENDPOINT: 'https://acct123.r2.cloudflarestorage.com',
    S3_BUCKET: 'meals',
    S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
    S3_SECRET_ACCESS_KEY: 'secret',
  };

  it('reads all four, and defaults the region to auto for R2', () => {
    expect(storageEnv({ ...FULL } as never)).toEqual(CONFIG);
  });

  it('takes a real region when one is named', () => {
    expect(storageEnv({ ...FULL, S3_REGION: 'eu-west-1' } as never)?.region).toBe('eu-west-1');
  });

  it('trims a trailing slash off the endpoint, rather than doubling it in every key', () => {
    const config = storageEnv({ ...FULL, S3_ENDPOINT: `${FULL.S3_ENDPOINT}/` } as never);
    expect(objectUrl(config!, 'a.jpg')).toBe(
      'https://acct123.r2.cloudflarestorage.com/meals/a.jpg',
    );
  });

  /**
   * The paste Cloudflare invites. Its bucket settings page labels
   * `https://<account>.r2.cloudflarestorage.com/<bucket>` as the "S3 API" URL,
   * so the obvious copy is one segment longer than this wants — and left alone
   * it would ask for `meals/meals/<key>` and 404 every photo on a path nobody
   * wrote.
   */
  it('drops the bucket when the endpoint was copied from R2 with it attached', () => {
    const config = storageEnv({ ...FULL, S3_ENDPOINT: `${FULL.S3_ENDPOINT}/meals` } as never);
    expect(config!.endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
    expect(objectUrl(config!, 'a.jpg')).toBe(
      'https://acct123.r2.cloudflarestorage.com/meals/a.jpg',
    );
  });

  it('drops it with a trailing slash too, which is the other likely paste', () => {
    const config = storageEnv({ ...FULL, S3_ENDPOINT: `${FULL.S3_ENDPOINT}/meals/` } as never);
    expect(config!.endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
  });

  /** A path that merely starts with the name is somebody's deliberate prefix. */
  it('leaves a path that only resembles the bucket name alone', () => {
    const config = storageEnv({ ...FULL, S3_ENDPOINT: `${FULL.S3_ENDPOINT}/meals-archive` } as never);
    expect(config!.endpoint).toBe('https://acct123.r2.cloudflarestorage.com/meals-archive');
  });

  it('is null when none of it is set, which is local disk', () => {
    expect(storageEnv({} as never)).toBeNull();
  });

  /**
   * The failure this exists to prevent: a deployment that names a bucket but no
   * key would otherwise boot happily and fail at the first photo somebody
   * takes, which is both the least convenient moment to find out and the
   * hardest place to see why.
   */
  it.each([
    ['S3_ENDPOINT', 'S3_ENDPOINT'],
    ['S3_BUCKET', 'S3_BUCKET'],
    ['S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID'],
    ['S3_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY'],
  ])('refuses to boot with %s missing', (_label, missing) => {
    const partial: Record<string, string> = { ...FULL };
    delete partial[missing];
    expect(() => storageEnv(partial as never)).toThrow(/half-configured/);
  });

  /**
   * Forced off under test for the reason UPLOAD_DIR is redirected to
   * `.test-uploads`: the suite writes and deletes photos, and a developer with
   * real credentials in their .env would otherwise have `pnpm test` writing
   * objects into the deployment's live bucket.
   */
  it('ignores developer credentials under test', () => {
    expect(readEnv({ ...BASE, ...FULL, NODE_ENV: 'test' }).storage).toBeNull();
  });
});
