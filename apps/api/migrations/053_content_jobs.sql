-- A batch of posts being written, as a row rather than as a loop in a browser.
--
-- Writing thirteen languages is thirteen model calls of about a minute each.
-- That loop lived in the admin panel: the page fired one request per language
-- and waited. Refresh the tab, close the laptop, lose the network for a moment
-- and the run stopped — the languages already written were safe, because each
-- is its own request, but the remaining ones simply never happened and nothing
-- on the screen said so.
--
-- So the loop moves to the server and its progress becomes a row. The panel
-- starts a job, polls it, and can be closed and reopened without the run
-- caring. `withJobLock(CONTENT_JOB)` keeps it to one at a time, which is what
-- the subscription lane wants anyway.
CREATE TABLE content_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES content_topics(id) ON DELETE CASCADE,

  -- What was asked for, and what has happened to each so far. Three arrays
  -- rather than a row per language: the whole job is read at once, always, and
  -- a join to render a progress bar is a join too many.
  locales     TEXT[] NOT NULL,
  done        TEXT[] NOT NULL DEFAULT '{}',
  failed      TEXT[] NOT NULL DEFAULT '{}',
  /** The one being written right now, so the panel can name it. */
  current     TEXT,

  status      TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'done', 'cancelled', 'failed')),
  /** Why it stopped early, when it did. Shown to the person who started it. */
  error       TEXT,

  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- There is only ever one running, but the panel asks for it on every poll and
-- on every page load, so the lookup should not scan.
CREATE INDEX content_jobs_running_idx ON content_jobs (started_at DESC)
  WHERE status = 'running';
