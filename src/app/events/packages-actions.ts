"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type PackageFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): PackageFormState {
  return { error, errorAt: Date.now() };
}

export type PackageType = "package" | "envelope" | "laundry";
export type PackageDirection = "in" | "out";

export type PackageRow = {
  id: number;
  resident_id: number | null;
  recipient_name: string | null;
  resident_full_name: string | null;
  apartment_id: number | null;
  apartment_number: string | null;
  type: PackageType;
  direction: PackageDirection;
  delivered_by: string;
  received_by: string;
  delivered_to: string | null;
  is_delivered: number;
  comment: string | null;
  created_at: string;
  delivered_at: string | null;
};

export type PaginatedPackages = {
  rows: PackageRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_HISTORY_PAGE_SIZE = 30;

const PACKAGE_SELECT = `
  SELECT
    p.id,
    p.resident_id,
    p.recipient_name,
    CASE WHEN r.id IS NULL THEN NULL
         ELSE r.first_name || ' ' || r.last_name
    END             AS resident_full_name,
    a.id            AS apartment_id,
    a.number        AS apartment_number,
    p.type, p.direction, p.delivered_by, p.received_by, p.delivered_to,
    p.is_delivered, p.comment,
    p.created_at, p.delivered_at
  FROM packages p
  LEFT JOIN residents r ON r.id = p.resident_id
  LEFT JOIN apartments a ON a.id = r.apartment_id
`;

export async function getResidentPendingPackages(
  residentId: number
): Promise<PackageRow[]> {
  return db
    .prepare(
      `${PACKAGE_SELECT}
       WHERE p.resident_id = ? AND p.is_delivered = 0
       ORDER BY p.id DESC`
    )
    .all(residentId) as PackageRow[];
}

export async function getRecentPackages(
  residentId: number | null,
  limit: number = 10
): Promise<PackageRow[]> {
  const result = await getPackagesPage(residentId, 1, limit);
  return result.rows;
}

export async function getPackagesPage(
  residentId: number | null,
  page: number = 1,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE
): Promise<PaginatedPackages> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));

  const total = (
    residentId !== null
      ? (db
          .prepare(`SELECT COUNT(*) AS count FROM packages WHERE resident_id = ?`)
          .get(residentId) as { count: number })
      : (db
          .prepare(`SELECT COUNT(*) AS count FROM packages`)
          .get() as { count: number })
  ).count;

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  let rows: PackageRow[];
  if (residentId !== null) {
    rows = db
      .prepare(
        `${PACKAGE_SELECT}
         WHERE p.resident_id = ?
         ORDER BY p.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(residentId, safePageSize, offset) as PackageRow[];
  } else {
    rows = db
      .prepare(
        `${PACKAGE_SELECT}
         ORDER BY p.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(safePageSize, offset) as PackageRow[];
  }

  return {
    rows,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export async function createPackage(
  _prev: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  const residentIdRaw = String(formData.get("resident_id") ?? "").trim();
  const recipientNameRaw = String(formData.get("recipient_name") ?? "").trim();

  let residentId: number | null = null;
  if (residentIdRaw) {
    const parsed = parseInt(residentIdRaw, 10);
    if (Number.isNaN(parsed)) return fail("דייר לא חוקי");
    residentId = parsed;
  }
  const recipientName = recipientNameRaw || null;

  if (residentId === null && recipientName === null) {
    return fail("יש לבחור דייר או להזין שם מקבל");
  }
  if (residentId !== null && recipientName !== null) {
    // Defensive: UI should prevent this, but guard.
    return fail("ניתן לבחור דייר או טקסט חופשי, לא שניהם");
  }

  const type = String(formData.get("type") ?? "package").trim();
  if (type !== "package" && type !== "envelope" && type !== "laundry") {
    return fail("סוג לא חוקי");
  }

  const direction = String(formData.get("direction") ?? "in").trim();
  if (direction !== "in" && direction !== "out") {
    return fail("כיוון לא חוקי");
  }

  const deliveredBy =
    String(formData.get("delivered_by") ?? "").trim() || "שליח";

  const receivedBy = String(formData.get("received_by") ?? "").trim();
  if (!receivedBy) return fail("שם הפקיד שקיבל את החבילה נדרש");

  const comment = String(formData.get("comment") ?? "").trim() || null;

  try {
    db.prepare(
      `INSERT INTO packages
         (resident_id, recipient_name, type, direction, delivered_by, received_by, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      residentId,
      recipientName,
      type,
      direction,
      deliveredBy,
      receivedBy,
      comment
    );
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("דייר לא חוקי");
    }
    throw e;
  }

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

export async function markPackageDelivered(
  _prev: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("חבילה לא חוקית");

  const deliveredTo = String(formData.get("delivered_to") ?? "").trim();
  if (!deliveredTo) return fail("שם מקבל החבילה נדרש");

  const result = db
    .prepare(
      `UPDATE packages
       SET is_delivered = 1,
           delivered_to = ?,
           delivered_at = CURRENT_TIMESTAMP
       WHERE id = ? AND is_delivered = 0`
    )
    .run(deliveredTo, id);

  if (result.changes === 0) return fail("החבילה לא נמצאה או כבר נמסרה");

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

export async function deletePackage(
  _prev: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db.prepare("DELETE FROM packages WHERE id = ?").run(id);
  if (result.changes === 0) return fail("החבילה לא נמצאה");

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}
