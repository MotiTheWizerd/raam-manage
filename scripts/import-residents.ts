// One-shot import of the residents spreadsheet into data/raam.db.
//
// Usage:
//   npx tsx scripts/import-residents.ts <xlsx-path>
//   npx tsx scripts/import-residents.ts <xlsx-path> --reset
//
// --reset wipes existing apartments/zones/apartment_assets first (after backup).
// Without it, the script aborts if any apartment number from the sheet already
// exists in the DB.

import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

type Row = (string | number | null)[];

const DB_PATH = path.join(process.cwd(), "data", "raam.db");
const SHEET_NAME = "דיירים "; // trailing space is in the file
const UNOCCUPIED = "לא מאוכלסת";

// ---------- helpers ----------

const norm = (s: unknown): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim() : s == null ? "" : String(s).trim();

const stripWaPrefix = (s: string): string =>
  s.replace(/^ו(?=\S)/, ""); // strip leading "ו" ("and") when fused to a name

const sameOwners = (current: string, owners: string): boolean => {
  const a = stripWaPrefix(norm(current));
  const b = stripWaPrefix(norm(owners));
  if (!a || !b) return false;
  if (a === b) return true;
  // surname match: last word in each, ignoring trailing punctuation
  const lastA = a.split(/\s+/).pop()!;
  const lastB = b.split(/\s+/).pop()!;
  if (lastA && lastA === lastB) return true;
  return a.includes(b) || b.includes(a);
};

const splitName = (full: string): { first: string; last: string } => {
  const parts = norm(full).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "-" }; // last_name is NOT NULL
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return { first, last };
};

// Parking: "90,91 (-1)" or "11 (-1)  110,111 (-2)" → [{floor, number}, ...]
const parseParking = (raw: string): { floor: number; number: string }[] => {
  const out: { floor: number; number: string }[] = [];
  const re = /([\d,\s]+?)\s*\(\s*(-?\d+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const floor = parseInt(m[2], 10);
    const nums = m[1].split(",").map((n) => n.trim()).filter(Boolean);
    for (const n of nums) out.push({ floor, number: n });
  }
  return out;
};

// Storage: " (-1) 120" or "(-2) 74" → [{floor, number}, ...]
const parseStorage = (raw: string): { floor: number; number: string }[] => {
  const out: { floor: number; number: string }[] = [];
  const re = /\(\s*(-?\d+)\s*\)\s*([\d,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const floor = parseInt(m[1], 10);
    const nums = m[2].split(",").map((n) => n.trim()).filter(Boolean);
    for (const n of nums) out.push({ floor, number: n });
  }
  return out;
};

// Phones cell — free text with embedded names + Israeli phone numbers
// Returns { number, label? } per phone. Number is normalized to "0XX-XXXXXXX".
const parsePhones = (raw: string): { number: string; label: string | null }[] => {
  const out: { number: string; label: string | null }[] = [];
  // Match: 3 digits dash 7 digits, OR 10 digits no dash, with optional leading 0
  const re = /(\d{3})[-\s]?(\d{7})/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  let pendingLabel = "";
  while ((m = re.exec(raw)) !== null) {
    const beforeText = raw.slice(lastEnd, m.index);
    const label = norm(beforeText) || pendingLabel;
    const number = `${m[1]}-${m[2]}`;
    out.push({ number, label: label || null });
    pendingLabel = "";
    lastEnd = re.lastIndex;
  }
  return out;
};

const isUnoccupied = (s: string): boolean => s.includes(UNOCCUPIED);

// ---------- main ----------

function main() {
  const args = process.argv.slice(2);
  const xlsxPath = args.find((a) => !a.startsWith("--"));
  const reset = args.includes("--reset");

  if (!xlsxPath) {
    console.error("usage: tsx scripts/import-residents.ts <xlsx> [--reset]");
    process.exit(1);
  }
  if (!fs.existsSync(xlsxPath)) {
    console.error(`file not found: ${xlsxPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`db not found: ${DB_PATH} — run the app once to bootstrap the schema`);
    process.exit(1);
  }

  // Read & trim
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    console.error(`sheet not found: ${SHEET_NAME}`);
    process.exit(1);
  }
  const all: Row[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const trim = (r: Row): Row => {
    const a = [...r];
    while (a.length && a[a.length - 1] == null) a.pop();
    return a;
  };

  type Parsed = {
    rowIdx: number;
    apartmentNumber: string;
    floor: number | null;
    zoneName: string;
    poBox: string | null;
    aptNotes: string | null;
    residentNamesRaw: string;
    ownersRaw: string;
    isOwner: boolean;
    parking: { floor: number; number: string }[];
    storage: { floor: number; number: string }[];
    phones: { number: string; label: string | null }[];
  };

  const parsed: Parsed[] = [];
  const skipped: { rowIdx: number; reason: string }[] = [];

  for (let i = 1; i < all.length; i++) {
    const r = trim(all[i]);
    if (r.length === 0) continue;

    const residentsCell = norm(r[0]);
    const apartmentNumber = norm(r[1]);
    const zoneName = norm(r[2]).replace(/\s+/g, " ");
    const floorRaw = r[3];
    const storageCell = norm(r[4]);
    const poBoxCell = norm(r[5]);
    const parkingCell = norm(r[6]);
    const phonesCell = norm(r[7]);
    const notesCell = norm(r[8]);
    const ownersCell = norm(r[10]);

    if (!apartmentNumber) {
      skipped.push({ rowIdx: i, reason: "no apartment number" });
      continue;
    }
    const unoccupied = isUnoccupied(residentsCell);
    if (!residentsCell || unoccupied) {
      skipped.push({
        rowIdx: i,
        reason: unoccupied ? "marked unoccupied" : "no resident name",
      });
      // We still want to import the apartment shell so future residents can be added
      // — but skip residents/phones for it.
    }

    const floor = typeof floorRaw === "number" ? floorRaw : floorRaw ? parseInt(String(floorRaw), 10) : null;

    parsed.push({
      rowIdx: i,
      apartmentNumber,
      floor: Number.isFinite(floor as number) ? (floor as number) : null,
      zoneName,
      poBox: poBoxCell || null,
      aptNotes: notesCell || null,
      residentNamesRaw: residentsCell && !unoccupied ? residentsCell : "",
      ownersRaw: ownersCell,
      isOwner: residentsCell && !unoccupied ? sameOwners(residentsCell, ownersCell) : false,
      parking: parkingCell ? parseParking(parkingCell) : [],
      storage: storageCell ? parseStorage(storageCell) : [],
      phones: phonesCell && !unoccupied ? parsePhones(phonesCell) : [],
    });
  }

  // Open DB
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Pre-flight: existing-apartment conflicts
  const existing = db
    .prepare(`SELECT number FROM apartments WHERE number IN (${parsed.map(() => "?").join(",")})`)
    .all(...parsed.map((p) => p.apartmentNumber)) as { number: string }[];

  if (existing.length > 0 && !reset) {
    console.error(`abort: ${existing.length} apartment numbers already exist in DB:`);
    console.error(existing.map((e) => e.number).join(", "));
    console.error("re-run with --reset to wipe apartments/zones/apartment_assets and re-import");
    db.close();
    process.exit(1);
  }

  // Backup before destructive ops
  if (reset) {
    const backupPath = `${DB_PATH}.bak-${Date.now()}`;
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`backup: ${path.relative(process.cwd(), backupPath)}`);
  }

  const insertZone = db.prepare(`INSERT INTO zones (name) VALUES (?)`);
  const findZone = db.prepare(`SELECT id FROM zones WHERE name = ?`);
  const insertApt = db.prepare(
    `INSERT INTO apartments (number, floor, zone_id, notes) VALUES (?, ?, ?, ?)`
  );
  const insertResident = db.prepare(
    `INSERT INTO residents (apartment_id, first_name, last_name, po_box, type, notes) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertPhone = db.prepare(
    `INSERT INTO phones (resident_id, number, label, is_primary) VALUES (?, ?, ?, ?)`
  );
  const insertAsset = db.prepare(
    `INSERT OR IGNORE INTO apartment_assets (type, floor, number, apartment_id) VALUES (?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    if (reset) {
      // Order matters: cascade chains will drop residents/phones via apartments.
      db.exec(`DELETE FROM apartment_assets`);
      db.exec(`DELETE FROM apartments`); // cascades residents → phones, keys, vehicles
      db.exec(`DELETE FROM zones`);
    }

    const counts = { zones: 0, apartments: 0, residents: 0, phones: 0, parking: 0, storage: 0 };
    const zoneCache = new Map<string, number>();

    for (const p of parsed) {
      // Zone (deduped, normalized — trim trailing spaces seen in spreadsheet)
      let zoneId: number | null = null;
      if (p.zoneName) {
        const cached = zoneCache.get(p.zoneName);
        if (cached) zoneId = cached;
        else {
          const found = findZone.get(p.zoneName) as { id: number } | undefined;
          if (found) {
            zoneId = found.id;
          } else {
            const r = insertZone.run(p.zoneName);
            zoneId = Number(r.lastInsertRowid);
            counts.zones++;
          }
          zoneCache.set(p.zoneName, zoneId!);
        }
      }

      // Apartment
      const aptResult = insertApt.run(p.apartmentNumber, p.floor, zoneId, p.aptNotes);
      const apartmentId = Number(aptResult.lastInsertRowid);
      counts.apartments++;

      // Assets
      for (const s of p.storage) {
        insertAsset.run("storage", s.floor, s.number, apartmentId);
        counts.storage++;
      }
      for (const sp of p.parking) {
        insertAsset.run("parking", sp.floor, sp.number, apartmentId);
        counts.parking++;
      }

      // Residents (one row — we don't try to split multi-resident cells, the data is too messy)
      if (p.residentNamesRaw) {
        const { first, last } = splitName(p.residentNamesRaw);
        const type = p.isOwner ? "owner" : "renter";
        const rRes = insertResident.run(
          apartmentId,
          first || "-",
          last || "-",
          p.poBox,
          type,
          null
        );
        const residentId = Number(rRes.lastInsertRowid);
        counts.residents++;

        for (let i = 0; i < p.phones.length; i++) {
          const ph = p.phones[i];
          insertPhone.run(residentId, ph.number, ph.label, i === 0 ? 1 : 0);
          counts.phones++;
        }
      }
    }

    return counts;
  });

  const counts = tx();
  db.close();

  // Minimal report
  console.log("import done");
  console.log(`  rows in sheet:        ${all.length - 1}`);
  console.log(`  rows skipped:         ${skipped.length}`);
  console.log(`  apartments inserted:  ${counts.apartments}`);
  console.log(`  zones inserted:       ${counts.zones}`);
  console.log(`  residents inserted:   ${counts.residents}`);
  console.log(`  phones inserted:      ${counts.phones}`);
  console.log(`  parking spots:        ${counts.parking}`);
  console.log(`  storage units:        ${counts.storage}`);
  if (skipped.length > 0) {
    console.log("\nskipped rows:");
    for (const s of skipped) console.log(`  row ${s.rowIdx}: ${s.reason}`);
  }
}

main();
