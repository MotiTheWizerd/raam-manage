"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ApartmentFormState = { error?: string; submittedAt?: number };

type AssetInput = {
  floor: unknown;
  number: unknown;
  notes?: unknown;
};

type CleanedAsset = {
  floor: number;
  number: string;
  notes: string | null;
};

type ParsedFields = {
  number: string;
  floor: number | null;
  zone_id: number | null;
  notes: string | null;
  parking: CleanedAsset[];
  storage: CleanedAsset[];
};

function parseAssets(formData: FormData, key: string): CleanedAsset[] {
  let raw: AssetInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get(key) ?? "[]"));
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = [];
  }
  return raw
    .map((a) => ({
      floor: typeof a.floor === "number" ? a.floor : Number.NaN,
      number: typeof a.number === "string" ? a.number.trim() : "",
      notes:
        typeof a.notes === "string" && a.notes.trim() ? a.notes.trim() : null,
    }))
    .filter((a) => !Number.isNaN(a.floor) && a.number !== "");
}

function parseFields(formData: FormData): ParsedFields | { error: string } {
  const number = String(formData.get("number") ?? "").trim();
  const floorRaw = String(formData.get("floor") ?? "").trim();
  const zoneIdRaw = String(formData.get("zone_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!number) return { error: "מספר דירה נדרש" };

  let floor: number | null = null;
  if (floorRaw) {
    const parsed = parseInt(floorRaw, 10);
    if (Number.isNaN(parsed)) return { error: "קומה חייבת להיות מספר" };
    floor = parsed;
  }

  let zone_id: number | null = null;
  if (zoneIdRaw) {
    const parsed = parseInt(zoneIdRaw, 10);
    if (Number.isNaN(parsed)) return { error: "אזור לא חוקי" };
    zone_id = parsed;
  }

  const parking = parseAssets(formData, "parking");
  const storage = parseAssets(formData, "storage");

  return { number, floor, zone_id, notes, parking, storage };
}

function insertAssets(
  apartmentId: number,
  type: "parking" | "storage",
  assets: CleanedAsset[]
) {
  const stmt = db.prepare(
    `INSERT INTO apartment_assets (type, floor, number, apartment_id, notes)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const a of assets) {
    stmt.run(type, a.floor, a.number, apartmentId, a.notes);
  }
}

function assetConflictMessage(e: unknown): string | null {
  const code = (e as { code?: string }).code;
  const msg = (e as { message?: string }).message ?? "";
  if (code === "SQLITE_CONSTRAINT_UNIQUE" && msg.includes("apartment_assets")) {
    return "חניה או מחסן עם אותה קומה ומספר כבר קיימים";
  }
  return null;
}

export async function createApartment(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  try {
    const insertApt = db.prepare(
      `INSERT INTO apartments (number, floor, zone_id, notes)
       VALUES (?, ?, ?, ?) RETURNING id`
    );

    const tx = db.transaction(() => {
      const { id } = insertApt.get(
        parsed.number,
        parsed.floor,
        parsed.zone_id,
        parsed.notes
      ) as { id: number };
      insertAssets(id, "parking", parsed.parking);
      insertAssets(id, "storage", parsed.storage);
    });
    tx();
  } catch (e) {
    const code = (e as { code?: string }).code;
    const assetErr = assetConflictMessage(e);
    if (assetErr) return { error: assetErr };
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { error: "דירה עם מספר זה כבר קיימת" };
    }
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return { error: "אזור לא חוקי" };
    }
    throw e;
  }

  revalidatePath("/apartments");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}

export async function updateApartment(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return { error: "מזהה לא חוקי" };

  const parsed = parseFields(formData);
  if ("error" in parsed) return parsed;

  try {
    const updateApt = db.prepare(
      `UPDATE apartments
       SET number = ?, floor = ?, zone_id = ?, notes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    const deleteAssets = db.prepare(
      `DELETE FROM apartment_assets WHERE apartment_id = ? AND type = ?`
    );

    const tx = db.transaction(() => {
      const result = updateApt.run(
        parsed.number,
        parsed.floor,
        parsed.zone_id,
        parsed.notes,
        id
      );
      if (result.changes === 0) {
        throw new Error("APARTMENT_NOT_FOUND");
      }
      deleteAssets.run(id, "parking");
      deleteAssets.run(id, "storage");
      insertAssets(id, "parking", parsed.parking);
      insertAssets(id, "storage", parsed.storage);
    });
    tx();
  } catch (e) {
    if ((e as Error).message === "APARTMENT_NOT_FOUND") {
      return { error: "הדירה לא נמצאה" };
    }
    const code = (e as { code?: string }).code;
    const assetErr = assetConflictMessage(e);
    if (assetErr) return { error: assetErr };
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { error: "דירה עם מספר זה כבר קיימת" };
    }
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return { error: "אזור לא חוקי" };
    }
    throw e;
  }

  revalidatePath("/apartments");
  revalidatePath(`/apartments/${id}`);
  revalidatePath("/");
  return { submittedAt: Date.now() };
}
