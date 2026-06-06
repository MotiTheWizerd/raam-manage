"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser, type UserRole } from "@/lib/auth";

export type UserFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): UserFormState {
  return { error, errorAt: Date.now() };
}

function parseRole(raw: unknown): UserRole {
  return raw === "manager" ? "manager" : "lobbyist";
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

  const passwordRaw = String(formData.get("password") ?? "");
  const password = passwordRaw || "1234";

  const userRole = parseRole(formData.get("user_role"));

  db.prepare(
    `INSERT INTO users (lobbyist_name, is_active, password, user_role)
     VALUES (?, 1, ?, ?)`
  ).run(lobbyistName, password, userRole);

  revalidatePath("/users");
  return { submittedAt: Date.now() };
}

export async function resetUserPassword(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const password = String(formData.get("password") ?? "").trim();
  if (!password) return fail("סיסמה לא יכולה להיות ריקה");

  const result = db
    .prepare(`UPDATE users SET password = ? WHERE id = ?`)
    .run(password, id);

  if (result.changes === 0) return fail("הפקיד לא נמצא");

  revalidatePath("/users");
  return { submittedAt: Date.now() };
}

export async function deleteUser(
  _prev: UserFormState,
  formData: FormData
): Promise<UserFormState> {
  const id = parseInt(String(formData.get("id") ?? "").trim(), 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  // Guard against locking yourself out: never delete the signed-in user…
  const current = await getCurrentUser();
  if (current?.id === id) return fail("לא ניתן למחוק את המשתמש שמחובר כעת");

  const target = db
    .prepare(`SELECT user_role FROM users WHERE id = ?`)
    .get(id) as { user_role: UserRole } | undefined;
  if (!target) return fail("הפקיד לא נמצא");

  // …and never delete the last manager (no manager left = nobody can manage).
  if (target.user_role === "manager") {
    const { c } = db
      .prepare(`SELECT COUNT(*) AS c FROM users WHERE user_role = 'manager'`)
      .get() as { c: number };
    if (c <= 1) return fail("לא ניתן למחוק את המנהל האחרון");
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);

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

  const userRole = parseRole(formData.get("user_role"));

  // Empty password field means "don't change" — preserves existing password.
  const passwordRaw = String(formData.get("password") ?? "");

  const result = passwordRaw
    ? db
        .prepare(
          `UPDATE users
           SET lobbyist_name = ?, is_active = ?, user_role = ?, password = ?
           WHERE id = ?`
        )
        .run(lobbyistName, isActive, userRole, passwordRaw, id)
    : db
        .prepare(
          `UPDATE users
           SET lobbyist_name = ?, is_active = ?, user_role = ?
           WHERE id = ?`
        )
        .run(lobbyistName, isActive, userRole, id);

  if (result.changes === 0) return fail("הפקיד לא נמצא");

  revalidatePath("/users");
  return { submittedAt: Date.now() };
}
