"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ZoneFormState = { error?: string; submittedAt?: number };

export async function createZone(
  _prev: ZoneFormState,
  formData: FormData
): Promise<ZoneFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "שם אזור נדרש" };

  try {
    db.prepare("INSERT INTO zones (name) VALUES (?)").run(name);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { error: "אזור עם שם זה כבר קיים" };
    }
    throw e;
  }

  revalidatePath("/zones");
  revalidatePath("/apartments");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}

export async function updateZone(
  _prev: ZoneFormState,
  formData: FormData
): Promise<ZoneFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return { error: "מזהה לא חוקי" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "שם אזור נדרש" };

  try {
    const result = db
      .prepare("UPDATE zones SET name = ? WHERE id = ?")
      .run(name, id);
    if (result.changes === 0) return { error: "האזור לא נמצא" };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { error: "אזור עם שם זה כבר קיים" };
    }
    throw e;
  }

  revalidatePath("/zones");
  revalidatePath("/apartments");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}
