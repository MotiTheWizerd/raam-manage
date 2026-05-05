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
  revalidatePath("/");
  return { submittedAt: Date.now() };
}
