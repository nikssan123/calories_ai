// Shared plumbing for the TikTok Content Posting API: config, the token file,
// and the one request helper that knows how TikTok reports failure.
//
// No dependencies. Node 24 has fetch, and `process.loadEnvFile` reads the same
// `.env` everything else in this repo reads.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

export const TOKENS_PATH = join(HERE, '.tokens.json')

export const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
export const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
export const API = 'https://open.tiktokapis.com'

/**
 * TikTok's chunk rules, which are not negotiable and are the thing most likely
 * to make an upload fail with an unhelpful message:
 *
 *   - a chunk is at least 5 MB and at most 64 MB
 *   - at most 1000 chunks
 *   - a video under 5 MB is ONE chunk whose size is the whole file
 *   - the final chunk absorbs the remainder, so it can exceed CHUNK_MAX
 *
 * That last rule is why total_chunk_count is a floor() and not a ceil(): a
 * 26 MB file at a 10 MB chunk is *two* chunks (10 + 16), not three.
 */
export const CHUNK_MIN = 5 * 1024 * 1024
export const CHUNK_MAX = 64 * 1024 * 1024
export const CHUNK_TARGET = 10 * 1024 * 1024

export function planChunks(videoSize) {
  if (videoSize <= 0) throw new Error('empty video file')
  if (videoSize < CHUNK_MIN) {
    return { chunkSize: videoSize, totalChunkCount: 1 }
  }
  // Never let the chunk exceed the file: a 6 MB video against a 10 MB chunk
  // floors to ZERO chunks, and an upload of nothing is what TikTok is then
  // asked to wait for.
  let chunkSize = Math.min(CHUNK_TARGET, videoSize)
  let totalChunkCount = Math.floor(videoSize / chunkSize)
  if (totalChunkCount > 1000) {
    // Grow the chunk until it fits inside the 1000-chunk ceiling.
    chunkSize = Math.ceil(videoSize / 1000)
    if (chunkSize > CHUNK_MAX) throw new Error('video too large for a 1000-chunk upload')
    totalChunkCount = Math.floor(videoSize / chunkSize)
  }
  // With one chunk, declare it as the whole file rather than a smaller size the
  // remainder rule then has to stretch. Same upload, nothing left implicit.
  if (totalChunkCount === 1) chunkSize = videoSize
  return { chunkSize, totalChunkCount }
}

/** Byte range for chunk `i`, with the last one absorbing the remainder. */
export function chunkRange(i, chunkSize, totalChunkCount, videoSize) {
  const start = i * chunkSize
  const end = i === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1
  return { start, end }
}

export function loadConfig() {
  try {
    process.loadEnvFile(join(ROOT, '.env'))
  } catch {
    // No .env is fine — the values may already be in the environment.
  }
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const redirectUri = process.env.TIKTOK_REDIRECT_URI
  const missing = [
    !clientKey && 'TIKTOK_CLIENT_KEY',
    !clientSecret && 'TIKTOK_CLIENT_SECRET',
    !redirectUri && 'TIKTOK_REDIRECT_URI',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(', ')} in .env — see scripts/tiktok/README.md §1.`,
    )
  }
  return { clientKey, clientSecret, redirectUri }
}

export function readTokens() {
  if (!existsSync(TOKENS_PATH)) {
    throw new Error('Not authorised yet. Run: node scripts/tiktok/auth.mjs')
  }
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'))
}

export function writeTokens(t) {
  writeFileSync(TOKENS_PATH, JSON.stringify(t, null, 2) + '\n')
  // The refresh token is a long-lived credential for posting as this account.
  chmodSync(TOKENS_PATH, 0o600)
}

/**
 * An access token good for at least another minute, refreshing if not.
 *
 * The access token lasts 24h and the refresh token 365 days, but every refresh
 * ALSO returns a new refresh token and invalidates the old one — so the write
 * back to disk is not optional bookkeeping. Skip it once and the next run is
 * holding a refresh token TikTok has already retired.
 */
export async function accessToken(config) {
  const t = readTokens()
  if (t.expires_at && t.expires_at - Date.now() > 60_000) return t.access_token

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
    }),
  })
  const body = await res.json()
  if (!res.ok || body.error) {
    throw new Error(
      `Token refresh failed: ${body.error ?? res.status} ${body.error_description ?? ''}`.trim(),
    )
  }
  const next = {
    ...body,
    expires_at: Date.now() + body.expires_in * 1000,
    obtained_at: new Date().toISOString(),
  }
  writeTokens(next)
  return next.access_token
}

/**
 * POST JSON to the Content Posting API.
 *
 * TikTok answers 200 for business failures, putting the real outcome in
 * `error.code` — which is the string "ok" on success, not an absent field. So
 * checking res.ok alone silently treats "unaudited client may not do that" as a
 * successful post.
 */
export async function api(path, token, body = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  const code = json?.error?.code
  if (!res.ok || (code && code !== 'ok')) {
    const msg = json?.error?.message || res.statusText
    const logId = json?.error?.log_id ? ` (log_id ${json.error.log_id})` : ''
    throw new Error(`${path} -> ${code || res.status}: ${msg}${logId}`)
  }
  return json.data
}
