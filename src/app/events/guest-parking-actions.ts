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
  guest_name: string;
  lobbyist_name: string;
  comment: string | null;
  resident_id: number | null;
  resident_full_name: string | null;
  apartment_id: number | null;
  apartment_number: string | null;
  created_at: string;
};

export type PaginatedGuestParking = {
  rows: GuestParkingRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_HISTORY_PAGE_SIZE = 30;

const ROW_SELECT = `
  SELECT
    g.id,
    g.car_plate,
    g.guest_name,
    g.lobbyist_name,
    g.comment,
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

export async function getRecentGuestParking(
  residentId: number | null,
  limit: number = 10
): Promise<GuestParkingRow[]> {
  const result = await getGuestParkingPage(residentId, 1, limit);
  return result.rows;
}

export async function getGuestParkingPage(
  residentId: number | null,
  page: number = 1,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE
): Promise<PaginatedGuestParking> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));

  const total = (
    residentId !== null
      ? (db
          .prepare(
            `SELECT COUNT(*) AS count FROM guest_parking WHERE resident_id = ?`
          )
          .get(residentId) as { count: number })
      : (db
          .prepare(`SELECT COUNT(*) AS count FROM guest_parking`)
          .get() as { count: number })
  ).count;

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  let rows: GuestParkingRow[];
  if (residentId !== null) {
    rows = db
      .prepare(
        `${ROW_SELECT}
         WHERE g.resident_id = ?
         ORDER BY g.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(residentId, safePageSize, offset) as GuestParkingRow[];
  } else {
    rows = db
      .prepare(
        `${ROW_SELECT}
         ORDER BY g.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(safePageSize, offset) as GuestParkingRow[];
  }

  return {
    rows,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export async function searchGuestParking(
  rawQuery: string,
  limit: number = 50
): Promise<GuestParkingRow[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db
    .prepare(
      `${ROW_SELECT}
       WHERE g.guest_name LIKE ? OR g.car_plate LIKE ?
       ORDER BY g.id DESC
       LIMIT ?`
    )
    .all(like, like, limit) as GuestParkingRow[];
}

export async function createGuestParking(
  _prev: GuestParkingFormState,
  formData: FormData
): Promise<GuestParkingFormState> {
  const residentIdRaw = String(formData.get("resident_id") ?? "").trim();
  const residentId = parseInt(residentIdRaw, 10);
  if (Number.isNaN(residentId)) return fail("דייר לא חוקי");

  const carPlate = String(formData.get("car_plate") ?? "").trim();

  const guestName = String(formData.get("guest_name") ?? "").trim();
  if (!guestName) return fail("שם האורח נדרש");

  const lobbyistName = String(formData.get("lobbyist_name") ?? "").trim();
  if (!lobbyistName) return fail("שם הפקיד נדרש");

  const comment = String(formData.get("comment") ?? "").trim() || null;

  try {
    db.prepare(
      `INSERT INTO guest_parking (resident_id, car_plate, guest_name, lobbyist_name, comment)
       VALUES (?, ?, ?, ?, ?)`
    ).run(residentId, carPlate, guestName, lobbyistName, comment);
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("דייר לא חוקי");
    }
    throw e;
  }

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

export async function deleteGuestParking(
  _prev: GuestParkingFormState,
  formData: FormData
): Promise<GuestParkingFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db.prepare("DELETE FROM guest_parking WHERE id = ?").run(id);
  if (result.changes === 0) return fail("הרישום לא נמצא");

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}
