"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type LogKeyEventState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): LogKeyEventState {
  return { error, errorAt: Date.now() };
}

export type EventsKeyRow = {
  id: number;
  nickname: string;
  is_default: number;
  is_in_lobby: number;
  last_resident_id: number | null;
  last_resident_name: string | null;
  last_event_at: string | null;
  last_lobbyist_name: string | null;
  last_comment: string | null;
};

export async function getApartmentKeysForEvents(
  apartmentId: number
): Promise<EventsKeyRow[]> {
  return db
    .prepare(
      `SELECT
         k.id, k.nickname, k.is_default, k.is_in_lobby,
         h.resident_id                            AS last_resident_id,
         CASE WHEN r.id IS NULL THEN NULL
              ELSE r.first_name || ' ' || r.last_name
         END                                      AS last_resident_name,
         h.created_at                             AS last_event_at,
         h.lobbyist_name                          AS last_lobbyist_name,
         h.comment                                AS last_comment
       FROM apartment_keys k
       LEFT JOIN apartment_keys_history h ON h.id = (
         SELECT id FROM apartment_keys_history
         WHERE apartment_key_id = k.id
         ORDER BY id DESC LIMIT 1
       )
       LEFT JOIN residents r ON r.id = h.resident_id
       WHERE k.apartment_id = ? AND k.is_active = 1
       ORDER BY k.is_default DESC, k.id`
    )
    .all(apartmentId) as EventsKeyRow[];
}

export async function getApartmentKeysComment(
  apartmentId: number
): Promise<string | null> {
  const row = db
    .prepare("SELECT keys_comment FROM apartments WHERE id = ?")
    .get(apartmentId) as { keys_comment: string | null } | undefined;

  return row?.keys_comment ?? null;
}

export type KeyHistoryRow = {
  id: number;
  created_at: string;
  key_id: number;
  key_nickname: string;
  apartment_id: number;
  apartment_number: string;
  is_in_lobby: number;
  lobbyist_name: string;
  resident_id: number | null;
  resident_name: string | null;
  comment: string | null;
};

export type PaginatedKeyHistory = {
  rows: KeyHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_HISTORY_PAGE_SIZE = 30;

export async function getRecentKeysHistory(
  apartmentId: number | null,
  limit: number = 10
): Promise<KeyHistoryRow[]> {
  const result = await getKeysHistoryPage(apartmentId, 1, limit);
  return result.rows;
}

const KEY_HISTORY_SELECT = `SELECT
       h.id,
       h.created_at,
       k.id        AS key_id,
       k.nickname  AS key_nickname,
       a.id        AS apartment_id,
       a.number    AS apartment_number,
       h.is_in_lobby,
       h.lobbyist_name,
       h.resident_id,
       CASE WHEN r.id IS NULL THEN NULL
            ELSE r.first_name || ' ' || r.last_name
       END         AS resident_name,
       h.comment
     FROM apartment_keys_history h
     JOIN apartment_keys k ON k.id = h.apartment_key_id
     JOIN apartments a ON a.id = k.apartment_id
     LEFT JOIN residents r ON r.id = h.resident_id`;

export async function searchKeysHistory(
  rawQuery: string,
  limit: number = 50
): Promise<KeyHistoryRow[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db
    .prepare(
      `${KEY_HISTORY_SELECT}
       WHERE k.nickname LIKE ? OR a.number LIKE ?
       ORDER BY h.id DESC
       LIMIT ?`
    )
    .all(like, like, limit) as KeyHistoryRow[];
}

export async function getKeysHistoryPage(
  apartmentId: number | null,
  page: number = 1,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE
): Promise<PaginatedKeyHistory> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));

  const baseSelect = KEY_HISTORY_SELECT;

  const total = (
    apartmentId !== null
      ? (db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM apartment_keys_history h
             JOIN apartment_keys k ON k.id = h.apartment_key_id
             WHERE k.apartment_id = ?`
          )
          .get(apartmentId) as { count: number })
      : (db
          .prepare(`SELECT COUNT(*) AS count FROM apartment_keys_history`)
          .get() as { count: number })
  ).count;

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  let rows: KeyHistoryRow[];
  if (apartmentId !== null) {
    rows = db
      .prepare(
        `${baseSelect}
         WHERE k.apartment_id = ?
         ORDER BY h.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(apartmentId, safePageSize, offset) as KeyHistoryRow[];
  } else {
    rows = db
      .prepare(
        `${baseSelect}
         ORDER BY h.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(safePageSize, offset) as KeyHistoryRow[];
  }

  return {
    rows,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export type ApartmentResidentOption = {
  id: number;
  full_name: string;
};

export async function getApartmentResidents(
  apartmentId: number
): Promise<ApartmentResidentOption[]> {
  return db
    .prepare(
      `SELECT id, (first_name || ' ' || last_name) AS full_name
       FROM residents
       WHERE apartment_id = ? AND move_out IS NULL
       ORDER BY first_name, last_name`
    )
    .all(apartmentId) as ApartmentResidentOption[];
}

export async function logKeyEvent(
  _prev: LogKeyEventState,
  formData: FormData
): Promise<LogKeyEventState> {
  const keyIdRaw = String(formData.get("apartment_key_id") ?? "").trim();
  const apartmentKeyId = parseInt(keyIdRaw, 10);
  if (Number.isNaN(apartmentKeyId)) return fail("מפתח לא חוקי");

  const isInLobbyRaw = String(formData.get("is_in_lobby") ?? "").trim();
  const isInLobby = isInLobbyRaw === "1" ? 1 : 0;

  const residentIdRaw = String(formData.get("resident_id") ?? "").trim();
  let residentId: number | null = null;
  if (residentIdRaw) {
    const parsed = parseInt(residentIdRaw, 10);
    if (Number.isNaN(parsed)) return fail("דייר לא חוקי");
    residentId = parsed;
  }

  const lobbyistName = String(formData.get("lobbyist_name") ?? "").trim();
  if (!lobbyistName) return fail("שם הפקיד נדרש");

  const commentRaw = String(formData.get("comment") ?? "").trim();
  const comment = commentRaw || null;

  if (residentId === null && comment === null) {
    return fail("יש להוסיף דייר או הערה");
  }

  try {
    const insertHistory = db.prepare(
      `INSERT INTO apartment_keys_history
         (apartment_key_id, is_in_lobby, resident_id, lobbyist_name, comment)
       VALUES (?, ?, ?, ?, ?)`
    );
    const updateKey = db.prepare(
      `UPDATE apartment_keys
       SET is_in_lobby = ?
       WHERE id = ?`
    );

    const tx = db.transaction(() => {
      const result = updateKey.run(isInLobby, apartmentKeyId);
      if (result.changes === 0) {
        throw new Error("KEY_NOT_FOUND");
      }
      insertHistory.run(
        apartmentKeyId,
        isInLobby,
        residentId,
        lobbyistName,
        comment
      );
    });
    tx();
  } catch (e) {
    if ((e as Error).message === "KEY_NOT_FOUND") {
      return fail("המפתח לא נמצא");
    }
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("דייר לא חוקי");
    }
    throw e;
  }

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

export async function deleteKeyEvent(
  _prev: LogKeyEventState,
  formData: FormData
): Promise<LogKeyEventState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  try {
    const tx = db.transaction(() => {
      const row = db
        .prepare(
          "SELECT apartment_key_id FROM apartment_keys_history WHERE id = ?"
        )
        .get(id) as { apartment_key_id: number } | undefined;

      if (!row) throw new Error("EVENT_NOT_FOUND");
      const keyId = row.apartment_key_id;

      db.prepare("DELETE FROM apartment_keys_history WHERE id = ?").run(id);

      // Reconcile the key's is_in_lobby to whatever the new latest event says.
      // If no events remain for this key, leave the flag as-is.
      const latest = db
        .prepare(
          `SELECT is_in_lobby FROM apartment_keys_history
           WHERE apartment_key_id = ?
           ORDER BY id DESC LIMIT 1`
        )
        .get(keyId) as { is_in_lobby: number } | undefined;

      if (latest) {
        db.prepare(
          "UPDATE apartment_keys SET is_in_lobby = ? WHERE id = ?"
        ).run(latest.is_in_lobby, keyId);
      }
    });
    tx();
  } catch (e) {
    if ((e as Error).message === "EVENT_NOT_FOUND") {
      return fail("האירוע לא נמצא");
    }
    throw e;
  }

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}
