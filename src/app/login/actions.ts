"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";

export type LoginState = {
  error?: string;
  errorAt?: number;
};

function fail(error: string): LoginState {
  return { error, errorAt: Date.now() };
}

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const idRaw = String(formData.get("user_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("משתמש לא חוקי");
  if (!password) return fail("נא להזין סיסמה");

  const row = db
    .prepare(
      `SELECT id, password FROM users WHERE id = ? AND is_active = 1`
    )
    .get(id) as { id: number; password: string | null } | undefined;

  if (!row || row.password !== password) {
    return fail("סיסמה שגויה");
  }

  await setSessionCookie(row.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
