"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import {
  closeFollowScreen,
  followScreenState,
  listScreens,
  openFollowScreen,
  type FollowScreenState,
  type Screen,
} from "@/lib/follow-screen";

// The dock's "follow wall on the camera screen" button. See lib/follow-screen.ts.

const NOT_SIGNED_IN = { ok: false as const, error: "לא מחובר" };

export async function getFollowScreen(): Promise<FollowScreenState | null> {
  if (!(await getCurrentUser())) return null;
  return followScreenState();
}

export async function getFollowScreens(): Promise<Screen[]> {
  if (!(await getCurrentUser())) return [];
  return listScreens();
}

export async function showFollowScreen(
  screenId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return NOT_SIGNED_IN;
  // The window loads from this same server, over localhost on its port.
  const host = (await headers()).get("host") ?? "";
  const port = host.split(":")[1] ?? "3000";
  try {
    return await openFollowScreen(screenId, port, user.id);
  } catch (e) {
    console.error("follow screen open failed", e);
    return { ok: false, error: "פתיחת המעקב נכשלה" };
  }
}

export async function hideFollowScreen(): Promise<{ ok: boolean; error?: string }> {
  if (!(await getCurrentUser())) return NOT_SIGNED_IN;
  return closeFollowScreen();
}
