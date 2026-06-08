import "server-only";

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "raam.db");
const SCHEMA_EVOLUTION_VERSION = 10;

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
  keys_comment TEXT,
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
  comment          TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apartment_keys_history_key
  ON apartment_keys_history(apartment_key_id);

CREATE TABLE IF NOT EXISTS apartment_vehicles (
  id            INTEGER PRIMARY KEY,
  apartment_id  INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  license_plate TEXT NOT NULL,
  color         TEXT,
  model         TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apartment_vehicles_apartment
  ON apartment_vehicles(apartment_id);

CREATE TABLE IF NOT EXISTS guest_parking (
  id            INTEGER PRIMARY KEY,
  resident_id   INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  car_plate     TEXT NOT NULL,
  guest_name    TEXT NOT NULL DEFAULT '',
  lobbyist_name TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guest_parking_resident
  ON guest_parking(resident_id);

CREATE TABLE IF NOT EXISTS system_messages (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  start_at   TEXT NOT NULL,
  end_at     TEXT NOT NULL,
  priority   TEXT NOT NULL DEFAULT 'med'
               CHECK (priority IN ('low', 'med', 'high')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_messages_window
  ON system_messages(start_at, end_at);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  lobbyist_name TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
  id              INTEGER PRIMARY KEY,
  resident_id     INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  recipient_name  TEXT,
  type            TEXT NOT NULL DEFAULT 'package'
                    CHECK (type IN ('package', 'envelope', 'laundry')),
  direction       TEXT NOT NULL DEFAULT 'in'
                    CHECK (direction IN ('in', 'out')),
  delivered_by    TEXT NOT NULL DEFAULT 'שליח',
  received_by     TEXT NOT NULL DEFAULT '',
  delivered_to    TEXT,
  is_delivered    INTEGER NOT NULL DEFAULT 0,
  comment         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_packages_resident ON packages(resident_id);
CREATE INDEX IF NOT EXISTS idx_packages_pending  ON packages(resident_id) WHERE is_delivered = 0;

CREATE TABLE IF NOT EXISTS suggestions (
  id                INTEGER PRIMARY KEY,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'idea'
                      CHECK (category IN ('bug', 'improvement', 'idea')),
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'done', 'wont_fix')),
  submitted_by      TEXT NOT NULL DEFAULT '',
  resolution_notes  TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            INTEGER PRIMARY KEY,
  resident_id   INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  body          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','delivered','read','failed')),
  wa_message_id TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone
  ON whatsapp_messages(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_resident
  ON whatsapp_messages(resident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id
  ON whatsapp_messages(wa_message_id);

CREATE TABLE IF NOT EXISTS apartment_owners (
  id         INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS owners_mobiles (
  id         INTEGER PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES apartment_owners(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  comment    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owners_mobiles_owner ON owners_mobiles(owner_id);

CREATE TABLE IF NOT EXISTS equipment_loans (
  id              INTEGER PRIMARY KEY,
  resident_id     INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  borrower_name   TEXT,
  type            TEXT NOT NULL DEFAULT 'chairs'
                    CHECK (type IN ('chairs', 'tables', 'cart')),
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  lobbyist_name   TEXT NOT NULL DEFAULT '',
  is_returned     INTEGER NOT NULL DEFAULT 0,
  returned_at     TEXT,
  comment         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_loans_resident ON equipment_loans(resident_id);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_open ON equipment_loans(resident_id) WHERE is_returned = 0;

CREATE TABLE IF NOT EXISTS resident_guests (
  id           INTEGER PRIMARY KEY,
  plate_key    TEXT NOT NULL UNIQUE,
  car_plate    TEXT NOT NULL,
  guest_name   TEXT NOT NULL DEFAULT '',
  resident_id  INTEGER REFERENCES residents(id) ON DELETE SET NULL,
  apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
  auto_open    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gate_events (
  id            INTEGER PRIMARY KEY,
  gate_id       TEXT NOT NULL,
  gate_name     TEXT NOT NULL,
  lobbyist_name TEXT NOT NULL DEFAULT '',
  ok            INTEGER NOT NULL DEFAULT 1,
  source        TEXT NOT NULL DEFAULT 'manual',
  plate         TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gate_events_created ON gate_events(created_at);

CREATE TABLE IF NOT EXISTS door_events (
  id            INTEGER PRIMARY KEY,
  door_id       TEXT NOT NULL,
  door_name     TEXT NOT NULL,
  lobbyist_name TEXT NOT NULL DEFAULT '',
  ok            INTEGER NOT NULL DEFAULT 1,
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_door_events_created ON door_events(created_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO user_preferences (id, data) VALUES (1, '{}');

CREATE TABLE IF NOT EXISTS face_enrollments (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'resident' CHECK (kind IN ('resident','staff')),
  resident_id  INTEGER UNIQUE REFERENCES residents(id) ON DELETE CASCADE,
  name         TEXT,
  label        TEXT NOT NULL UNIQUE,
  enrolled_by  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
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
  if (cols.some((c) => c.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

function applySchemaEvolution(db: Database.Database) {
  ensureColumn(db, "apartments", "keys_comment", "TEXT");
  ensureColumn(db, "phones", "comment", "TEXT");
  ensureColumn(db, "apartment_keys", "is_default", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "apartment_keys", "is_active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "apartment_keys", "is_in_lobby", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "packages", "received_by", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "packages", "delivered_to", "TEXT");
  ensureColumn(db, "guest_parking", "lobbyist_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "guest_parking", "guest_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "guest_parking", "comment", "TEXT");
  ensureColumn(db, "users", "password", "TEXT");
  ensureColumn(db, "users", "user_role", "TEXT NOT NULL DEFAULT 'lobbyist'");
  ensureColumn(db, "apartment_owners", "apartment_id", "INTEGER REFERENCES apartments(id) ON DELETE SET NULL");
  ensureColumn(db, "apartment_owners", "comments", "TEXT");

  // Tables added after initial schema — repeated here so running dev servers
  // pick them up without a restart (globalThis caches the db handle).
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_loans (
      id              INTEGER PRIMARY KEY,
      resident_id     INTEGER REFERENCES residents(id) ON DELETE SET NULL,
      borrower_name   TEXT,
      type            TEXT NOT NULL DEFAULT 'chairs'
                        CHECK (type IN ('chairs', 'tables', 'cart')),
      quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      lobbyist_name   TEXT NOT NULL DEFAULT '',
      is_returned     INTEGER NOT NULL DEFAULT 0,
      returned_at     TEXT,
      comment         TEXT,
      created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_equipment_loans_resident ON equipment_loans(resident_id);
    CREATE INDEX IF NOT EXISTS idx_equipment_loans_open ON equipment_loans(resident_id) WHERE is_returned = 0;

    CREATE TABLE IF NOT EXISTS resident_guests (
      id           INTEGER PRIMARY KEY,
      plate_key    TEXT NOT NULL UNIQUE,
      car_plate    TEXT NOT NULL,
      guest_name   TEXT NOT NULL DEFAULT '',
      resident_id  INTEGER REFERENCES residents(id) ON DELETE SET NULL,
      apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
      auto_open    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gate_events (
      id            INTEGER PRIMARY KEY,
      gate_id       TEXT NOT NULL,
      gate_name     TEXT NOT NULL,
      lobbyist_name TEXT NOT NULL DEFAULT '',
      ok            INTEGER NOT NULL DEFAULT 1,
      source        TEXT NOT NULL DEFAULT 'manual',
      plate         TEXT,
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gate_events_created ON gate_events(created_at);

    CREATE TABLE IF NOT EXISTS door_events (
      id            INTEGER PRIMARY KEY,
      door_id       TEXT NOT NULL,
      door_name     TEXT NOT NULL,
      lobbyist_name TEXT NOT NULL DEFAULT '',
      ok            INTEGER NOT NULL DEFAULT 1,
      source        TEXT NOT NULL DEFAULT 'manual',
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_door_events_created ON door_events(created_at);

    CREATE TABLE IF NOT EXISTS face_enrollments (
      id           INTEGER PRIMARY KEY,
      kind         TEXT NOT NULL DEFAULT 'resident' CHECK (kind IN ('resident','staff')),
      resident_id  INTEGER UNIQUE REFERENCES residents(id) ON DELETE CASCADE,
      name         TEXT,
      label        TEXT NOT NULL UNIQUE,
      enrolled_by  TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration v10: face_enrollments grew a 'kind' (resident|staff) + 'name' so
  // building workers (not in the residents table) can be enrolled too, and
  // resident_id became nullable. Rebuild the v9 table if it predates 'kind'.
  const faceSql = (db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='face_enrollments'`
  ).get() as { sql: string } | undefined)?.sql ?? '';
  if (faceSql && !faceSql.includes("kind")) {
    db.exec(`
      CREATE TABLE face_enrollments_new (
        id           INTEGER PRIMARY KEY,
        kind         TEXT NOT NULL DEFAULT 'resident' CHECK (kind IN ('resident','staff')),
        resident_id  INTEGER UNIQUE REFERENCES residents(id) ON DELETE CASCADE,
        name         TEXT,
        label        TEXT NOT NULL UNIQUE,
        enrolled_by  TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO face_enrollments_new (id, kind, resident_id, name, label, enrolled_by, created_at, updated_at)
        SELECT id, 'resident', resident_id, NULL, label, enrolled_by, created_at, updated_at
          FROM face_enrollments;
      DROP TABLE face_enrollments;
      ALTER TABLE face_enrollments_new RENAME TO face_enrollments;
    `);
  }

  ensureColumn(db, "resident_guests", "auto_open", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "gate_events", "source", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(db, "gate_events", "plate", "TEXT");

  // Migration v7: widen equipment_loans.type CHECK to include 'cart'
  const loansSql = (db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='equipment_loans'`
  ).get() as { sql: string } | undefined)?.sql ?? '';
  if (loansSql && !loansSql.includes("'cart'")) {
    db.exec(`
      CREATE TABLE equipment_loans_new (
        id              INTEGER PRIMARY KEY,
        resident_id     INTEGER REFERENCES residents(id) ON DELETE SET NULL,
        borrower_name   TEXT,
        type            TEXT NOT NULL DEFAULT 'chairs'
                          CHECK (type IN ('chairs', 'tables', 'cart')),
        quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        lobbyist_name   TEXT NOT NULL DEFAULT '',
        is_returned     INTEGER NOT NULL DEFAULT 0,
        returned_at     TEXT,
        comment         TEXT,
        created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO equipment_loans_new SELECT * FROM equipment_loans;
      DROP TABLE equipment_loans;
      ALTER TABLE equipment_loans_new RENAME TO equipment_loans;
      CREATE INDEX IF NOT EXISTS idx_equipment_loans_resident ON equipment_loans(resident_id);
      CREATE INDEX IF NOT EXISTS idx_equipment_loans_open ON equipment_loans(resident_id) WHERE is_returned = 0;
    `);
  }

  // Seed any pre-existing users (added before login was a feature) with a
  // default password so they can sign in. They can change it in the edit modal.
  db.prepare(`UPDATE users SET password = '1234' WHERE password IS NULL`).run();
  globalThis.__raamDbSchemaVersion = SCHEMA_EVOLUTION_VERSION;
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  applySchemaEvolution(db);

  return db;
}

declare global {
  var __raamDb: Database.Database | undefined;
  var __raamDbSchemaVersion: number | undefined;
}

function getDb(): Database.Database {
  const db = globalThis.__raamDb ?? (globalThis.__raamDb = open());
  if (globalThis.__raamDbSchemaVersion !== SCHEMA_EVOLUTION_VERSION) {
    applySchemaEvolution(db);
  }
  return db;
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getDb(), prop, receiver);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
}) as Database.Database;
