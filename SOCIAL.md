# Social

The admin panel's social queue: a rendered post, a decision, and Buffer.

Built 2026-09-23. `CONTENT_ENGINE.md` covers making content; this covers
deciding whether a particular piece of it goes out, and getting it there.

---

## 0. Why it exists

On 2026-09-23 Buffer's queue held **fourteen scheduled posts made of six unique
ones**. "Nobody weighs the toast" was scheduled three times — Instagram, X,
TikTok — and so were three others. Every asset was a cast poster from
`content/social/`, every one 1080×1350, which letterboxes on the two surfaces
that matter. One post was a carousel opener marked **01 / 05** whose other four
slides were never made.

None of that is a writing problem. The copy is good. There was simply no step
between rendering something and it being scheduled, so nothing was ever looked
at twice.

This is that step.

---

## 1. The shape

```
  post.mts            →  content/out/posts/*.png      (Mac, headless Chrome)
  Social panel        →  POST /admin/social           (file picker, browser)
  social_queue        →  pending
  approve             →  Buffer createPost            (one call per channel)
  Buffer              →  decides when, from the channel's own schedule
```

Four things this deliberately does not do:

- **It does not render.** `scripts/content/post.mts` composes images on a Mac
  with a headless Chrome. §1 of `CONTENT_ENGINE.md` keeps the assembly line
  there, and the API container has no browser and is not getting one for
  marketing images.
- **It does not pick a time.** Approving hands the post to the channel's Buffer
  posting schedule, already configured in Buffer. Choosing times here would mean
  reimplementing that badly.
- **It does not write copy with a model.** Beats come from
  `content/hooks/hooks.txt` and §10's recipe library, which are checked in and
  defensible against what the app actually does.
- **It does not hold image bytes in Postgres.** They go to the same object store
  as meal photos, or to `UPLOAD_DIR`; the row holds a key.

---

## 2. Uploading from the browser, not a CLI

`scripts/content/queue.mts` exists and does the renaming, the PNG-header read
and the batching — but **it cannot authenticate**. `/admin/*` is behind a
session plus `isAdmin`, and there is no API-token path. The alternatives were a
copied session cookie in a shell history, or handling a password in a script.

So the real upload path is the panel's **Add slides** picker, which already has
a session. `queue.mts` is kept for `--dry`, which lists what would go and which
keys have no written caption.

---

## 3. The asset URL

Served at **`/public/social/:id.png`**, and deliberately not presigned.

`storage.ts` signs reads for 300 seconds. Buffer fetches an approved post's
image *when it publishes*, which for a queued post is days later — a presigned
URL would be long expired. A marketing image has no session in it and no user
row behind it, so it satisfies `/public/`'s rule rather than bending it.

`BUFFER_PUBLIC_ORIGIN` therefore has to be a hostname Buffer can reach.
`localhost` is not a working configuration.

---

## 4. Configuration

All three together or none:

| Variable | What |
|---|---|
| `BUFFER_ACCESS_TOKEN` | from <https://publish.buffer.com/settings/api> |
| `BUFFER_ORGANIZATION_ID` | from `account.organizations` — `6aae4e59f6842c61dbd1f838` |
| `BUFFER_PUBLIC_ORIGIN` | e.g. `https://api.daysofar.com` |
| `BUFFER_API_URL` | optional, defaults to `https://graph.buffer.com` |

**With them unset the panel still works.** The stack renders, the counts are
right, and rejecting is fine. Only approving is refused, and the panel says why.
That is the honest failure for a marketing credential no other install of this
API should hold.

`BUFFER_API_URL` is overridable because it is the one part of the integration
not pinned by introspection. Everything else — `createPost(input:
CreatePostInput!): PostActionPayload!`, `AssetInput @oneOf { image }`,
`ShareMode`, `SchedulingType` — was read off Buffer's own schema on 2026-09-23
and is exact.

---

## 5. Two things about Buffer that bite

**The payload is a union.** `createPost` returns one success member and six
error members, and a refusal is an HTTP 200 with an error inside it. Every call
asks for `__typename`; treating the response as success is how a queue ends up
marking posts sent that never went anywhere.

**The scheduled-post ceiling is low and silent.** The free plan takes ten, and
the eleventh `createPost` comes back `LimitReachedError` — after the panel has
told somebody their approval worked. `loadQueue` reads the usage first so the
panel can say "Buffer's queue is full" and disable the button.

One channel per `createPost`, so approving to three channels is three calls. A
half-succeeded approval is a real outcome: the row ends `posted` with whichever
ids came back, or `error` with the messages, and `buffer_ids` says exactly which
went out. Retrying is a second approval for the channels that missed.

---

## 6. Per-service metadata

From Buffer's validation rules, not guessed:

- **Instagram** — requires `type` and `shouldShareToFeed`. Sent as `post` /
  `true`.
- **TikTok** — requires an asset, which every candidate has by construction.
- **X** — needs nothing.
- Anything else gets no metadata and will be refused by Buffer if it wanted
  some. That is the right way round: a guessed default posts something nobody
  chose.

---

## 7. Open

- **`CONTENT_ENGINE.md` §488 still rules out schedulers.** Its reason — that
  auto-publishing cannot attach a trending sound — holds for TikTok *video* and
  does not apply to a slideshow or a still, which is all this queue carries. The
  section wants a sentence saying so.
- **The 1080×1350 back catalogue.** `content/social/`'s twelve posters are the
  wrong aspect for TikTok and Reels. The queue records real dimensions so this
  is visible, but nothing stops an approval.
- **No analytics loop.** Buffer's `aggregatedPostMetrics` is right there, and
  §7's `content/posted.csv` wants filling from it. Without that this panel makes
  posting tidier without making it measurable, which was the original complaint
  about the whole channel.
- **Captions are placeholders on upload.** Every uploaded slide arrives as
  `TODO caption — <file>`, edited on the card. Fine for a handful; annoying at
  thirty.
