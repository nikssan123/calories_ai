import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  SocialCandidate,
  SocialChannel,
  SocialDecision,
  SocialGroup,
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

/**
 * The bytes are an image, and the dimensions are the image's own.
 *
 * Both callers already check — the panel reads the PNG header before uploading
 * and `queue.mts` does the same — and neither is the reason this is here. A
 * one-off loader run against production on 2026-09-23 read a directory that
 * macOS `tar` had seeded with AppleDouble `._*` companion files, took the
 * dimensions from whatever was at those byte offsets, and inserted 24 rows
 * whose asset was a resource fork. Nothing rejected them, because nothing here
 * looked.
 *
 * Checking the claimed size against the header rather than just trusting it
 * matters for the same reason the queue records dimensions at all: a 1080x1350
 * slide reaching TikTok is the mistake this panel exists to catch, and a caller
 * that can assert its own dimensions can assert its way past that.
 */
function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24) return null;
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  // IHDR must be the first chunk, so its type sits at 12 and its data at 16.
  if (bytes.readUInt32BE(12) !== 0x49484452) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function addCandidate(upload: SocialUpload): Promise<SocialCandidate> {
  const bytes = Buffer.from(upload.bytes, 'base64');

  if (upload.mediaType === 'image/png') {
    const real = pngDimensions(bytes);
    if (!real) throw new Error('Those bytes are not a PNG');
    if (real.width !== upload.width || real.height !== upload.height) {
      throw new Error(
        `Dimensions do not match the image: claimed ${upload.width}x${upload.height}, ` +
          `the PNG is ${real.width}x${real.height}`,
      );
    }
  }

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
        /*
         * `scheduled` alone, and this is not tidiness.
         *
         * Asking for `['scheduled', 'needs_approval']` returns an empty list —
         * not an error, and not the scheduled posts either. `needs_approval`
         * poisons the array: on its own it returns 0, and combined with
         * `scheduled` it takes the 16 real results down with it, while
         * `['scheduled', 'draft']` returns 17 quite happily. Buffer's approval
         * workflow is presumably not on this plan and the backend answers with
         * nothing rather than saying so.
         *
         * The symptom was a panel reporting 0 of 10 scheduled posts while
         * Buffer held sixteen. Drafts are excluded deliberately — they are not
         * scheduled and do not count against the ceiling.
         */
        filter: { status: ['scheduled'] },
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
  assetUrls: string[],
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
        /*
         * Every slide, in carousel order — this is what makes a slideshow one
         * swipeable post rather than N posts of one image each. `AssetInput` is
         * `@oneOf`, so each entry carries exactly the `image` member.
         *
         * The alt text is shared across the slides. Per-slide alt would be
         * better and the beats are right there to build it from, but the shape
         * of that is a decision about accessibility copy, not plumbing, and a
         * caption's first line on every slide is honest rather than wrong.
         */
        assets: assetUrls.map((url) => ({ image: { url, metadata: { altText } } })),
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

/**
 * The group key and the slide's place in it, from the source key.
 *
 * `10-three-ways-2` is slide 2 of `10-three-ways`. A key with no trailing index
 * is its own group of one, which is what a single poster uploaded by hand is.
 */
function split(sourceKey: string): { key: string; index: number } {
  const m = /^(.*)-(\d+)$/.exec(sourceKey);
  return m ? { key: m[1]!, index: Number(m[2]) } : { key: sourceKey, index: 0 };
}

/**
 * Rows into groups, slides in carousel order.
 *
 * A group takes its caption, state and Buffer ids from its cover — slide 0 — so
 * that the group is decided as one thing. That is also why `decide` writes the
 * same values to every row in the group: the rows are storage, and leaving them
 * to disagree about whether the carousel went out would make the audit list
 * lie.
 */
function group(rows: QueueRow[]): SocialGroup[] {
  const byKey = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const { key } = split(row.source_key);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  const groups: SocialGroup[] = [];
  for (const [key, bucket] of byKey) {
    bucket.sort((a, b) => split(a.source_key).index - split(b.source_key).index);
    const cover = bucket[0]!;
    groups.push({
      key,
      caption: cover.caption,
      slides: bucket.map((row) => {
        const c = candidate(row);
        return {
          id: row.id,
          index: split(row.source_key).index,
          assetUrl: c.assetUrl,
          width: row.width,
          height: row.height,
        };
      }),
      state: cover.state,
      channelIds: cover.channel_ids,
      bufferIds: cover.buffer_ids,
      error: cover.error,
      createdAt: cover.created_at.toISOString(),
    });
  }
  // Oldest group first, by its cover, so the stack is a queue.
  groups.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return groups;
}

/**
 * How many hashtags each service gets.
 *
 * Not a style preference. Instagram and TikTok treat tags as topic signals and
 * a handful of relevant ones helps discovery; X spends 280 characters on
 * everything, so a tag there costs a clause. The old queue carried six on every
 * post including `#consistencyoverperfection`, which nobody searches — the
 * limit is the cheap way to stop that returning.
 *
 * Zero means the service gets none at all.
 */
const HASHTAG_LIMITS: Record<string, number> = {
  instagram: 5,
  tiktok: 4,
  twitter: 2,
  youtube: 3,
  linkedin: 3,
  facebook: 2,
};

/**
 * How many images one post on each service can carry.
 *
 * Checked here rather than left to Buffer because Buffer's refusal arrives as
 * a `RestProxyError` with the platform's own wording, recorded against the row
 * hours after anybody looked at it. The slideshows in the queue are all four
 * slides, which is exactly X's ceiling — so the first five-slide carousel would
 * have posted cleanly to Instagram and TikTok and failed on X alone, which is
 * the most confusing possible version of this.
 *
 * Instagram's real ceiling is 10 and its floor is 2; a single image is an
 * ordinary post and not a carousel, which Buffer handles either way.
 */
const MAX_ASSETS: Record<string, number> = {
  instagram: 10,
  tiktok: 35,
  twitter: 4,
  facebook: 10,
  linkedin: 9,
  threads: 10,
  bluesky: 4,
  mastodon: 4,
};

function withHashtags(caption: string, tags: string[], service: string): string {
  const limit = HASHTAG_LIMITS[service] ?? 3;
  if (!tags.length || limit === 0) return caption;
  // Deduplicated case-insensitively: the panel offers a suggested set and a
  // free-text field, and "Fibre" beside "fibre" is the obvious way to get two
  // of the same tag on one post.
  const seen = new Set<string>();
  const chosen: string[] = [];
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    chosen.push(tag);
    if (chosen.length === limit) break;
  }
  return `${caption}\n\n${chosen.map((t) => `#${t}`).join(' ')}`;
}

export async function loadQueue(): Promise<SocialQueue> {
  const [pending, recent, counts] = await Promise.all([
    // No LIMIT: a limit here would truncate a carousel mid-group and the panel
    // would offer a three-slide decision on a four-slide slideshow. The table
    // holds tens of rows, not millions.
    query<QueueRow>(
      `SELECT ${COLUMNS} FROM social_queue WHERE state = 'pending' ORDER BY created_at ASC`,
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
    pending: group(pending),
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
export async function decide(groupKey: string, decision: SocialDecision): Promise<SocialGroup> {
  /*
   * Matched by prefix rather than by id, because the decision is about the
   * carousel. `LIKE key || '-%'` catches the slides and `= key` catches a
   * single poster that has no index, and the ORDER BY is the carousel's order.
   */
  const rows = await query<QueueRow>(
    `SELECT ${COLUMNS} FROM social_queue
      WHERE source_key = $1 OR source_key LIKE $1 || '-%'
      ORDER BY source_key ASC`,
    [groupKey],
  );
  if (!rows.length) throw new Error('No such slideshow');

  const ordered = [...rows].sort(
    (a, b) => split(a.source_key).index - split(b.source_key).index,
  );
  const ids = ordered.map((r) => r.id);
  const cover = ordered[0]!;

  if (decision.verdict === 'reject') {
    await query(
      `UPDATE social_queue SET state = 'rejected', decided_at = now() WHERE id = ANY($1)`,
      [ids],
    );
    return (await loadGroup(groupKey))!;
  }

  if (!env.buffer) throw new Error('Buffer is not configured on this deployment.');
  /*
   * A clean success is final; a partial one is not.
   *
   * SOCIAL.md said "retrying is a second approval for the channels that
   * missed", and this line made that impossible: two of three channels
   * succeeding leaves the group `posted`, so the retry for the third was
   * refused as "Already posted". Approving three channels and being able to
   * reach only two, for good, is the wrong end state for the one failure mode
   * Buffer makes most likely — a channel needing reconnection.
   *
   * So the block applies only when nothing failed. On a retry the caller is
   * expected to untick the channels that already went: `buffer_ids` holds post
   * ids and not channel ids, so nothing here can work out which those were —
   * which is a real limitation and the reason the panel shows `channelIds` and
   * the error side by side.
   */
  if (cover.state === 'posted' && !cover.error) throw new Error('Already posted');

  const caption = decision.caption ?? cover.caption;
  const channels = await listChannels();
  const targets = decision.channelIds
    .map((wanted) => channels.find((c) => c.id === wanted))
    .filter((c): c is SocialChannel => Boolean(c));
  if (!targets.length) throw new Error('None of those channels exist on this Buffer account');

  const connected = targets.filter((c) => !c.disconnected);
  if (!connected.length) throw new Error('Every channel chosen is disconnected in Buffer');

  // Every slide, cover first. This is the carousel.
  const assetUrls = ordered.map((row) => candidate(row).assetUrl);
  // The alt text is the caption's first line: written for this post, and better
  // than anything derivable. Instagram requires one.
  const altText = caption.split('\n')[0]!.slice(0, 280);

  const posted: string[] = [];
  const failures: string[] = [];
  for (const channel of connected) {
    const ceiling = MAX_ASSETS[channel.service];
    if (ceiling !== undefined && assetUrls.length > ceiling) {
      failures.push(
        `${channel.service}: ${assetUrls.length} slides is more than the ${ceiling} ` +
          `one post there can carry — split the slideshow or untick this channel`,
      );
      continue;
    }
    try {
      const text = withHashtags(caption, decision.hashtags ?? [], channel.service);
      posted.push(await createPost(channel, text, assetUrls, altText));
    } catch (error) {
      failures.push(`${channel.service}: ${(error as Error).message}`);
    }
  }

  /*
   * Written to every row in the group, not just the cover. The rows are
   * storage; letting them disagree about whether the carousel went out would
   * make the audit list lie, and a partial retry would have no way to tell
   * which slides were part of the post that failed.
   */
  await query(
    `UPDATE social_queue
        SET caption = CASE WHEN id = $2 THEN $3 ELSE caption END,
            channel_ids = $4,
            buffer_ids = $5,
            state = $6,
            error = $7,
            decided_at = now(),
            posted_at = CASE WHEN $6 = 'posted' THEN now() ELSE NULL END
      WHERE id = ANY($1)`,
    [
      ids,
      cover.id,
      caption,
      connected.map((c) => c.id),
      posted,
      posted.length ? 'posted' : 'error',
      failures.length ? failures.join(' | ') : null,
    ],
  );
  return (await loadGroup(groupKey))!;
}

/** One group by key, for returning the result of a decision. */
async function loadGroup(groupKey: string): Promise<SocialGroup | null> {
  const rows = await query<QueueRow>(
    `SELECT ${COLUMNS} FROM social_queue
      WHERE source_key = $1 OR source_key LIKE $1 || '-%'`,
    [groupKey],
  );
  return rows.length ? (group(rows)[0] ?? null) : null;
}
