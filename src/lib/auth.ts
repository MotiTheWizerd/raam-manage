import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";

const COOKIE_NAME = "raam_session";

export type UserRole = "lobbyist" | "manager";

export type CurrentUser = {
  id: number;
  lobbyist_name: string;
  user_role: UserRole;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) return null;

  const row = db
    .prepare(
      `SELECT id, lobbyist_name, user_role
       FROM users
       WHERE id = ? AND is_active = 1`
    )
    .get(id) as CurrentUser | undefined;

  return row ?? null;
});

export async function setSessionCookie(userId: number): Promise<void> {
  const cookieStore = await cookies();
  // No maxAge/expires → session cookie (dies when browser closes).
  cookieStore.set(COOKIE_NAME, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isManager(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.user_role === "manager";
}
