"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ResidentFormState = { error?: string; submittedAt?: number };

type PhoneInput = {
  number: unknown;
  label?: unknown;
  comment?: unknown;
  is_primary?: unknown;
};

type CleanedPhone = {
  number: string;
  label: string | null;
  comment: string | null;
  is_primary: 0 | 1;
};

type ParsedFields = {
  apartment_id: number;
  first_name: string;
  last_name: string;
  id_number: string | null;
  po_box: string | null;
  type: "owner" | "renter";
  notes: string | null;
  phones: CleanedPhone[];
};

function parseFields(formData: FormData): ParsedFields | { error: string } {
  const first_name = String(formData.get("first_name") ?? "").trim();
  const last_name = String(formData.get("last_name") ?? "").trim();
  const apartmentIdRaw = String(formData.get("apartment_id") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const id_number = String(formData.get("id_number") ?? "").trim() || null;
  const po_box = String(formData.get("po_box") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!first_name) return { error: "שם פרטי נדרש" };
  if (!last_name) return { error: "שם משפחה נדרש" };
  if (!apartmentIdRaw) return { error: "יש לבחור דירה" };
  if (type !== "owner" && type !== "renter") return { error: "סוג לא חוקי" };

  const apartment_id = parseInt(apartmentIdRaw, 10);
  if (Number.isNaN(apartment_id)) return { error: "דירה לא חוקית" };

  let rawPhones: PhoneInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("phones") ?? "[]"));
    if (Array.isArray(parsed)) rawPhones = parsed;
  } catch {
    rawPhones = [];
  }

  const phones: CleanedPhone[] = rawPhones
    .map((p) => ({
      number: typeof p.number === "string" ? p.number.trim() : "",
      label:
        typeof p.label === "string" && p.label.trim() ? p.label.trim() : null,
      comment:
        typeof p.comment === "string" && p.comment.trim()
          ? p.comment.trim()
          : null,
      is_primary: (p.is_primary === true || p.is_primary === 1
        ? 1
        : 0) as 0 | 1,
    }))
    .filter((p) => p.number);

  if (phones.length > 0 && !phones.some((p) => p.is_primary)) {
    phones[0].is_primary = 1;
  }
  let foundPrimary = false;
  for (const p of phones) {
    if (p.is_primary) {
      if (foundPrimary) p.is_primary = 0;
      else foundPrimary = true;
    }
  }

  return {
    apartment_id,
    first_name,
    last_name,
    id_number,
    po_box,
    type,
    notes,
    phones,
  };
}

export async function createResident(
  _prev: ResidentFormState,
  formData: FormData
): Promise<ResidentFormState> {
  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  try {
    const insertResident = db.prepare(
      `INSERT INTO residents (apartment_id, first_name, last_name, id_number, po_box, type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
    );
    const insertPhone = db.prepare(
      `INSERT INTO phones (resident_id, number, label, comment, is_primary)
       VALUES (?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      const { id } = insertResident.get(
        parsed.apartment_id,
        parsed.first_name,
        parsed.last_name,
        parsed.id_number,
        parsed.po_box,
        parsed.type,
        parsed.notes
      ) as { id: number };
      for (const p of parsed.phones) {
        insertPhone.run(id, p.number, p.label, p.comment, p.is_primary);
      }
    });
    tx();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return { error: "דירה לא חוקית" };
    }
    throw e;
  }

  revalidatePath("/renters");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}

export async function updateResident(
  _prev: ResidentFormState,
  formData: FormData
): Promise<ResidentFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return { error: "מזהה לא חוקי" };

  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  try {
    const updateResident = db.prepare(
      `UPDATE residents
       SET apartment_id = ?, first_name = ?, last_name = ?,
           id_number = ?, po_box = ?, type = ?, notes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    const deletePhones = db.prepare(
      `DELETE FROM phones WHERE resident_id = ?`
    );
    const insertPhone = db.prepare(
      `INSERT INTO phones (resident_id, number, label, comment, is_primary)
       VALUES (?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      const result = updateResident.run(
        parsed.apartment_id,
        parsed.first_name,
        parsed.last_name,
        parsed.id_number,
        parsed.po_box,
        parsed.type,
        parsed.notes,
        id
      );
      if (result.changes === 0) {
        throw new Error("RESIDENT_NOT_FOUND");
      }
      deletePhones.run(id);
      for (const p of parsed.phones) {
        insertPhone.run(id, p.number, p.label, p.comment, p.is_primary);
      }
    });
    tx();
  } catch (e) {
    if ((e as Error).message === "RESIDENT_NOT_FOUND") {
      return { error: "הדייר לא נמצא" };
    }
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return { error: "דירה לא חוקית" };
    }
    throw e;
  }

  revalidatePath("/renters");
  revalidatePath(`/renters/${id}`);
  revalidatePath("/");
  return { submittedAt: Date.now() };
}
