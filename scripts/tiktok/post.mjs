#!/usr/bin/env node
// Upload one video to TikTok.
//
//   node scripts/tiktok/post.mjs content/out/haul-01.mp4 --title "..."
//   node scripts/tiktok/post.mjs clip.mp4 --title "..." --publish
//
// Without --publish (and before the audit, with it too) the video lands in your
// TikTok drafts and you finish posting in the app. That is not a bug in this
// script: `video.publish` is only granted to audited clients.

import { spawnSync } from 'node:child_process'
import { openSync, readSync, closeSync, statSync, existsSync } from 'node:fs'
import { accessToken, api, loadConfig, planChunks, chunkRange, readTokens } from './lib.mjs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const wantsPublish = args.includes('--publish')
const title = flag('title', '')

if (!file || !existsSync(file)) {
  console.error('Usage: node scripts/tiktok/post.mjs <video.mp4> [--title "..."] [--publish]')
  process.exit(1)
}

const config = loadConfig()
const token = await accessToken(config)
const granted = String(readTokens().scope || '')

// 1. Creator info. TikTok requires this call before every post — it is also the
//    only authoritative source for which privacy levels this account may use.
const creator = await api('/v2/post/publish/creator_info/query/', token)
console.log(`Posting as @${creator.creator_username}`)

const videoSize = statSync(file).size
const duration = probeDuration(file)
if (duration && creator.max_video_post_duration_sec && duration > creator.max_video_post_duration_sec) {
  console.error(
    `Video is ${Math.round(duration)}s; this account's ceiling is ` +
      `${creator.max_video_post_duration_sec}s. TikTok would reject it after the whole upload.`,
  )
  process.exit(1)
}

const directPost = wantsPublish && granted.includes('video.publish')
if (wantsPublish && !directPost) {
  console.log('--publish ignored: video.publish is not granted. Uploading to drafts instead.')
}

const { chunkSize, totalChunkCount } = planChunks(videoSize)
const source_info = {
  source: 'FILE_UPLOAD',
  video_size: videoSize,
  chunk_size: chunkSize,
  total_chunk_count: totalChunkCount,
}

// 2. Init. Two different endpoints, and the draft one takes no post_info at all
//    — the caption is written by you in the app when you finish the post.
let init
if (directPost) {
  const privacy = flag('privacy', creator.privacy_level_options?.[0] ?? 'SELF_ONLY')
  if (!creator.privacy_level_options?.includes(privacy)) {
    console.error(
      `privacy_level ${privacy} not available. This account allows: ` +
        `${creator.privacy_level_options?.join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`Direct post, privacy ${privacy}`)
  init = await api('/v2/post/publish/video/init/', token, {
    post_info: {
      title,
      privacy_level: privacy,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info,
  })
} else {
  console.log('Uploading to drafts')
  init = await api('/v2/post/publish/inbox/video/init/', token, { source_info })
}

// 3. Upload. One PUT per chunk, each carrying the byte range it covers.
const fd = openSync(file, 'r')
try {
  for (let i = 0; i < totalChunkCount; i++) {
    const { start, end } = chunkRange(i, chunkSize, totalChunkCount, videoSize)
    const length = end - start + 1
    const buf = Buffer.allocUnsafe(length)
    readSync(fd, buf, 0, length, start)

    const res = await fetch(init.upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(length),
        'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      },
      body: buf,
    })
    if (!res.ok) {
      throw new Error(`chunk ${i + 1}/${totalChunkCount} failed: ${res.status} ${await res.text()}`)
    }
    console.log(`  chunk ${i + 1}/${totalChunkCount} (${mb(length)} MB)`)
  }
} finally {
  closeSync(fd)
}

// 4. Poll. The upload returning 2xx only means TikTok has the bytes; it can
//    still reject the video during processing, and the reason only appears here.
console.log('Uploaded. Waiting for TikTok to process it…')
const deadline = Date.now() + 5 * 60_000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 3000))
  const s = await api('/v2/post/publish/status/fetch/', token, { publish_id: init.publish_id })
  if (s.status === 'PROCESSING_UPLOAD' || s.status === 'PROCESSING_DOWNLOAD') continue
  if (s.status === 'FAILED') {
    console.error(`Rejected: ${s.fail_reason ?? 'no reason given'}`)
    process.exit(1)
  }
  console.log(`Status: ${s.status}`)
  console.log(
    directPost
      ? 'Posted.'
      : 'In your drafts — open TikTok, Profile, then the drafts row, to finish it.',
  )
  process.exit(0)
}
console.error(`Still processing after 5 minutes. publish_id ${init.publish_id}`)
process.exit(1)

function mb(n) {
  return (n / 1024 / 1024).toFixed(1)
}

/** Seconds, or null when ffprobe is not installed. Cheap insurance against a
 *  long upload that was always going to be refused. */
function probeDuration(path) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return null
  const d = Number.parseFloat(r.stdout.trim())
  return Number.isFinite(d) ? d : null
}
