"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type UserFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): UserFormState {
  return { error, errorAt: Date.now() };
}

export type LobbyistOption = {
  id: number;
  lobbyist_name: string;
};

export async function getActiveLobbyists(): Promise<LobbyistOption[]> {
  return db
    .prepare(
      `SELECT id, lobbyist_name
       FROM users
       WHERE is_active = 1
       ORDER BY lobbyist_name`
    )
    .all() as LobbyistOption[];
}

export async function createUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const lobbyistName = String(formData.get("lobbyist_name") ?? "").trim();
  if (!lobbyistName) return fail("שם נדרש");

  db.prepare(
    `INSERT INTO users (lobbyist_name, is_active) VALUES (?, 1)`
  ).run(lobbyistName);

  revalidatePath("/users");
  return { submittedAt: Date.now() };
}

export async function updateUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const lobbyistName = String(formData.get("lobbyist_name") ?? "").trim();
  if (!lobbyistName) return fail("שם נדרש");

  const isActiveRaw = String(formData.get("is_active") ?? "").trim();
  const isActive = isActiveRaw === "1" ? 1 : 0;

  const result = db
    .prepare(
      `UPDATE users SET lobbyist_name = ?, is_active = ? WHERE id = ?`
    )
    .run(lobbyistName, isActive, id);

  if (result.changes === 0) return fail("הסדרן לא נמצא");

  revalidatePath("/users");
  return { submittedAt: Date.now() };
}
