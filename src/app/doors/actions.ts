"use server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getDoor,
  unlockDoor,
  holdDoorOpen as holdDoorOpenHw,
  releaseDoor as releaseDoorHw,
  getDoorWorkMode,
} from "@/lib/doors";

export type OpenDoorResult = { ok: boolean; error?: string };

// `source` tags where the open came from (door_events.source): "manual" for a
// staff button, and room to grow (e.g. "face" / "guest" later).
export type OpenDoorOptions = { source?: string };

// Best-effort audit row — must never break the door action itself.
function logDoorEvent(
  door: { id: string; name: string },
  lobbyistName: string,
  ok: boolean,
  source: string
): void {
  try {
    db.prepare(
      `INSERT INTO door_events (door_id, door_name, lobbyist_name, ok, source)
       VALUES (?, ?, ?, ?, ?)`
    ).run(door.id, door.name, lobbyistName, ok ? 1 : 0, source);
  } catch {
    /* logging failure is non-fatal */
  }
}

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

  logDoorEvent(door, user.lobbyist_name, ok, opts.source ?? "manual");

  return ok ? { ok: true } : { ok: false, error: error ?? "פתיחת הדלת נכשלה" };
}

export type DoorHoldResult = { ok: boolean; held?: boolean; error?: string };

// Latch a door OPEN until released. Same any-logged-in-staff policy as openDoor —
// the staff are right next to the door, so no manager gate / auto-timeout.
export async function holdDoorOpen(doorId: string): Promise<DoorHoldResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const door = getDoor(doorId);
  if (!door) return { ok: false, error: "דלת לא מוכרת" };

  let ok = false;
  let error: string | undefined;

  try {
    const result = await holdDoorOpenHw(door);
    ok = result.ok;
    error = result.error;
  } catch (e) {
    error = e instanceof Error ? e.message : "תקלת תקשורת לבקר הדלת";
  }

  logDoorEvent(door, user.lobbyist_name, ok, "hold-open");

  return ok ? { ok: true, held: true } : { ok: false, error: error ?? "החזקת הדלת פתוחה נכשלה" };
}

// Clear a hold → the door resumes its normal card schedule (re-locks).
export async function releaseDoorHold(doorId: string): Promise<DoorHoldResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const door = getDoor(doorId);
  if (!door) return { ok: false, error: "דלת לא מוכרת" };

  let ok = false;
  let error: string | undefined;

  try {
    const result = await releaseDoorHw(door);
    ok = result.ok;
    error = result.error;
  } catch (e) {
    error = e instanceof Error ? e.message : "תקלת תקשורת לבקר הדלת";
  }

  logDoorEvent(door, user.lobbyist_name, ok, "release");

  return ok ? { ok: true, held: false } : { ok: false, error: error ?? "שחרור הדלת נכשל" };
}

// Read-only: is the door currently latched open? Drives the held-open indicator.
export async function getDoorHold(doorId: string): Promise<DoorHoldResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const door = getDoor(doorId);
  if (!door) return { ok: false, error: "דלת לא מוכרת" };

  try {
    const result = await getDoorWorkMode(door);
    return result.ok
      ? { ok: true, held: !!result.held }
      : { ok: false, error: result.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "תקלת תקשורת לבקר הדלת" };
  }
}
