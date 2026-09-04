# Posting to TikTok from the command line

Two scripts over TikTok's Content Posting API. `auth.mjs` runs once to get a
token; `post.mjs` uploads a video. No dependencies — Node 24 and `fetch`.

```bash
node scripts/tiktok/auth.mjs                              # once
node scripts/tiktok/post.mjs content/out/haul-01.mp4      # per video
```

## 0. What this does and does not get you

**It uploads to your drafts.** You open TikTok, tap the draft, write the
caption, and post. That is the ceiling until TikTok audits the app.

Posting straight to the profile needs the `video.publish` scope, and TikTok only
grants it to clients that have passed their review. Solo developers frequently
do not clear it. `auth.mjs` asks for the scope anyway — TikTok grants whatever
subset it will give you, so the day an audit lands, `post.mjs --publish` starts
working with no re-authorisation.

So the honest value here is **the file transfer**, not the posting: no AirDrop,
no cable, no re-encoding on the phone. At three to five videos a day that is
worth having and is not worth building a queue around. See `CONTENT_ENGINE.md`
§7 for why manual posting is the right default regardless.

## 1. Register the app

1. Sign in at <https://developers.tiktok.com> **with the @daysofarapp account**,
   not a personal one. Whoever authorises is who the videos post as.
2. Create an app. Add the **Content Posting API** product, and **Login Kit**
   (Login Kit is what issues the token — Content Posting alone cannot authorise).
3. Under Content Posting API, turn on **Direct Post** if the toggle is offered.
   It is what `video.publish` hangs off; without the audit it stays inert, and
   requesting it costs nothing.
4. Copy the **Client key** and **Client secret** into `.env` (§2).
5. Add `https://daysofar.com` under the app's verified domains if you ever want
   `PULL_FROM_URL` uploads. Not needed for the file upload these scripts do.

**While unaudited, the app only works for accounts you have added as target
users.** Developer portal → your app → Manage → add @daysofarapp there, or every
call comes back with an authorisation error that does not say why.

## 1b. Sandbox is the environment you will actually use

TikTok will not save a Production app config until you attach a **demo video of
the integration working**, and its own instructions say an app that has never
been approved must record that demo *from a sandbox*. So Production is
chicken-and-egg by design, and the sandbox is not a lesser path — it is the
first one.

A sandbox has **its own client key and secret**, separate from Production. Those
are the two values that go in `.env` today. Everything in these scripts works
against them unchanged.

Set one up at Developer Portal -> your app -> **Sandbox** -> Create Sandbox
(clone from Draft), then configure it exactly like Production: icon, category,
description, terms and privacy URLs, platform Web with the site URL, Login Kit
with the redirect URI, and Content Posting API.

**A sandbox only works for accounts added under Sandbox settings -> Target
Users.** Add @daysofarapp there and authorise it; the connect button sends you
through a normal TikTok login. Without that, every call fails with an
authorisation error that does not explain itself.

What the sandbox does NOT change: drafts are still drafts. Direct Post inside a
sandbox is restricted to `SELF_ONLY`, so a direct post lands on the profile
visible to nobody but you — fine as a smoke test of that code path, useless as
distribution.

Moving to Production later means recording the demo video, filling the usage
description, and submitting for review. Nothing in these scripts changes; you
swap the two credentials in `.env`.

## 2. Environment

Three values in the repo-root `.env`:

```
TIKTOK_CLIENT_KEY=aw...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://daysofar.com/tiktok/callback
```

### The redirect URI is the fiddly part

TikTok matches `redirect_uri` byte for byte against what is registered, and it
generally refuses to register an `http://localhost` one. Two ways through:

- **Register an https URL on a domain you own** — `https://daysofar.com/tiktok/callback`
  is fine, **and nothing has to be serving it**. The browser lands there with
  `?code=…` in the query string; a 404 page carries the code just as well as a
  real one. `auth.mjs` notices a non-loopback URI and asks you to paste the URL
  out of the address bar.
- **Register a loopback URL if your app type allows it** — `http://127.0.0.1:8721/callback`.
  `auth.mjs` then serves that port itself and catches the code with no copying.

The script supports both and picks based on the hostname. Start with the first;
it always works.

## 2b. Moving this to another machine

Three things are needed and only the first is in git.

1. **The repo** — `git clone https://github.com/nikssan123/calories_ai.git`
2. **`.env`** — gitignored. Retype the three `TIKTOK_*` values by hand.
3. **`scripts/tiktok/.tokens.json`** — gitignored. **Do not copy it.** Run
   `node scripts/tiktok/auth.mjs` on the new machine instead.

Nothing else is required: these scripts have zero dependencies, so no `pnpm
install`, no build. Node 22+ and git is the whole toolchain. `ffprobe` is used
for the duration pre-check when present and skipped when not.

The redirect URI needs no change. It is an https URL nothing serves, and the
paste-back flow works from any machine — there is no local callback server to
re-point.

### Run it from ONE machine

Not a style preference — a correctness rule. Every token refresh returns a new
refresh token and **invalidates the previous one**. Two machines holding copies
of `.tokens.json` will fight: whichever refreshes second finds its token already
retired, and you get an opaque auth failure days later with nothing in the logs
explaining it.

So pick the machine that generates the content and post from there. If you need
to move, delete `.tokens.json` on the old machine and re-run `auth.mjs` on the
new one.

### On Windows

`lib.mjs` writes `.tokens.json` with mode `0600`. On NTFS that call succeeds but
buys you almost nothing — it does not produce the "owner only" ACL it does on a
Mac. The file still authorises posting as @daysofarapp for a year, so keep it
off shared drives and out of anything that syncs to a cloud folder.

## 3. Usage

```bash
# Upload to drafts, then finish in the app.
node scripts/tiktok/post.mjs content/out/haul-01.mp4

# Post directly. Silently falls back to drafts if video.publish was not granted.
node scripts/tiktok/post.mjs clip.mp4 --title "I scanned my whole grocery haul" --publish

# Direct post with an explicit privacy level.
node scripts/tiktok/post.mjs clip.mp4 --publish --privacy PUBLIC_TO_EVERYONE
```

`post.mjs` queries `creator_info` first — that call is mandatory before every
post, and it is also the only authoritative source for which privacy levels the
account may use and how long a video it accepts. A clip over the duration limit
is refused before the upload rather than after it, and `ffprobe` is used for that
check when it is on PATH.

## 4. Things that will bite you

**`.tokens.json` is a credential.** It holds a refresh token that can post as
@daysofarapp for a year. It is gitignored and written `0600`. Do not move it
somewhere backed up in the clear.

**Every refresh invalidates the previous refresh token.** `lib.mjs` writes the
new pair back to disk on each refresh. If you copy the token file between
machines and use both, whichever refreshed last wins and the other is dead.

**TikTok returns HTTP 200 for business failures.** The real outcome is in
`error.code`, which is the literal string `"ok"` on success. `api()` in
`lib.mjs` checks it; anything you add must too, or "unaudited client may not do
that" reads as a successful post.

**Chunking is not free-form.** Chunks are 5–64 MB, at most 1000, the last one
absorbs the remainder, and `total_chunk_count` is therefore a `floor()` — a
26 MB file at a 10 MB chunk is *two* chunks (10 + 16), not three. `planChunks`
handles it; the edge that bites is a 5–10 MB file, where a naive floor gives
zero chunks and the upload sends nothing.

**A 2xx on the upload only means TikTok has the bytes.** It can still reject the
video while processing, and the reason appears only in the status poll — which
is why `post.mjs` waits rather than exiting after the last chunk.

**PKCE, TikTok's way.** The spec says base64url of the SHA-256 digest; TikTok's
documentation gives hex and rejects the other. `CHALLENGE_ENCODING` at the top
of `auth.mjs` is the one line to flip if authorisation fails complaining about
the code challenge.

**A granted `video.publish` does not mean you can direct post.** Everything
that would tell you otherwise comes back clean: `auth.mjs` reports
`video.publish` in the granted scopes, and `creator_info` lists `SELF_ONLY`
among `privacy_level_options`, so `post.mjs` takes the direct-post branch. The
init call then fails with:

```
unaudited_client_can_only_post_to_private_accounts
```

The gate is neither the scope nor the privacy level — it is the **account's own
privacy setting**. An unaudited client may only direct post into an account
that is set to private, and @daysofarapp is public, so no value of `--privacy`
gets past it. Drop `--publish` and finish the post in the app, or make the
account private first. This is separate from the audit gate in §0: passing the
audit is what removes the restriction, but until then a public account cannot
be direct-posted to at all.

**`process.loadEnvFile` needs Node 20.12+.** Older runtimes do not have the
function, and the missing `.env` looks exactly like a missing credential —
`Missing TIKTOK_CLIENT_KEY, ... in .env` while the file sits there fully
populated. `lib.mjs` now falls back to its own parser, so this only bites on a
checkout older than that fix. `package.json` asks for Node 22+ regardless.
