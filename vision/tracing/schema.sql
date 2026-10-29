-- Camera registry for person tracing (Postgres `raam` db, see DATABASE_URL).
-- One row per recorder, one row per recorder channel. Rebuilt from the
-- recorders themselves by seed_cameras.py; the human columns (name_he,
-- location, notes) are never overwritten by the seed.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS recorders (
  id          text PRIMARY KEY,            -- 'dvr-137', 'nvr-100'
  name        text NOT NULL,               -- as named in iVMS
  host        text NOT NULL,
  http_port   int  NOT NULL DEFAULT 80,
  model       text,
  -- env var prefix holding the login: <cred_env>_USER / <cred_env>_PASS
  cred_env    text NOT NULL DEFAULT 'HIK_DEFAULT',
  accessible  boolean NOT NULL DEFAULT false,  -- last seed could log in
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cameras (
  id           text PRIMARY KEY,           -- '<recorder>-ch<N>', e.g. 'nvr-100-ch5'
  recorder_id  text NOT NULL REFERENCES recorders(id),
  channel      int  NOT NULL,              -- 1-based; DVR IP channels start at 33
  kind         text NOT NULL CHECK (kind IN ('analog', 'ip')),
  device_name  text,                       -- the name stored on the recorder
  name_he      text,                       -- human name (Moti), wins in the UI
  location     text,                       -- floor / area (Moti)
  camera_ip    text,                       -- IP channels only
  live_id      text,                       -- matching id in the app's camera lists (gates.ts / fleet-cameras.ts)
  -- what the recorder holds, from the last seed's 24h search
  records      text CHECK (records IN ('motion', 'continuous', 'none')),
  hours_24h    real,
  gb_24h       real,
  active       boolean NOT NULL DEFAULT true,
  notes        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recorder_id, channel)
);

-- Areas of the building (parking, lobby, gym…), set by staff in the camera
-- management tab. A camera can sit in several groups.
CREATE TABLE IF NOT EXISTS camera_groups (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS camera_group_members (
  group_id   int  NOT NULL REFERENCES camera_groups(id) ON DELETE CASCADE,
  camera_id  text NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, camera_id)
);

-- One row per person seen in one sampled frame of a recording (index_window.py).
-- `embedding` is an appearance fingerprint (OSNet-AIN re-ID, 512-d, L2-normed):
-- the same person on another camera lands close in cosine distance.
CREATE TABLE IF NOT EXISTS sightings (
  id         bigserial PRIMARY KEY,
  camera_id  text NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  seen_at    timestamptz NOT NULL,
  bbox       int[] NOT NULL,          -- x1, y1, x2, y2 in the source frame
  score      real NOT NULL,           -- person-detector confidence
  crop_path  text NOT NULL,           -- relative to data/tracing/
  embedding  vector(512) NOT NULL,
  model      text NOT NULL,           -- re-ID weights that made the embedding
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sightings_camera_time ON sightings (camera_id, seen_at);
CREATE INDEX IF NOT EXISTS sightings_time ON sightings (seen_at);
CREATE INDEX IF NOT EXISTS sightings_embedding ON sightings USING hnsw (embedding vector_cosine_ops);

-- A track = one person's continuous presence on one camera: consecutive
-- sightings linked by look + position (tracks.py). Its embedding is the
-- normalized mean of its sightings — steadier than any single frame — so
-- tracing and "who was there" work on tracks, not frames.
CREATE TABLE IF NOT EXISTS tracks (
  id                bigserial PRIMARY KEY,
  camera_id         text NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  start_at          timestamptz NOT NULL,
  end_at            timestamptz NOT NULL,
  n                 int NOT NULL,          -- sightings in the track
  best_sighting_id  bigint,                -- clearest crop (largest, most confident)
  embedding         vector(512) NOT NULL,
  model             text NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_camera_time ON tracks (camera_id, start_at);
CREATE INDEX IF NOT EXISTS tracks_time ON tracks (start_at);

ALTER TABLE sightings ADD COLUMN IF NOT EXISTS track_id bigint REFERENCES tracks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sightings_track ON sightings (track_id);

-- Every search the camera chat runs: who asked, what was searched. Tracing
-- people is sensitive; this is the record that it was used for incidents.
CREATE TABLE IF NOT EXISTS trace_audit (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_name   text,
  session_id  text NOT NULL,
  tool        text NOT NULL,
  input       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS trace_audit_at ON trace_audit (at);
