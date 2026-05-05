"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ApartmentFormState = { error?: string; submittedAt?: number };

export async function createApartment(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
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

  try {
    db.prepare(
      "INSERT INTO apartments (number, floor, zone_id, notes) VALUES (?, ?, ?, ?)"
    ).run(number, floor, zone_id, notes);
  } catch (e) {
    const code = (e as { code?: string }).code;
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
