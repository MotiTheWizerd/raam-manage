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
  is_delivered: number;
  comment: string | null;
  created_at: string;
  delivered_at: string | null;
};

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
    p.type, p.direction, p.delivered_by, p.received_by,
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
  if (residentId !== null) {
    return db
      .prepare(
        `${PACKAGE_SELECT}
         WHERE p.resident_id = ?
         ORDER BY p.id DESC
         LIMIT ?`
      )
      .all(residentId, limit) as PackageRow[];
  }
  return db
    .prepare(
      `${PACKAGE_SELECT}
       ORDER BY p.id DESC
       LIMIT ?`
    )
    .all(limit) as PackageRow[];
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
  if (!receivedBy) return fail("שם הסדרן שקיבל את החבילה נדרש");

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

  const result = db
    .prepare(
      `UPDATE packages
       SET is_delivered = 1, delivered_at = CURRENT_TIMESTAMP
       WHERE id = ? AND is_delivered = 0`
    )
    .run(id);

  if (result.changes === 0) return fail("החבילה לא נמצאה או כבר נמסרה");

  revalidatePath("/events");
  return { submittedAt: Date.now() };
}
