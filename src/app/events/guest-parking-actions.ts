"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type GuestParkingFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): GuestParkingFormState {
  return { error, errorAt: Date.now() };
}

export type GuestParkingRow = {
  id: number;
  car_plate: string;
  lobbyist_name: string;
  resident_id: number | null;
  resident_full_name: string | null;
  apartment_id: number | null;
  apartment_number: string | null;
  created_at: string;
};

const ROW_SELECT = `
  SELECT
    g.id,
    g.car_plate,
    g.lobbyist_name,
    g.resident_id,
    CASE WHEN r.id IS NULL THEN NULL
         ELSE r.first_name || ' ' || r.last_name
    END           AS resident_full_name,
    a.id          AS apartment_id,
    a.number      AS apartment_number,
    g.created_at
  FROM guest_parking g
  LEFT JOIN residents r ON r.id = g.resident_id
  LEFT JOIN apartments a ON a.id = r.apartment_id
`;

export async function getResidentGuestParking(
  residentId: number
): Promise<GuestParkingRow[]> {
  return db
    .prepare(
      `${ROW_SELECT}
       WHERE g.resident_id = ?
       ORDER BY g.id DESC`
    )
    .all(residentId) as GuestParkingRow[];
}

export async function createGuestParking(
  _prev: GuestParkingFormState,
  formData: FormData
): Promise<GuestParkingFormState> {
  const residentIdRaw = String(formData.get("resident_id") ?? "").trim();
  const residentId = parseInt(residentIdRaw, 10);
  if (Number.isNaN(residentId)) return fail("דייר לא חוקי");

  const carPlate = String(formData.get("car_plate") ?? "").trim();
  if (!carPlate) return fail("חובה להזין מספר רישוי");

  const lobbyistName = String(formData.get("lobbyist_name") ?? "").trim();
  if (!lobbyistName) return fail("שם הסדרן נדרש");

  try {
    db.prepare(
      `INSERT INTO guest_parking (resident_id, car_plate, lobbyist_name)
       VALUES (?, ?, ?)`
    ).run(residentId, carPlate, lobbyistName);
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("דייר לא חוקי");
    }
    throw e;
  }

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}
