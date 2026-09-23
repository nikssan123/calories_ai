-- The social queue: a rendered post, a decision, and where it went.
--
-- Buffer has been the whole pipeline until now, and on 2026-09-23 its queue
-- held fourteen scheduled posts made of six unique ones — "Nobody weighs the
-- toast" three times across Instagram, Twitter and TikTok, and three others the
-- same. Every asset was a cast poster from `content/social/`, every one
-- 1080x1350, which letterboxes on the two surfaces that matter. There was no
-- step between rendering something and it being scheduled, so nothing was ever
-- looked at twice.
--
-- This table is that step. A row is one rendered image with its caption,
-- waiting for a yes or a no. Approving it is what calls Buffer; nothing reaches
-- a channel that a person did not look at first.
--
-- What it deliberately does NOT do:
--
--  * It does not render. `scripts/content/post.mts` does that on a Mac with a
--    headless Chrome, and §1 keeps the assembly line there. The API container
--    has no browser and is not getting one for marketing images.
--  * It does not generate copy with a model. The beats come from
--    `content/hooks/hooks.txt` and the §10 recipe library, which are checked in
--    and defensible against what the app actually does. `ai_usage` has enough
--    lanes.
--  * It does not hold the image. Bytes go to the same object store as meal
--    photos, or to UPLOAD_DIR; this holds the key.
--
-- The asset is served from `/public/social/:id.png` rather than a presigned
-- read, because a presign lasts 300 seconds and Buffer fetches the image when
-- it publishes — which for a scheduled post is days later. A marketing image
-- has no session in it and belongs in the one namespace app.ts documents as
-- read-only and user-free.
CREATE TABLE social_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The post.mts key that produced it, e.g. `10-three-ways-1`. Not unique: a
  -- re-render of the same key is a new candidate, and the old one keeps its
  -- decision so a rejection is not silently undone by running the script again.
  source_key    TEXT NOT NULL,

  -- What goes in the post body. Written next to the image, not derived from it.
  caption       TEXT NOT NULL,

  -- Where the bytes are, on whichever backend `services/storage.ts` resolved.
  asset_key     TEXT NOT NULL,
  media_type    TEXT NOT NULL DEFAULT 'image/png',
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,

  -- pending until somebody decides; posted once Buffer has taken it.
  state         TEXT NOT NULL DEFAULT 'pending'
                CHECK (state IN ('pending', 'approved', 'rejected', 'posted', 'error')),

  -- Which Buffer channels an approval is for. Buffer's own ids, so this table
  -- never has to know what a channel is.
  channel_ids   TEXT[] NOT NULL DEFAULT '{}',

  -- Buffer's id for the created post, and whatever it said if it refused.
  buffer_ids    TEXT[] NOT NULL DEFAULT '{}',
  error         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  posted_at     TIMESTAMPTZ
);

-- The panel's only query: the pending stack, oldest first, so the queue is a
-- queue and not a random pick.
CREATE INDEX social_queue_pending ON social_queue (created_at) WHERE state = 'pending';

-- And the audit read: what went out, most recent first.
CREATE INDEX social_queue_posted ON social_queue (posted_at DESC) WHERE state = 'posted';

COMMENT ON TABLE social_queue IS
  'rendered social posts awaiting a yes or no; approving calls Buffer — see services/social.ts';
COMMENT ON COLUMN social_queue.source_key IS
  'the post.mts key that rendered it; not unique, a re-render is a new candidate';
COMMENT ON COLUMN social_queue.asset_key IS
  'storage key, same backend as meal photos; served at /public/social/:id.png, never presigned';
COMMENT ON COLUMN social_queue.channel_ids IS
  'Buffer channel ids an approval targets; this table never models a channel itself';
