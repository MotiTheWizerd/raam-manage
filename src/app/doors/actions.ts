"use server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDoor, unlockDoor } from "@/lib/doors";

export type OpenDoorResult = { ok: boolean; error?: string };

// `source` tags where the open came from (door_events.source): "manual" for a
// staff button, and room to grow (e.g. "face" / "guest" later).
export type OpenDoorOptions = { source?: string };

// Unlocks a door (momentary) and records it in door_events. Any logged-in user
// may open a door — it mirrors the physical button box / guard buzzer the lobby
// staff already use, same policy as the parking gates.
export async function openDoor(
  doorId: string,
  opts: OpenDoorOptions = {}
): Promise<OpenDoorResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const door = getDoor(doorId);
  if (!door) return { ok: false, error: "דלת לא מוכרת" };

  let ok = false;
  let error: string | undefined;

  try {
    const result = await unlockDoor(door);
    ok = result.ok;
    error = result.error;
  } catch (e) {
    error = e instanceof Error ? e.message : "תקלת תקשורת לבקר הדלת";
  }

  // Audit log — best-effort, must never break the open itself.
  try {
    db.prepare(
      `INSERT INTO door_events (door_id, door_name, lobbyist_name, ok, source)
       VALUES (?, ?, ?, ?, ?)`
    ).run(door.id, door.name, user.lobbyist_name, ok ? 1 : 0, opts.source ?? "manual");
  } catch {
    /* logging failure is non-fatal */
  }

  return ok ? { ok: true } : { ok: false, error: error ?? "פתיחת הדלת נכשלה" };
}
