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
