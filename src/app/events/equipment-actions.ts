"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type EquipmentLoanFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): EquipmentLoanFormState {
  return { error, errorAt: Date.now() };
}

export type EquipmentType = "chairs" | "tables" | "cart";

export type EquipmentLoanRow = {
  id: number;
  resident_id: number | null;
  borrower_name: string | null;
  resident_full_name: string | null;
  apartment_id: number | null;
  apartment_number: string | null;
  type: EquipmentType;
  quantity: number;
  lobbyist_name: string;
  is_returned: number;
  returned_at: string | null;
  comment: string | null;
  created_at: string;
};

export type PaginatedEquipmentLoans = {
  rows: EquipmentLoanRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type EquipmentLoanStatusFilter = "all" | "open" | "returned";

function statusClause(s: EquipmentLoanStatusFilter): string {
  if (s === "open") return "el.is_returned = 0";
  if (s === "returned") return "el.is_returned = 1";
  return "1=1";
}

const DEFAULT_HISTORY_PAGE_SIZE = 30;

const LOAN_SELECT = `
  SELECT
    el.id,
    el.resident_id,
    el.borrower_name,
    CASE WHEN r.id IS NULL THEN NULL
         ELSE r.first_name || ' ' || r.last_name
    END             AS resident_full_name,
    a.id            AS apartment_id,
    a.number        AS apartment_number,
    el.type, el.quantity, el.lobbyist_name,
    el.is_returned, el.returned_at, el.comment, el.created_at
  FROM equipment_loans el
  LEFT JOIN residents r ON r.id = el.resident_id
  LEFT JOIN apartments a ON a.id = r.apartment_id
`;

export type EquipmentLoansStats = {
  totalOpen: number;
  uniqueResidents: number;
};

export async function getEquipmentLoansStats(): Promise<EquipmentLoansStats> {
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count FROM equipment_loans WHERE is_returned = 0`
    )
    .get() as { count: number };
  const residentsRow = db
    .prepare(
      `SELECT COUNT(DISTINCT resident_id) AS count
       FROM equipment_loans
       WHERE is_returned = 0 AND resident_id IS NOT NULL`
    )
    .get() as { count: number };
  return {
    totalOpen: totalRow.count,
    uniqueResidents: residentsRow.count,
  };
}

export async function getResidentOpenLoans(
  residentId: number
): Promise<EquipmentLoanRow[]> {
  return db
    .prepare(
      `${LOAN_SELECT}
       WHERE el.resident_id = ? AND el.is_returned = 0
       ORDER BY el.id DESC`
    )
    .all(residentId) as EquipmentLoanRow[];
}

export async function searchEquipmentLoans(
  rawQuery: string,
  limit: number = 50,
  status: EquipmentLoanStatusFilter = "all"
): Promise<EquipmentLoanRow[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const like = `%${q}%`;
  return db
    .prepare(
      `${LOAN_SELECT}
       WHERE (a.number LIKE ?
          OR (r.first_name || ' ' || r.last_name) LIKE ?
          OR el.borrower_name LIKE ?)
          AND ${statusClause(status)}
       ORDER BY el.id DESC
       LIMIT ?`
    )
    .all(like, like, like, limit) as EquipmentLoanRow[];
}

export async function getEquipmentLoansPage(
  residentId: number | null,
  page: number = 1,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE,
  status: EquipmentLoanStatusFilter = "all"
): Promise<PaginatedEquipmentLoans> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));
  const where = statusClause(status);

  const total = (
    residentId !== null
      ? (db
          .prepare(
            `SELECT COUNT(*) AS count FROM equipment_loans el
             WHERE el.resident_id = ? AND ${where}`
          )
          .get(residentId) as { count: number })
      : (db
          .prepare(
            `SELECT COUNT(*) AS count FROM equipment_loans el WHERE ${where}`
          )
          .get() as { count: number })
  ).count;

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  let rows: EquipmentLoanRow[];
  if (residentId !== null) {
    rows = db
      .prepare(
        `${LOAN_SELECT}
         WHERE el.resident_id = ? AND ${where}
         ORDER BY el.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(residentId, safePageSize, offset) as EquipmentLoanRow[];
  } else {
    rows = db
      .prepare(
        `${LOAN_SELECT}
         WHERE ${where}
         ORDER BY el.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(safePageSize, offset) as EquipmentLoanRow[];
  }

  return {
    rows,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export async function createEquipmentLoan(
  _prev: EquipmentLoanFormState,
  formData: FormData
): Promise<EquipmentLoanFormState> {
  const residentIdRaw = String(formData.get("resident_id") ?? "").trim();
  const borrowerNameRaw = String(formData.get("borrower_name") ?? "").trim();

  let residentId: number | null = null;
  if (residentIdRaw) {
    const parsed = parseInt(residentIdRaw, 10);
    if (Number.isNaN(parsed)) return fail("דייר לא חוקי");
    residentId = parsed;
  }
  const borrowerName = borrowerNameRaw || null;

  if (residentId === null && borrowerName === null) {
    return fail("יש לבחור דייר או להזין שם משאיל");
  }
  if (residentId !== null && borrowerName !== null) {
    return fail("ניתן לבחור דייר או טקסט חופשי, לא שניהם");
  }

  const type = String(formData.get("type") ?? "chairs").trim();
  if (type !== "chairs" && type !== "tables" && type !== "cart") {
    return fail("סוג לא חוקי");
  }

  const quantityRaw = String(formData.get("quantity") ?? "1").trim();
  const quantity = parseInt(quantityRaw, 10);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return fail("כמות לא חוקית");
  }

  const lobbyistName = String(formData.get("lobbyist_name") ?? "").trim();
  if (!lobbyistName) return fail("שם הפקיד נדרש");

  const comment = String(formData.get("comment") ?? "").trim() || null;

  try {
    db.prepare(
      `INSERT INTO equipment_loans
         (resident_id, borrower_name, type, quantity, lobbyist_name, comment)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(residentId, borrowerName, type, quantity, lobbyistName, comment);
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("דייר לא חוקי");
    }
    throw e;
  }

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

export async function markEquipmentReturned(
  _prev: EquipmentLoanFormState,
  formData: FormData
): Promise<EquipmentLoanFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("השאלה לא חוקית");

  const result = db
    .prepare(
      `UPDATE equipment_loans
       SET is_returned = 1,
           returned_at = CURRENT_TIMESTAMP
       WHERE id = ? AND is_returned = 0`
    )
    .run(id);

  if (result.changes === 0) return fail("ההשאלה לא נמצאה או כבר הוחזרה");

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

export async function deleteEquipmentLoan(
  _prev: EquipmentLoanFormState,
  formData: FormData
): Promise<EquipmentLoanFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db.prepare("DELETE FROM equipment_loans WHERE id = ?").run(id);
  if (result.changes === 0) return fail("ההשאלה לא נמצאה");

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}
