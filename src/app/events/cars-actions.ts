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

type SlprRawLogRow = {
  ID: string | null;
  LP: string | null;
  LOG_DATE: string | null;
  STATUS: string | null;
  CAM_ID: string | null;
  DURATION: string | null;
  FILE: string | null;
  Customer_Id: string | null;
};

function parseNullableNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRecentCarEvents(
  limit: number = 100
): Promise<SlprCarEventRow[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await querySlpr<SlprRawLogRow>(
    `SELECT ID, LP, LOG_DATE, STATUS, CAM_ID, DURATION, FILE, Customer_Id
     FROM \`log\`
     WHERE CAM_ID = 1
     ORDER BY LOG_DATE DESC, ID DESC
     LIMIT ${safeLimit}`
  );

  const knownGuests = matchKnownGuests(rows.map((row) => row.LP ?? ""));

  return rows.map((row) => {
    const plate = (row.LP ?? "").trim();
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
    };
  });
}
