#!/usr/bin/env node
// One-time authorisation. Walks the PKCE login, then writes .tokens.json.
//
//   node scripts/tiktok/auth.mjs
//
// Re-run it whenever the refresh token expires (365 days) or you change scopes.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { createInterface } from 'node:readline/promises'
import {
  AUTHORIZE_URL,
  TOKEN_URL,
  loadConfig,
  writeTokens,
  TOKENS_PATH,
} from './lib.mjs'

// What we ask for. `video.publish` is the one that posts straight to the
// profile and the one an unaudited client is NOT granted — asking for it
// anyway is harmless (TikTok grants the subset it will give you) and means the
// scripts start direct-posting the day the audit lands, with no re-auth.
const SCOPES = ['user.info.basic', 'video.upload', 'video.publish']

/**
 * TikTok deviates from RFC 7636 here: the spec says base64url of the SHA-256
 * digest, TikTok's documentation gives a hex-encoded digest and rejects the
 * base64url form. If authorisation fails complaining about the code challenge,
 * this constant is the single thing to flip.
 */
const CHALLENGE_ENCODING = 'hex'

const verifier = randomBytes(48).toString('hex') // 96 chars, inside the 43-128 range
const challenge = createHash('sha256').update(verifier).digest(CHALLENGE_ENCODING)
const state = randomBytes(16).toString('hex')

const config = loadConfig()

const authUrl = new URL(AUTHORIZE_URL)
authUrl.search = new URLSearchParams({
  client_key: config.clientKey,
  scope: SCOPES.join(','),
  response_type: 'code',
  redirect_uri: config.redirectUri,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString()

const redirect = new URL(config.redirectUri)
const isLoopback = ['localhost', '127.0.0.1'].includes(redirect.hostname)

console.log('\nOpen this URL and approve as @daysofarapp:\n')
console.log(authUrl.toString())
console.log()

const { code, returnedState } = isLoopback
  ? await catchRedirect(redirect)
  : await askForPastedUrl()

// Constant-time compare so a wrong state is not distinguishable by timing.
const a = Buffer.from(String(returnedState))
const b = Buffer.from(state)
if (a.length !== b.length || !timingSafeEqual(a, b)) {
  throw new Error('state mismatch — start over rather than trusting this code')
}

const res = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  }),
})
const body = await res.json()
if (!res.ok || body.error) {
  console.error('\nToken exchange failed:', JSON.stringify(body, null, 2))
  process.exit(1)
}

writeTokens({
  ...body,
  expires_at: Date.now() + body.expires_in * 1000,
  obtained_at: new Date().toISOString(),
})

console.log(`\nAuthorised. Tokens written to ${TOKENS_PATH}`)
console.log(`Granted scopes: ${body.scope}`)
if (!String(body.scope).includes('video.publish')) {
  console.log(
    '\nNote: video.publish was NOT granted, which is expected before the audit.\n' +
      'post.mjs will upload to your drafts and you finish in the TikTok app.',
  )
}

/** Serve the loopback redirect once and pull the code out of it. */
function catchRedirect(redirect) {
  const port = Number(redirect.port || 80)
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end('not the callback path')
        return
      }
      const code = url.searchParams.get('code')
      const err = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<title>Day So Far</title><body style="font:16px system-ui;padding:3rem">` +
          (code ? 'Authorised. You can close this tab.' : `Failed: ${err}`) +
          '</body>',
      )
      server.close()
      if (code) resolve({ code, returnedState: url.searchParams.get('state') })
      else reject(new Error(`authorisation refused: ${err}`))
    })
    server.on('error', reject)
    server.listen(port, () => console.log(`Waiting on ${redirect.origin}…`))
  })
}

/**
 * For an https redirect_uri that nothing is serving. The browser still lands
 * there with the code in the query string, so the address bar is the transport
 * — a 404 page carries the code just as well as a 200 one.
 */
async function askForPastedUrl() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Paste the full URL you were redirected to:\n> ')
  rl.close()
  const url = new URL(answer.trim())
  const code = url.searchParams.get('code')
  if (!code) throw new Error(`no ?code= in that URL (error=${url.searchParams.get('error')})`)
  return { code, returnedState: url.searchParams.get('state') }
}
