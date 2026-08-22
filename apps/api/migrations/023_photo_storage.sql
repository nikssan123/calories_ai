-- Meal photos can live in a bucket instead of on the container's disk.
--
-- `storage_key` is the discriminator as well as the address: null means this
-- row's bytes are the file at `file_path`, non-null means they are the object
-- at that key. No enum column, because a separate flag can disagree with the
-- thing it describes and this cannot.
--
-- Nothing is backfilled and nothing needs to be. A deployment that turns the
-- bucket on keeps reading its old photos off the volume for as long as they
-- exist; only new ones go to the bucket. That is what makes this switchable
-- rather than a migration with a cutover.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS storage_key TEXT;

-- `file_path` becomes optional, because a photo in the bucket has no path.
-- Safe to roll code back over: the previous version only ever reads this column
-- for rows it wrote itself, and every one of those still has its path.
ALTER TABLE photos ALTER COLUMN file_path DROP NOT NULL;
