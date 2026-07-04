import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_SINCE_COOKIE_NAME,
} from "./session-config";

const COOKIE_NAME = SESSION_COOKIE_NAME;

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
  // Persistent cookie (not session-only) so the trusted lobby PC stays logged
  // in across browser/Windows restarts. The proxy re-stamps this lifetime on
  // every authed request (sliding refresh), so existing sessions become
  // persistent too. See session-config.ts for the why.
  cookieStore.set(COOKIE_NAME, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  // Stamp when this session began so the shift-boundary auto-logout (ShiftGuard)
  // can tell an incoming lobbyist (just logged in) from the outgoing one.
  cookieStore.set(SESSION_SINCE_COOKIE_NAME, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(SESSION_SINCE_COOKIE_NAME);
}

export async function isManager(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.user_role === "manager";
}
