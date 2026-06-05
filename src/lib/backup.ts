import "server-only";

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { db } from "./db";
import { querySlpr } from "./slpr-mysql";

// Backups live under data/backups/<kind>/ — data/ is gitignored, so they stay
// strictly local to the lobby PC and are never committed.
const BACKUP_ROOT = path.join(process.cwd(), "data", "backups");

export type BackupKind = "app" | "slpr";

const DIRS: Record<BackupKind, string> = {
  app: path.join(BACKUP_ROOT, "app"),
  slpr: path.join(BACKUP_ROOT, "slpr"),
};

const PREFIX: Record<BackupKind, string> = {
  app: "raam_",
  slpr: "slpr_",
};

// Match only real backup files — never SQLite's -wal/-shm sidecars, which share
// the .sqlite stem and would otherwise inflate the count and the listing.
const SUFFIX: Record<BackupKind, string> = {
  app: ".sqlite",
  slpr: ".sql.gz",
};

function isBackupFile(kind: BackupKind, name: string): boolean {
  return name.startsWith(PREFIX[kind]) && name.endsWith(SUFFIX[kind]);
}

// Keep the most recent N backups per database; older ones are pruned.
const RETENTION = 10;

export type BackupFile = {
  kind: BackupKind;
  name: string;
  sizeBytes: number;
  createdAt: string; // ISO
};

// In-process guard so a manual "backup now" and the nightly run can't collide
// on the same database (which would write two files into one rotation window).
const running: Record<BackupKind, boolean> = { app: false, slpr: false };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Local wall-clock stamp, sortable lexically (so filename sort == chronological).
function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// App database (SQLite) — better-sqlite3's online backup is WAL-safe.
// ---------------------------------------------------------------------------
async function backupAppDb(): Promise<string> {
  fs.mkdirSync(DIRS.app, { recursive: true });
  const dest = path.join(DIRS.app, `${PREFIX.app}${stamp()}.sqlite`);
  await db.backup(dest);
  return dest;
}

// ---------------------------------------------------------------------------
// SLPR database (external MySQL) — read-only SQL dump, schema + data, gzipped.
// Built entirely from SELECT / SHOW statements: there is no write path here.
// ---------------------------------------------------------------------------
const BINARY_TYPES = new Set([
  "blob",
  "tinyblob",
  "mediumblob",
  "longblob",
  "binary",
  "varbinary",
  "bit",
]);

function quoteLiteral(value: string): string {
  // Escape backslash first, then the rest, into a MySQL string literal.
  return (
    "'" +
    value
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\x00/g, "\\0")
      .replace(/\x1a/g, "\\Z") +
    "'"
  );
}

function formatValue(value: string | null, isBinary: boolean): string {
  if (value === null) return "NULL";
  if (isBinary) return value.length ? `0x${value}` : "''"; // value is HEX() output
  return quoteLiteral(value);
}

async function backupSlprDb(): Promise<string> {
  fs.mkdirSync(DIRS.slpr, { recursive: true });
  const dest = path.join(DIRS.slpr, `${PREFIX.slpr}${stamp()}.sql.gz`);

  const gzip = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(dest);
  gzip.pipe(out);

  const finished = new Promise<void>((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
    gzip.on("error", reject);
  });
  const write = (chunk: string) =>
    new Promise<void>((resolve, reject) =>
      gzip.write(chunk, (err) => (err ? reject(err) : resolve()))
    );

  try {
    await write(
      `-- SLPR database backup (read-only dump)\n-- Generated ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`
    );

    const tables = await querySlpr<{ name: string }>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`
    );

    for (const { name } of tables) {
      const ddlRows = await querySlpr<Record<string, string | null>>(
        `SHOW CREATE TABLE \`${name}\``
      );
      const ddl = ddlRows[0] ?? {};
      const createSql =
        ddl["Create Table"] ?? Object.values(ddl)[1] ?? Object.values(ddl)[0];

      await write(
        `--\n-- Table: ${name}\n--\nDROP TABLE IF EXISTS \`${name}\`;\n${createSql};\n\n`
      );

      const cols = await querySlpr<{ name: string; type: string }>(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${quoteLiteral(name)}
          ORDER BY ORDINAL_POSITION`
      );
      if (cols.length === 0) continue;

      const binaryCols = new Set(
        cols.filter((c) => BINARY_TYPES.has((c.type || "").toLowerCase())).map((c) => c.name)
      );
      // Binary columns are read as HEX() so the dump stays text-safe and the
      // value can be restored as a 0x… literal.
      const selectList = cols
        .map((c) => (binaryCols.has(c.name) ? `HEX(\`${c.name}\`) AS \`${c.name}\`` : `\`${c.name}\``))
        .join(", ");
      const colNames = cols.map((c) => c.name);
      const colList = colNames.map((c) => `\`${c}\``).join(", ");

      const rows = await querySlpr<Record<string, string | null>>(
        `SELECT ${selectList} FROM \`${name}\``
      );

      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const values = slice
          .map(
            (r) =>
              "(" +
              colNames.map((c) => formatValue(r[c], binaryCols.has(c))).join(",") +
              ")"
          )
          .join(",\n");
        await write(`INSERT INTO \`${name}\` (${colList}) VALUES\n${values};\n`);
      }
      if (rows.length) await write("\n");
    }

    await write("SET FOREIGN_KEY_CHECKS=1;\n");
  } finally {
    gzip.end();
  }

  await finished;
  return dest;
}

// ---------------------------------------------------------------------------
// Rotation, listing, orchestration
// ---------------------------------------------------------------------------
async function rotate(kind: BackupKind): Promise<void> {
  const dir = DIRS[kind];
  const files = (await fs.promises.readdir(dir))
    .filter((f) => isBackupFile(kind, f))
    .sort(); // ascending == oldest first (timestamp filenames)

  const excess = files.length - RETENTION;
  for (let i = 0; i < excess; i += 1) {
    await fs.promises.unlink(path.join(dir, files[i]));
  }
}

export async function runBackup(kind: BackupKind): Promise<BackupFile> {
  if (running[kind]) {
    throw new Error("גיבוי כבר מתבצע עבור מסד נתונים זה");
  }
  running[kind] = true;
  try {
    const dest = kind === "app" ? await backupAppDb() : await backupSlprDb();
    await rotate(kind);
    const st = await fs.promises.stat(dest);
    return {
      kind,
      name: path.basename(dest),
      sizeBytes: st.size,
      createdAt: st.mtime.toISOString(),
    };
  } finally {
    running[kind] = false;
  }
}

// Used by the nightly scheduler — never throws; logs per-database failures so
// one broken database can't stop the other from being backed up.
export async function runAllBackups(): Promise<void> {
  for (const kind of ["app", "slpr"] as BackupKind[]) {
    try {
      await runBackup(kind);
    } catch (e) {
      console.error(`[backup] ${kind} backup failed:`, e);
    }
  }
}

export async function listBackups(): Promise<BackupFile[]> {
  const out: BackupFile[] = [];
  for (const kind of ["app", "slpr"] as BackupKind[]) {
    const dir = DIRS[kind];
    if (!fs.existsSync(dir)) continue;
    for (const name of await fs.promises.readdir(dir)) {
      if (!isBackupFile(kind, name)) continue;
      const full = path.join(dir, name);
      const st = await fs.promises.stat(full);
      if (!st.isFile()) continue;
      out.push({ kind, name, sizeBytes: st.size, createdAt: st.mtime.toISOString() });
    }
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

// Resolve a download request to a real backup path, guarding against traversal.
export function resolveBackupPath(kind: string, name: string): string | null {
  if (kind !== "app" && kind !== "slpr") return null;
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return null;
  }
  const dir = DIRS[kind as BackupKind];
  const full = path.join(dir, name);
  if (!full.startsWith(dir + path.sep)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

export { RETENTION };
