"use server";

import { db } from "@/lib/db";
import { normalizePlate } from "@/lib/plate";
import { querySlpr } from "@/lib/slpr-mysql";

export type RecognizedGuest = {
  id: number;
  guestName: string | null;
  residentId: number | null;
  apartmentId: number | null;
  residentName: string | null;
  apartmentNumber: string | null;
};

/**
 * The car's registered owner as known to the SLPR parking system itself
 * (the `customer` table). Used as a fallback name when we haven't learned the
 * plate as a guest ourselves.
 */
export type RegisteredOwner = {
  name: string;
  apartment: string | null;
};

/**
 * How familiar a plate is, derived purely from the SLPR `log` history. A
 * decision-support signal for the lobbyist on unregistered cars — NOT a
 * verdict. `visits` is deduped: the two entry cameras (1 & 3) fire for the
 * same car within ~30s, so we collapse reads that fall in the same 2-minute
 * bucket, otherwise every visit would count roughly double.
 */
export type PlateVisitStats = {
  visits: number;
  firstSeen: string;
  lastSeen: string;
};

/**
 * Which lane / building a plate belongs to, decided by camera 3 — the camera
 * mounted INSIDE our entrance ramp. Cam 3 only ever sees a car that actually
 * drove down into our garage, so any cam-3 history means it's ours
 * ("boutique"). Plates seen only by the outdoor gate camera (cam 1, which also
 * overlooks the adjacent lot's lane) are the neighbour building ("manhattan").
 */
export type CarBuilding = "boutique" | "manhattan";

/** Visit stats plus the cam-3 read count used to classify the building. */
type PlateAggregate = PlateVisitStats & { cam3Reads: number };

export type SlprCarEventRow = {
  id: number;
  plate: string;
  eventTime: string;
  status: string;
  cameraId: number | null;
  duration: string | null;
  imagePath: string | null;
  customerId: number | null;
  guest: RecognizedGuest | null;
  registeredOwner: RegisteredOwner | null;
  visitStats: PlateVisitStats | null;
  building: CarBuilding;
};

type ResidentGuestLookupRow = {
  id: number;
  plate_key: string;
  guest_name: string | null;
  resident_id: number | null;
  apartment_id: number | null;
  resident_name: string | null;
  apartment_number: string | null;
};

/**
 * Application-level "join" between the external SLPR camera rows and our local
 * resident_guests memory: look up each plate's normalized key and attach the
 * matching guest, if we've learned it before.
 */
function matchKnownGuests(
  plates: string[]
): Map<string, RecognizedGuest> {
  const keys = Array.from(
    new Set(plates.map(normalizePlate).filter((key) => key.length > 0))
  );
  if (keys.length === 0) return new Map();

  const placeholders = keys.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT
         rg.id,
         rg.plate_key,
         rg.guest_name,
         rg.resident_id,
         rg.apartment_id,
         CASE WHEN r.id IS NULL THEN NULL
              ELSE r.first_name || ' ' || r.last_name
         END        AS resident_name,
         a.number    AS apartment_number
       FROM resident_guests rg
       LEFT JOIN residents r  ON r.id = rg.resident_id
       LEFT JOIN apartments a ON a.id = rg.apartment_id
       WHERE rg.plate_key IN (${placeholders})`
    )
    .all(...keys) as ResidentGuestLookupRow[];

  const map = new Map<string, RecognizedGuest>();
  for (const row of rows) {
    map.set(row.plate_key, {
      id: row.id,
      guestName: row.guest_name?.trim() || null,
      residentId: row.resident_id,
      apartmentId: row.apartment_id,
      residentName: row.resident_name,
      apartmentNumber: row.apartment_number,
    });
  }
  return map;
}

export type ForgetGuestState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

/** Remove a learned guest so its plate stops being recognized. */
export async function forgetResidentGuest(
  _prev: ForgetGuestState,
  formData: FormData
): Promise<ForgetGuestState> {
  const id = parseInt(String(formData.get("id") ?? "").trim(), 10);
  if (Number.isNaN(id)) return { error: "מזהה לא חוקי", errorAt: Date.now() };

  const result = db
    .prepare("DELETE FROM resident_guests WHERE id = ?")
    .run(id);
  if (result.changes === 0) {
    return { error: "הרישום לא נמצא", errorAt: Date.now() };
  }

  return { submittedAt: Date.now() };
}

export type KnownGuestRow = {
  id: number;
  carPlate: string;
  guestName: string | null;
  residentId: number | null;
  apartmentId: number | null;
  residentName: string | null;
  apartmentNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedKnownGuests = {
  rows: KnownGuestRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const KNOWN_GUESTS_SELECT = `
  SELECT
    rg.id,
    rg.car_plate                          AS carPlate,
    rg.guest_name                         AS guestName,
    rg.resident_id                        AS residentId,
    rg.apartment_id                       AS apartmentId,
    CASE WHEN r.id IS NULL THEN NULL
         ELSE r.first_name || ' ' || r.last_name
    END                                   AS residentName,
    a.number                              AS apartmentNumber,
    rg.created_at                         AS createdAt,
    rg.updated_at                         AS updatedAt
  FROM resident_guests rg
  LEFT JOIN residents r  ON r.id = rg.resident_id
  LEFT JOIN apartments a ON a.id = rg.apartment_id
`;

const DEFAULT_KNOWN_GUESTS_PAGE_SIZE = 10;

/** Paginated list of every guest plate we've learned (the "אורחים מוכרים" tab). */
export async function getKnownGuestsPage(
  page: number = 1,
  pageSize: number = DEFAULT_KNOWN_GUESTS_PAGE_SIZE
): Promise<PaginatedKnownGuests> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM resident_guests`).get() as {
      count: number;
    }
  ).count;

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  const rows = db
    .prepare(
      `${KNOWN_GUESTS_SELECT}
       ORDER BY rg.updated_at DESC, rg.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(safePageSize, offset) as KnownGuestRow[];

  return { rows, page: safePage, pageSize: safePageSize, total, totalPages };
}

/** Search learned guests by name or plate (mirrors searchGuestParking). */
export async function searchKnownGuests(
  rawQuery: string,
  limit: number = 50
): Promise<KnownGuestRow[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db
    .prepare(
      `${KNOWN_GUESTS_SELECT}
       WHERE rg.guest_name LIKE ? OR rg.car_plate LIKE ?
       ORDER BY rg.updated_at DESC, rg.id DESC
       LIMIT ?`
    )
    .all(like, like, limit) as KnownGuestRow[];
}

type SlprRawLogRow = {
  ID: string | null;
  LP: string | null;
  LOG_DATE: string | null;
  STATUS: string | null;
  CAM_ID: string | null;
  DURATION: string | null;
  FILE: string | null;
  Customer_Id: string | null;
  C_First: string | null;
  C_Last: string | null;
  C_Apartment: string | null;
};

/** Build the registered-owner name/apartment from the joined customer columns. */
function toRegisteredOwner(row: SlprRawLogRow): RegisteredOwner | null {
  const name = [row.C_First, row.C_Last]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!name) return null;
  return { name, apartment: (row.C_Apartment ?? "").trim() || null };
}

function parseNullableNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Escape a value into a safe single-quoted MySQL literal (querySlpr is raw SQL). */
function sqlStr(value: string): string {
  return `'${value.slice(0, 40).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

type PlateStatsRow = {
  LP: string | null;
  visits: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  cam3: string | null;
};

/**
 * Lifetime visit stats for the given plates, deduped by 2-minute window so the
 * twin entry cameras don't double-count. Also tallies cam-3 reads so the caller
 * can tell our-lane ("boutique") cars from the neighbour lane ("manhattan").
 * One grouped query for the whole batch.
 */
async function getPlateVisitStats(
  plates: string[]
): Promise<Map<string, PlateAggregate>> {
  const unique = Array.from(
    new Set(plates.map((p) => p.trim()).filter((p) => p.length > 0))
  );
  if (unique.length === 0) return new Map();

  const inList = unique.map(sqlStr).join(", ");
  const rows = await querySlpr<PlateStatsRow>(
    `SELECT
       LP,
       COUNT(DISTINCT FLOOR(UNIX_TIMESTAMP(LOG_DATE) / 120)) AS visits,
       MIN(LOG_DATE) AS firstSeen,
       MAX(LOG_DATE) AS lastSeen,
       SUM(CAM_ID = 3) AS cam3
     FROM \`log\`
     WHERE LP IN (${inList})
     GROUP BY LP`
  );

  const map = new Map<string, PlateAggregate>();
  for (const row of rows) {
    const lp = (row.LP ?? "").trim();
    if (!lp) continue;
    map.set(lp, {
      visits: parseNullableNumber(row.visits) ?? 0,
      firstSeen: row.firstSeen ?? "",
      lastSeen: row.lastSeen ?? "",
      cam3Reads: parseNullableNumber(row.cam3) ?? 0,
    });
  }
  return map;
}

/**
 * The single newest CONFIRMED-entry event, enriched with a recognized-guest or
 * registered-owner name. Powers the lightweight 5s "new car" poller — cheap
 * enough to run globally on every page.
 *
 * Reads from camera 3 (the in-ramp camera) only: a car appears there exactly
 * when it has actually driven down into our garage, so the notifier never fires
 * for the neighbour lane ("manhattan"). The trade-off is ~30s latency vs the
 * outdoor gate camera — worth it for a zero-false-positive alert.
 */
export type LatestCarEvent = {
  id: number;
  plate: string;
  status: string;
  eventTime: string;
  guestName: string | null;
  ownerName: string | null;
  apartmentNumber: string | null;
};

export async function getLatestCarEvent(): Promise<LatestCarEvent | null> {
  const rows = await querySlpr<SlprRawLogRow>(
    `SELECT
       l.ID, l.LP, l.LOG_DATE, l.STATUS, l.CAM_ID, l.DURATION, l.FILE, l.Customer_Id,
       c.First_Name AS C_First,
       c.Last_Name  AS C_Last,
       c.Apartment  AS C_Apartment
     FROM \`log\` l
     LEFT JOIN customer c ON c.ID = l.Customer_Id AND l.Customer_Id > 0
     WHERE l.CAM_ID = 3
     ORDER BY l.LOG_DATE DESC, l.ID DESC
     LIMIT 1`
  );
  const row = rows[0];
  if (!row) return null;

  const plate = (row.LP ?? "").trim();
  const guest = matchKnownGuests([plate]).get(normalizePlate(plate)) ?? null;
  const owner = toRegisteredOwner(row);

  return {
    id: parseNullableNumber(row.ID) ?? 0,
    plate,
    status: row.STATUS ?? "",
    eventTime: row.LOG_DATE ?? "",
    guestName: guest?.guestName ?? null,
    ownerName: guest ? null : owner?.name ?? null,
    apartmentNumber: guest?.apartmentNumber ?? owner?.apartment ?? null,
  };
}

/** The single most recent plate seen at the entry camera (autofill helper). */
export async function getLastCarPlate(): Promise<string | null> {
  const rows = await querySlpr<{ LP: string | null }>(
    `SELECT LP FROM \`log\`
     WHERE CAM_ID = 1
     ORDER BY LOG_DATE DESC, ID DESC
     LIMIT 1`
  );
  return rows[0]?.LP?.trim() || null;
}

export async function getRecentCarEvents(
  days: number = 3
): Promise<SlprCarEventRow[]> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const rows = await querySlpr<SlprRawLogRow>(
    `SELECT
       l.ID, l.LP, l.LOG_DATE, l.STATUS, l.CAM_ID, l.DURATION, l.FILE, l.Customer_Id,
       c.First_Name AS C_First,
       c.Last_Name  AS C_Last,
       c.Apartment  AS C_Apartment
     FROM \`log\` l
     LEFT JOIN customer c ON c.ID = l.Customer_Id AND l.Customer_Id > 0
     WHERE l.CAM_ID = 1
       AND l.LOG_DATE >= (NOW() - INTERVAL ${safeDays} DAY)
     ORDER BY l.LOG_DATE DESC, l.ID DESC
     LIMIT 5000`
  );

  const knownGuests = matchKnownGuests(rows.map((row) => row.LP ?? ""));
  const visitStats = await getPlateVisitStats(rows.map((row) => row.LP ?? ""));

  return rows.map((row) => {
    const plate = (row.LP ?? "").trim();
    const agg = visitStats.get(plate) ?? null;
    return {
      id: parseNullableNumber(row.ID) ?? 0,
      plate,
      eventTime: row.LOG_DATE ?? "",
      status: row.STATUS ?? "",
      cameraId: parseNullableNumber(row.CAM_ID),
      duration: row.DURATION,
      imagePath: row.FILE,
      customerId: parseNullableNumber(row.Customer_Id),
      guest: knownGuests.get(normalizePlate(plate)) ?? null,
      registeredOwner: toRegisteredOwner(row),
      visitStats: agg,
      building: agg && agg.cam3Reads > 0 ? "boutique" : "manhattan",
    };
  });
}
