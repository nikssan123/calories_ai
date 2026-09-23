import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  SocialCandidate,
  SocialChannel,
  SocialDecision,
  SocialQueue,
  SocialState,
  SocialUpload,
} from '@ct/shared';
import { query, queryOne } from '../db.ts';
import { env } from '../env.ts';
import { objectStore } from './storage.ts';

/**
 * The social queue.
 *
 * Rendered posts come in from `scripts/content/queue.mts`, sit as `pending`,
 * and go out to Buffer when somebody approves them. Everything here is behind
 * the admin guard; none of it is reachable by a user.
 *
 * The division of labour, which is the only interesting thing about this file:
 *
 *   post.mts   composes the image, on a Mac, with a headless Chrome. §1 keeps
 *              the assembly line there and the API container has no browser.
 *   queue.mts  uploads the PNG and the caption.
 *   this       stores it, shows it, and on approval calls Buffer.
 *   Buffer     decides *when*, from the posting schedule already configured per
 *              channel. Nothing here models a schedule, which is the whole
 *              reason to keep using Buffer rather than the platform APIs — see
 *              CONTENT_ENGINE.md §7 on what direct posting costs.
 *
 * Buffer's GraphQL contract below was read off its own introspection on
 * 2026-09-23: `createPost(input: CreatePostInput!): PostActionPayload!`, where
 * the payload is a union of one success and six errors. That union is why every
 * call here asks for `__typename` — a Buffer refusal is a 200 with an error
 * member in it, not an HTTP error, and treating it as success is how a queue
 * ends up marking posts sent that never went anywhere.
 */

/* ── rows ───────────────────────────────────────────────────────────── */

interface QueueRow {
  id: string;
  source_key: string;
  caption: string;
  asset_key: string;
  media_type: string;
  width: number;
  height: number;
  state: SocialState;
  channel_ids: string[];
  buffer_ids: string[];
  error: string | null;
  created_at: Date;
  decided_at: Date | null;
  posted_at: Date | null;
}

const COLUMNS = `
  id, source_key, caption, asset_key, media_type, width, height, state,
  channel_ids, buffer_ids, error, created_at, decided_at, posted_at
`;

/**
 * The asset URL is built here rather than stored, because it is derived from
 * configuration: the same row serves a different origin in dev and in
 * production, and a URL baked into a row at upload time would be wrong the
 * first time the hostname changed.
 */
function candidate(row: QueueRow): SocialCandidate {
  const origin = env.buffer?.publicOrigin ?? '';
  return {
    id: row.id,
    sourceKey: row.source_key,
    caption: row.caption,
    assetUrl: `${origin}/public/social/${row.id}.png`,
    width: row.width,
    height: row.height,
    state: row.state,
    channelIds: row.channel_ids,
    bufferIds: row.buffer_ids,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    postedAt: row.posted_at?.toISOString() ?? null,
  };
}

/* ── bytes ──────────────────────────────────────────────────────────── */

/**
 * One logical key whichever backend holds it, and a read that tries both.
 *
 * `photos.ts` keeps `storage_key` and `file_path` apart and refuses to guess
 * when a deployment turns its bucket off after writing to it — right, because
 * a user's meal photo going quietly missing is a permanent hole in their
 * history, and a loud error is the kinder failure.
 *
 * This is the other case. There are a few dozen of these, they are marketing
 * images, they can be re-rendered from a key in `content/out/posts/`, and the
 * cost of two lookups on an admin-only path is nothing. So try the bucket, then
 * the disk, and a backend that moved underneath us costs one extra miss instead
 * of an exception.
 */
function assetDir(): string {
  return resolve(env.uploadDir, 'social');
}

async function putAsset(key: string, mediaType: string, bytes: Buffer): Promise<void> {
  const store = objectStore();
  if (store) {
    await store.put(key, mediaType, bytes);
    return;
  }
  const dir = assetDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key.replace(/^social\//, '')), bytes);
}

async function getAsset(key: string): Promise<Buffer | null> {
  const store = objectStore();
  if (store) {
    const bytes = await store.get(key).catch(() => null);
    if (bytes) return bytes;
  }
  // Confine the read to the asset directory. The key is written by this file
  // and never by a client, but it ends up in a path either way.
  const dir = assetDir();
  const path = resolve(dir, key.replace(/^social\//, ''));
  if (!path.startsWith(dir)) return null;
  return await readFile(path).catch(() => null);
}

/* ── in ─────────────────────────────────────────────────────────────── */

export async function addCandidate(upload: SocialUpload): Promise<SocialCandidate> {
  const bytes = Buffer.from(upload.bytes, 'base64');
  const key = `social/${randomUUID()}.png`;
  // Bytes first, so a failure leaves an orphaned object rather than a row
  // pointing at nothing — same order and same reasoning as savePhoto.
  await putAsset(key, upload.mediaType, bytes);

  const row = await queryOne<QueueRow>(
    `INSERT INTO social_queue (source_key, caption, asset_key, media_type, width, height)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [upload.sourceKey, upload.caption, key, upload.mediaType, upload.width, upload.height],
  );
  if (!row) throw new Error('social_queue insert returned nothing');
  return candidate(row);
}

export async function readCandidateAsset(
  id: string,
): Promise<{ bytes: Buffer; mediaType: string } | null> {
  const row = await queryOne<QueueRow>(
    `SELECT ${COLUMNS} FROM social_queue WHERE id = $1`,
    [id],
  );
  if (!row) return null;
  const bytes = await getAsset(row.asset_key);
  return bytes ? { bytes, mediaType: row.media_type } : null;
}

/* ── Buffer ─────────────────────────────────────────────────────────── */

/** The error members of every payload union that matters here. */
const ERROR_FIELDS = `
  ... on InvalidInputError { message }
  ... on NotFoundError { message }
  ... on UnauthorizedError { message }
  ... on UnexpectedError { message }
  ... on LimitReachedError { message }
  ... on RestProxyError { message code link }
`;

class BufferError extends Error {}

async function bufferCall<T>(document: string, variables: Record<string, unknown>): Promise<T> {
  const config = env.buffer;
  if (!config) throw new BufferError('Buffer is not configured on this deployment.');

  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: document, variables }),
  });

  const body = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message: string }[];
  } | null;

  // A transport failure and a GraphQL failure read the same way to a caller,
  // and both mean the post did not happen.
  if (!res.ok) throw new BufferError(`Buffer answered ${res.status}`);
  if (body?.errors?.length) throw new BufferError(body.errors.map((e) => e.message).join('; '));
  if (!body?.data) throw new BufferError('Buffer returned no data');
  return body.data;
}

export async function listChannels(): Promise<SocialChannel[]> {
  if (!env.buffer) return [];
  const data = await bufferCall<{
    channels: {
      id: string;
      name: string;
      displayName: string | null;
      service: string;
      avatar: string;
      isDisconnected: boolean;
    }[];
  }>(
    `query Channels($input: ChannelsInput!) {
       channels(input: $input) {
         id name displayName service avatar isDisconnected
       }
     }`,
    { input: { organizationId: env.buffer.organizationId } },
  );
  return data.channels.map((c) => ({
    id: c.id,
    name: c.displayName ?? c.name,
    service: c.service,
    avatar: c.avatar ?? null,
    disconnected: c.isDisconnected,
  }));
}

/**
 * How full Buffer's own queue is, against the plan's ceiling.
 *
 * Worth a request of its own because the ceiling is low and silent: the free
 * plan allows ten scheduled posts, and the eleventh `createPost` comes back as
 * `LimitReachedError` — after the panel has already told somebody their
 * approval worked. Reading it first lets the panel say so instead.
 */
async function scheduledUsage(): Promise<{ used: number; limit: number | null }> {
  if (!env.buffer) return { used: 0, limit: null };
  const data = await bufferCall<{
    account: { organizations: { id: string; limits: { scheduledPosts: number } }[] };
    posts: { edges: { cursor: string }[] | null };
  }>(
    `query Usage($org: OrganizationFilterInput, $posts: PostsInput!) {
       account { organizations(filter: $org) { id limits { scheduledPosts } } }
       posts(first: 100, input: $posts) { edges { cursor } }
     }`,
    {
      org: { organizationId: env.buffer.organizationId },
      posts: {
        organizationId: env.buffer.organizationId,
        filter: { status: ['scheduled', 'needs_approval'] },
      },
    },
  );
  return {
    used: data.posts.edges?.length ?? 0,
    limit: data.account.organizations[0]?.limits.scheduledPosts ?? null,
  };
}

/**
 * Per-service requirements, from Buffer's own validation rules.
 *
 * Instagram will not take a post without `type` and `shouldShareToFeed`, and
 * both TikTok and Instagram require an asset — which every candidate has, since
 * a row cannot exist without one. Twitter needs nothing. Anything else gets no
 * metadata and will be refused by Buffer if it wanted some, which is the right
 * way round: a guessed default would post something nobody chose.
 */
function metadataFor(service: string): Record<string, unknown> | undefined {
  if (service === 'instagram') {
    return { instagram: { type: 'post', shouldShareToFeed: true } };
  }
  if (service === 'tiktok') return { tiktok: {} };
  return undefined;
}

async function createPost(
  channel: SocialChannel,
  text: string,
  assetUrl: string,
  altText: string,
): Promise<string> {
  const data = await bufferCall<{
    createPost: { __typename: string; post?: { id: string }; message?: string };
  }>(
    `mutation CreatePost($input: CreatePostInput!) {
       createPost(input: $input) {
         __typename
         ... on PostActionSuccess { post { id status dueAt } }
         ${ERROR_FIELDS}
       }
     }`,
    {
      input: {
        channelId: channel.id,
        // addToQueue puts it in the channel's own posting schedule, which is
        // the schedule a person already set up in Buffer. Choosing a time here
        // would mean reimplementing that badly.
        mode: 'addToQueue',
        // automatic, not notification: a notification post has to be published
        // by hand from Buffer's phone app, and the point of approving here is
        // that the decision is already made.
        schedulingType: 'automatic',
        text,
        assets: [{ image: { url: assetUrl, metadata: { altText } } }],
        metadata: metadataFor(channel.service),
      },
    },
  );

  const payload = data.createPost;
  if (payload.__typename !== 'PostActionSuccess' || !payload.post) {
    throw new BufferError(payload.message ?? `Buffer refused the post (${payload.__typename})`);
  }
  return payload.post.id;
}

/* ── out ────────────────────────────────────────────────────────────── */

export async function loadQueue(): Promise<SocialQueue> {
  const [pending, recent, counts] = await Promise.all([
    query<QueueRow>(
      `SELECT ${COLUMNS} FROM social_queue WHERE state = 'pending' ORDER BY created_at ASC LIMIT 40`,
    ),
    query<QueueRow>(
      `SELECT ${COLUMNS} FROM social_queue WHERE state <> 'pending'
       ORDER BY COALESCE(posted_at, decided_at, created_at) DESC LIMIT 20`,
    ),
    query<{ state: SocialState; n: string }>(
      `SELECT state, COUNT(*)::TEXT AS n FROM social_queue GROUP BY state`,
    ),
  ]);

  const tally = { pending: 0, approved: 0, rejected: 0, posted: 0, error: 0 };
  for (const row of counts) tally[row.state] = Number(row.n);

  /*
   * Buffer is reached for the channel list and the queue depth, and a failure
   * there must not empty the panel: the stack, the counts and rejection all
   * work with Buffer unreachable or unconfigured. Only approving needs it.
   */
  const [channels, scheduled] = await Promise.all([
    listChannels().catch(() => [] as SocialChannel[]),
    scheduledUsage().catch(() => ({ used: 0, limit: null })),
  ]);

  return {
    pending: pending.map(candidate),
    recent: recent.map(candidate),
    channels,
    counts: tally,
    scheduled,
  };
}

/**
 * A decision, and the write that records it.
 *
 * Approving posts to every channel asked for and keeps going if one fails,
 * because Buffer takes one channel per `createPost` and a half-succeeded
 * approval is a real outcome: two of three channels have the post. The row ends
 * `posted` with whatever ids came back, or `error` with the message, and either
 * way `buffer_ids` says exactly which went. Retrying a partial failure is a
 * second approval for the channels that missed, not a repeat of all three.
 */
export async function decide(id: string, decision: SocialDecision): Promise<SocialCandidate> {
  const row = await queryOne<QueueRow>(
    `SELECT ${COLUMNS} FROM social_queue WHERE id = $1`,
    [id],
  );
  if (!row) throw new Error('No such candidate');

  if (decision.verdict === 'reject') {
    const updated = await queryOne<QueueRow>(
      `UPDATE social_queue SET state = 'rejected', decided_at = now()
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    return candidate(updated!);
  }

  if (!env.buffer) throw new Error('Buffer is not configured on this deployment.');
  if (row.state === 'posted') throw new Error('Already posted');

  const caption = decision.caption ?? row.caption;
  const channels = await listChannels();
  const targets = decision.channelIds
    .map((wanted) => channels.find((c) => c.id === wanted))
    .filter((c): c is SocialChannel => Boolean(c));
  if (!targets.length) throw new Error('None of those channels exist on this Buffer account');

  const connected = targets.filter((c) => !c.disconnected);
  if (!connected.length) throw new Error('Every channel chosen is disconnected in Buffer');

  const asset = candidate(row).assetUrl;
  // The alt text is the caption's first line: it is written for this image and
  // is better than anything derivable, and Instagram requires one.
  const altText = caption.split('\n')[0]!.slice(0, 280);

  const posted: string[] = [];
  const failures: string[] = [];
  for (const channel of connected) {
    try {
      posted.push(await createPost(channel, caption, asset, altText));
    } catch (error) {
      failures.push(`${channel.service}: ${(error as Error).message}`);
    }
  }

  const updated = await queryOne<QueueRow>(
    `UPDATE social_queue
        SET caption = $2,
            channel_ids = $3,
            buffer_ids = $4,
            state = $5,
            error = $6,
            decided_at = now(),
            posted_at = CASE WHEN $5 = 'posted' THEN now() ELSE NULL END
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [
      id,
      caption,
      connected.map((c) => c.id),
      posted,
      posted.length ? 'posted' : 'error',
      failures.length ? failures.join(' | ') : null,
    ],
  );
  return candidate(updated!);
}
