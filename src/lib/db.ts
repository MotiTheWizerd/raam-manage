import "server-only";

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "raam.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS zones (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS apartments (
  id         INTEGER PRIMARY KEY,
  number     TEXT NOT NULL UNIQUE,
  floor      INTEGER,
  zone_id    INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residents (
  id           INTEGER PRIMARY KEY,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  id_number    TEXT,
  po_box       TEXT,
  type         TEXT NOT NULL CHECK (type IN ('owner','renter')),
  move_in      TEXT,
  move_out     TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apartment_assets (
  id           INTEGER PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('parking','storage')),
  floor        INTEGER NOT NULL,
  number       TEXT NOT NULL,
  apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(type, floor, number)
);

CREATE INDEX IF NOT EXISTS idx_assets_apartment ON apartment_assets(apartment_id);

CREATE TABLE IF NOT EXISTS phones (
  id          INTEGER PRIMARY KEY,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  number      TEXT NOT NULL,
  label       TEXT,
  comment     TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_residents_apartment ON residents(apartment_id);
CREATE INDEX IF NOT EXISTS idx_residents_active    ON residents(apartment_id) WHERE move_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_phones_resident     ON phones(resident_id);

CREATE TABLE IF NOT EXISTS apartment_keys (
  id           INTEGER PRIMARY KEY,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  nickname     TEXT NOT NULL,
  is_default   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  is_in_lobby  INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apartment_keys_apartment ON apartment_keys(apartment_id);

CREATE TABLE IF NOT EXISTS apartment_keys_history (
  id               INTEGER PRIMARY KEY,
  apartment_key_id INTEGER NOT NULL REFERENCES apartment_keys(id) ON DELETE CASCADE,
  is_in_lobby      INTEGER NOT NULL,
  resident_id      INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  lobbyist_name    TEXT NOT NULL,
  comment          TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apartment_keys_history_key
  ON apartment_keys_history(apartment_key_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO user_preferences (id, data) VALUES (1, '{}');
`;

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
) {
  const cols = db
    .prepare(`SELECT name FROM pragma_table_info(?)`)
    .all(table) as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  // Idempotent column adds for schema evolution on existing DBs
  ensureColumn(db, "phones", "comment", "TEXT");
  ensureColumn(db, "apartment_keys", "is_default", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "apartment_keys", "is_active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "apartment_keys", "is_in_lobby", "INTEGER NOT NULL DEFAULT 1");

  return db;
}

declare global {
  // eslint-disable-next-line no-var
  var __raamDb: Database.Database | undefined;
}

export const db: Database.Database = globalThis.__raamDb ?? (globalThis.__raamDb = open());
