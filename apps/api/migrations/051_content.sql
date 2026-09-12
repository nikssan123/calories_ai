-- The blog: topics, and one post per topic per language.
--
-- The web half of this product is a landing page, three documents and ninety-
-- nine recipes it did not write. That is the whole indexable surface, and none
-- of it targets a query anybody types — SEO.md §3 has the grep: the landing
-- page does not contain the words "calorie tracker" anywhere on it.
--
-- Two tables rather than one, because the unit of work and the unit of
-- publication are different things. A *topic* is a subject decided once. A
-- *post* is one language's answer to it, written from that language's own
-- search results rather than translated from the English — see LANGUAGES.md.
-- "Калории в баница" is a real Bulgarian query with no English counterpart, and
-- a schema with a single `posts` table and a `translation_of` column would
-- quietly push every locale into being a copy of en.
--
-- Nothing here is published by writing it. `status` starts at 'draft' and only
-- a person moves it: this is a health-adjacent site with a nutrition claim in
-- most of what it will say, and an unreviewed one going live is the most
-- expensive mistake available to it.

CREATE TABLE content_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- An internal English label, for the admin list. Never rendered publicly:
  -- the reader sees each locale's own title, which is not a translation of it.
  name        TEXT NOT NULL,
  -- What the topic is about, in enough detail to brief a writer who has only
  -- this. Written once, in English, and handed to every locale.
  brief       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id     UUID NOT NULL REFERENCES content_topics(id) ON DELETE CASCADE,
  -- One of the thirteen the app speaks. Not a foreign key: the list lives in
  -- `LOCALES` in shared, and a table here would be a second copy to keep true.
  locale       TEXT NOT NULL,
  -- Worded in the locale's own language, so a Bulgarian post has a Bulgarian
  -- slug. Unique per locale rather than globally: two languages may legitimately
  -- arrive at the same string, and `/bg/blog/x` and `/de/blog/x` are different
  -- pages.
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  -- The meta description. Stored rather than derived from the body, because the
  -- first paragraph of an article and the sentence that earns a click in a
  -- result list are not the same sentence.
  description  TEXT NOT NULL,
  body_md      TEXT NOT NULL,
  -- The query this locale was actually written for, recorded so a human
  -- reviewer can see what it was aiming at before deciding whether it hit.
  keyword      TEXT NOT NULL,

  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'binned')),
  published_at TIMESTAMPTZ,

  -- Provenance. Which model wrote it and what that cost, so the ledger can say
  -- what the blog cost to produce — zero, on the subscription lane, which is
  -- the point of running it there.
  model        TEXT,
  cost_usd     NUMERIC(10, 6),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (locale, slug),
  -- One post per language per topic. A regeneration replaces rather than
  -- accumulates, or the blog grows thirteen near-identical pages a topic.
  UNIQUE (topic_id, locale)
);

-- The public read: published posts in one language, newest first. This is the
-- index page's query and the sitemap's, and it is the only one that runs on an
-- anonymous request.
CREATE INDEX content_posts_public_idx
  ON content_posts (locale, published_at DESC)
  WHERE status = 'published';

-- The admin read: everything for a topic, in locale order.
CREATE INDEX content_posts_topic_idx ON content_posts (topic_id, locale);
