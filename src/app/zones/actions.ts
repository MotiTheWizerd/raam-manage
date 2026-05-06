"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ZoneFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): ZoneFormState {
  return { error, errorAt: Date.now() };
}

export async function createZone(
  _prev: ZoneFormState,
  formData: FormData
): Promise<ZoneFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("שם אזור נדרש");

  try {
    db.prepare("INSERT INTO zones (name) VALUES (?)").run(name);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return fail("אזור עם שם זה כבר קיים");
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
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("שם אזור נדרש");

  try {
    const result = db
      .prepare("UPDATE zones SET name = ? WHERE id = ?")
      .run(name, id);
    if (result.changes === 0) return fail("האזור לא נמצא");
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return fail("אזור עם שם זה כבר קיים");
    }
    throw e;
  }

  revalidatePath("/zones");
  revalidatePath("/apartments");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}
