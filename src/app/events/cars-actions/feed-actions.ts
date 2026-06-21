"use server";

import { normalizePlate } from "@/lib/plate";
import { querySlpr } from "@/lib/slpr-mysql";
import { matchKnownGuests } from "./resident-guests";
import { getPlateVisitStats } from "./plate-stats";
import { parseNullableNumber } from "./slpr-sql";
import type {
  LatestCarEvent,
  RegisteredOwner,
  SlprCarEventRow,
} from "./types";

/** Raw row shape of the `log` ⋈ `customer` read used by the feed/notifier. */
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

/**
 * The single newest gate event, enriched with a recognized-guest or
 * registered-owner name. Powers the lightweight 5s "new car" poller — cheap
 * enough to run globally on every page.
 *
 * Reads from camera 1 (the outdoor gate) so the pop-up fires the instant a car
 * reaches the entrance — including the neighbour lane ("manhattan"). Moti's
 * call: an immediate heads-up beats a filtered-but-late one; the cars feed
 * still tags/filters בוטיק vs מנהטן for the considered view.
 */
export async function getLatestCarEvent(): Promise<LatestCarEvent | null> {
  const rows = await querySlpr<SlprRawLogRow>(
    `SELECT
       l.ID, l.LP, l.LOG_DATE, l.STATUS, l.CAM_ID, l.DURATION, l.FILE, l.Customer_Id,
       c.First_Name AS C_First,
       c.Last_Name  AS C_Last,
       c.Apartment  AS C_Apartment
     FROM \`log\` l
     LEFT JOIN customer c ON c.ID = l.Customer_Id AND l.Customer_Id > 0
     WHERE l.CAM_ID = 1
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

/** The recent gate events (3 days by default) for the Cars tab live feed. */
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
