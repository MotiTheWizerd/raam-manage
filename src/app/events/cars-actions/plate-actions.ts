"use server";

import { normalizePlate } from "@/lib/plate";
import { querySlpr } from "@/lib/slpr-mysql";
import { matchKnownGuests } from "./resident-guests";
import { PLATE_STATS_COLUMNS, type PlateStatsRow } from "./plate-stats";
import {
  buildLogDateClause,
  normalizedLpSql,
  parseNullableNumber,
  sqlStr,
} from "./slpr-sql";
import type {
  CarBuilding,
  CarPassageImage,
  PlateDateRange,
  PlateLookupEvent,
  PlateLookupRegisteredCar,
  PlateLookupResult,
  PlateVisitStats,
} from "./types";

const PLATE_LOOKUP_RECENT_LIMIT = 20;

/**
 * Plate-check lookup for the lobby: given a typed plate, return the full picture
 * (registered owner, known guest, lifetime visits + lane, recent reads with
 * photos). All reads — never writes to SLPR. The key is normalized to [0-9A-Z]
 * so it's injection-safe by construction, but we still cap its length.
 */
export async function lookupPlate(
  rawPlate: string,
  range?: PlateDateRange
): Promise<PlateLookupResult | null> {
  const key = normalizePlate(rawPlate).slice(0, 20);
  if (!key) return null;

  // Optional date window — scopes the camera history (visits + reads) only; the
  // owner/guest identity below is not date-dependent.
  const dateClause = buildLogDateClause(range);

  // Camera-read plates are stored clean (no formatting), so an indexed `LP = key`
  // is both correct and fast against the 65k-row log. The customer table is tiny,
  // so there we normalize the stored side too (owner plates can carry dashes).
  const [statsRows, eventRows, customerRows] = await Promise.all([
    querySlpr<PlateStatsRow>(
      `SELECT ${PLATE_STATS_COLUMNS}
       FROM \`log\`
       WHERE LP = ${sqlStr(key)}${dateClause}
       GROUP BY LP`
    ),
    querySlpr<{
      ID: string | null;
      LP: string | null;
      LOG_DATE: string | null;
      STATUS: string | null;
      CAM_ID: string | null;
      FILE: string | null;
    }>(
      `SELECT ID, LP, LOG_DATE, STATUS, CAM_ID, FILE
       FROM \`log\`
       WHERE LP = ${sqlStr(key)}${dateClause}
       ORDER BY LOG_DATE DESC, ID DESC
       LIMIT ${PLATE_LOOKUP_RECENT_LIMIT}`
    ),
    querySlpr<{
      LP: string | null;
      First_Name: string | null;
      Last_Name: string | null;
      Apartment: string | null;
      Phone: string | null;
      isEmployee: string | null;
    }>(
      `SELECT LP, First_Name, Last_Name, Apartment, Phone, isEmployee
       FROM customer
       WHERE ${normalizedLpSql("LP")} = ${sqlStr(key)}
          OR ${normalizedLpSql("additional_lps")} LIKE ${sqlStr(`%${key}%`)}
       LIMIT 1`
    ),
  ]);

  const guest = matchKnownGuests([key]).get(key) ?? null;

  const statsRow = statsRows[0];
  const cam3 = statsRow ? parseNullableNumber(statsRow.cam3) ?? 0 : 0;
  const visitStats: PlateVisitStats | null = statsRow
    ? {
        visits: parseNullableNumber(statsRow.visits) ?? 0,
        firstSeen: statsRow.firstSeen ?? "",
        lastSeen: statsRow.lastSeen ?? "",
      }
    : null;
  const building: CarBuilding | null = statsRow
    ? cam3 > 0
      ? "boutique"
      : "manhattan"
    : null;

  const recentEvents: PlateLookupEvent[] = eventRows.map((row) => ({
    id: parseNullableNumber(row.ID) ?? 0,
    eventTime: row.LOG_DATE ?? "",
    status: row.STATUS ?? "",
    cameraId: parseNullableNumber(row.CAM_ID),
    imagePath: row.FILE,
  }));

  const customer = customerRows[0];
  let registeredCar: PlateLookupRegisteredCar | null = null;
  if (customer) {
    const name = [customer.First_Name, customer.Last_Name]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) {
      registeredCar = {
        plate: (customer.LP ?? "").trim(),
        name,
        apartment: (customer.Apartment ?? "").trim() || null,
        phone: (customer.Phone ?? "").trim() || null,
        isEmployee: customer.isEmployee === "1",
      };
    }
  }

  const found = Boolean(
    registeredCar || guest || visitStats || recentEvents.length > 0
  );
  const plate =
    eventRows[0]?.LP?.trim() ||
    registeredCar?.plate ||
    normalizePlate(rawPlate);

  return {
    query: key,
    plate,
    found,
    registeredCar,
    guest,
    visitStats,
    building,
    recentEvents,
  };
}

/** How wide a window counts as the "same passage" — matches the 2-min visit dedup. */
const PASSAGE_WINDOW_SECONDS = 120;

/**
 * Every camera read of the SAME plate within ~2 minutes of a given event — i.e.
 * all the shots of this one car passage, across all cameras (the outdoor gate
 * cam 1, the inside-ramp cam 3, ...). Lets the lobby read a plate off a sibling
 * camera's photo when the displayed shot missed it.
 *
 * Read-only against SLPR. The plate key is normalized to [0-9A-Z] (injection
 * safe by construction) and the time window is anchored from the event row by
 * its numeric id — never a client-supplied timestamp.
 */
export async function getCarPassageImages(
  eventId: number,
  plate: string
): Promise<CarPassageImage[]> {
  const id = Math.floor(Number(eventId));
  if (!Number.isFinite(id) || id <= 0) return [];
  const key = normalizePlate(plate).slice(0, 20);
  if (!key) return [];

  const rows = await querySlpr<{
    ID: string | null;
    LOG_DATE: string | null;
    CAM_ID: string | null;
    STATUS: string | null;
    FILE: string | null;
  }>(
    `SELECT l.ID, l.LOG_DATE, l.CAM_ID, l.STATUS, l.FILE
     FROM \`log\` l
     JOIN (SELECT LOG_DATE FROM \`log\` WHERE ID = ${id}) a
     WHERE l.LP = ${sqlStr(key)}
       AND l.FILE IS NOT NULL AND l.FILE <> ''
       AND l.LOG_DATE BETWEEN a.LOG_DATE - INTERVAL ${PASSAGE_WINDOW_SECONDS} SECOND
                          AND a.LOG_DATE + INTERVAL ${PASSAGE_WINDOW_SECONDS} SECOND
     ORDER BY l.LOG_DATE, l.ID`
  );

  // De-dup by image path (a camera occasionally logs the same shot twice).
  const seen = new Set<string>();
  const images: CarPassageImage[] = [];
  for (const row of rows) {
    const file = (row.FILE ?? "").trim();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    images.push({
      id: parseNullableNumber(row.ID) ?? 0,
      eventTime: row.LOG_DATE ?? "",
      cameraId: parseNullableNumber(row.CAM_ID),
      status: row.STATUS ?? "",
      imagePath: file,
    });
  }
  return images;
}
