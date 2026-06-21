/**
 * The local `resident_guests` data layer — our own SQLite memory of guest
 * plates we've learned. Kept separate from the SLPR (external camera) reads:
 * the SLPR side never joins to SQLite, it matches in the application layer via
 * `matchKnownGuests`.
 *
 * Plain module (NOT "use server") so the synchronous `matchKnownGuests` helper
 * and the shared SELECT consts can be imported by the SLPR read actions.
 */

import { db } from "@/lib/db";
import { normalizePlate } from "@/lib/plate";
import type { RecognizedGuest } from "./types";

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
export function matchKnownGuests(
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

/** Shared SELECT for the "known guests" management list (page + search). */
export const KNOWN_GUESTS_SELECT = `
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
    rg.auto_open                          AS autoOpen,
    rg.created_at                         AS createdAt,
    rg.updated_at                         AS updatedAt
  FROM resident_guests rg
  LEFT JOIN residents r  ON r.id = rg.resident_id
  LEFT JOIN apartments a ON a.id = rg.apartment_id
`;

export const DEFAULT_KNOWN_GUESTS_PAGE_SIZE = 10;
