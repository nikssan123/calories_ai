-- Single-user app, but every row carries user_id so multi-user is a config change
-- rather than a migration. Exactly one row is seeded into users.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name      TEXT,
  sex               TEXT CHECK (sex IN ('male','female')),
  birth_date        DATE,
  height_cm         NUMERIC(5,1),
  target_weight_kg  NUMERIC(5,2),
  activity_level    TEXT CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  goal              TEXT CHECK (goal IN ('lose','maintain','gain')),
  timezone          TEXT NOT NULL DEFAULT 'Europe/Sofia',
  -- Hour at which a new day begins. 4 => food eaten at 1am counts as yesterday.
  day_start_hour    SMALLINT NOT NULL DEFAULT 4 CHECK (day_start_hour BETWEEN 0 AND 12),
  is_setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Targets are versioned rather than overwritten so adaptive targets (§11) can
-- reason about what the target was on a given day.
CREATE TABLE targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  kcal           INTEGER NOT NULL,
  protein_g      INTEGER NOT NULL,
  carbs_g        INTEGER NOT NULL,
  fat_g          INTEGER NOT NULL,
  is_custom      BOOLEAN NOT NULL DEFAULT FALSE,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX targets_lookup ON targets (user_id, effective_from DESC);

CREATE TABLE photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type  TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  byte_size   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE food_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal        TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','dinner','snack')),
  eaten_at    TIMESTAMPTZ NOT NULL,
  -- Denormalised so "today" is one indexed equality check, not a timezone join.
  local_date  DATE NOT NULL,
  description TEXT NOT NULL,
  note        TEXT,
  confidence  TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  source      TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text','photo','quick','manual')),
  photo_id    UUID REFERENCES photos(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX food_entries_day ON food_entries (user_id, local_date);

-- Item-level rows are what make corrections cheap: "there was more rice" updates
-- one row and the entry total is recomputed, rather than appending a new entry.
CREATE TABLE food_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES food_entries(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  quantity_g    NUMERIC(8,1),
  quantity_desc TEXT,
  kcal          NUMERIC(8,1) NOT NULL DEFAULT 0,
  protein_g     NUMERIC(7,1) NOT NULL DEFAULT 0,
  carbs_g       NUMERIC(7,1) NOT NULL DEFAULT 0,
  fat_g         NUMERIC(7,1) NOT NULL DEFAULT 0,
  position      SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX food_items_entry ON food_items (entry_id, position);

CREATE TABLE exercise_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL,
  local_date   DATE NOT NULL,
  duration_min NUMERIC(6,1),
  kcal_burned  NUMERIC(7,1) NOT NULL DEFAULT 0,
  confidence   TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  source       TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text','photo','quick','manual')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX exercise_entries_day ON exercise_entries (user_id, local_date);

CREATE TABLE weight_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL,
  local_date  DATE NOT NULL,
  weight_kg   NUMERIC(5,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One weigh-in per day; a second overwrites the first.
  UNIQUE (user_id, local_date)
);

-- The conversation is a VIEW over the data above, not the source of truth.
-- Deleting a message never deletes a meal.
CREATE TABLE chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  photo_id   UUID REFERENCES photos(id) ON DELETE SET NULL,
  -- Raw tool-call transcript, kept for debugging estimates after the fact.
  tool_trace JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_recent ON chat_messages (user_id, created_at DESC);

INSERT INTO users (display_name, is_setup_complete) VALUES (NULL, FALSE);
