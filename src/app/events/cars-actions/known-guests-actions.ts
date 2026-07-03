"use server";

import { isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DEFAULT_KNOWN_GUESTS_PAGE_SIZE,
  KNOWN_GUESTS_SELECT,
} from "./resident-guests";
import type {
  ForgetGuestState,
  KnownGuestRow,
  PaginatedKnownGuests,
} from "./types";

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

/**
 * Paginated list of the guest plates we've learned (the "אורחים מוכרים" tab).
 * An optional query filters by guest name / plate / apartment / hosting
 * resident and is applied to BOTH the count and the page — so the lobbyist
 * pages through ALL matches from the full history, never a capped slice.
 */
export async function getKnownGuestsPage(
  page: number = 1,
  pageSize: number = DEFAULT_KNOWN_GUESTS_PAGE_SIZE,
  rawQuery: string = ""
): Promise<PaginatedKnownGuests> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));

  const q = rawQuery.trim();
  const like = `%${q}%`;
  const where = q
    ? `WHERE rg.guest_name LIKE ?
          OR rg.car_plate LIKE ?
          OR a.number LIKE ?
          OR (r.first_name || ' ' || r.last_name) LIKE ?`
    : "";
  const whereParams = q ? [like, like, like, like] : [];

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM resident_guests rg
         LEFT JOIN residents r  ON r.id = rg.resident_id
         LEFT JOIN apartments a ON a.id = rg.apartment_id
         ${where}`
      )
      .get(...whereParams) as { count: number }
  ).count;

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  const rows = db
    .prepare(
      `${KNOWN_GUESTS_SELECT}
       ${where}
       ORDER BY rg.updated_at DESC, rg.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...whereParams, safePageSize, offset) as KnownGuestRow[];

  return { rows, page: safePage, pageSize: safePageSize, total, totalPages };
}

/**
 * Toggle whether an approved guest's car auto-opens the gate on arrival.
 * Manager-only — it grants a plate hands-free entry to the building.
 */
export async function setGuestAutoOpen(
  id: number,
  value: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };

  const result = db
    .prepare(
      `UPDATE resident_guests
       SET auto_open = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(value ? 1 : 0, id);

  if (result.changes === 0) return { ok: false, error: "הרישום לא נמצא" };
  return { ok: true };
}
