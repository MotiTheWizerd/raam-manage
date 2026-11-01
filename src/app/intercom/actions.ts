"use server";

import { spawn } from "node:child_process";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { INTERCOM_PANELS } from "@/lib/intercom";
import {
  endIntercomCall,
  getAutoOpen,
  openLiveCall,
  setAutoOpen,
  type AutoOpen,
} from "@/lib/intercom-calls";
import { openPanelDoor } from "@/lib/intercom-control";

export type IntercomOpenResult = { ok: boolean; error?: string };

// Any logged-in staff may open — same policy as the door and gate buttons.
// Every attempt lands in door_events (source "intercom"). From the call popup
// (`endCall`), while that door is calling, it opens and then hangs the lobby
// tablet up — the lobby's usual call: it rings, nobody answers, 🔑, hang up so
// the tablet doesn't keep ringing. Otherwise the panel's own lock just opens.
export async function openIntercomDoor(
  camId: string,
  opts?: { endCall?: boolean }
): Promise<IntercomOpenResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const panel = INTERCOM_PANELS.find((p) => p.camId === camId);
  const cam = FLEET_CAMERAS.find((c) => c.id === camId);
  if (!panel || !cam) return { ok: false, error: "עמדה לא מוכרת" };

  let ok = false;
  let viaCall: boolean | null = null;
  let error: string | undefined;
  try {
    viaCall = opts?.endCall ? await openLiveCall(camId) : null;
    ok = viaCall ?? (await openPanelDoor(panel.host, cam.user, cam.pass));
  } catch (e) {
    error = e instanceof Error ? e.message : "תקלת תקשורת לעמדה";
  }

  try {
    db.prepare(
      `INSERT INTO door_events (door_id, door_name, lobbyist_name, ok, source)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`intercom-${camId}`, panel.name, user.lobbyist_name, ok ? 1 : 0, "intercom");
  } catch {
    /* logging failure is non-fatal */
  }

  // A played call (no real call behind it) just ends in the app.
  if (ok && opts?.endCall && viaCall === null) {
    void endIntercomCall(camId, "opened").catch(() => false);
  }
  return ok ? { ok: true } : { ok: false, error: error ?? "פתיחת הדלת נכשלה" };
}

// The calls tab's פתיחה אוטומטית test switch (see lib/intercom-calls.ts).
export async function setIntercomAutoOpen(
  on: boolean
): Promise<{ ok: boolean; autoOpen: AutoOpen | null }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, autoOpen: getAutoOpen() };
  return { ok: true, autoOpen: setAutoOpen(on, user.lobbyist_name) };
}

// The call popup's hang-up: ends the panel's call without opening (the tablet
// stops ringing too).
export async function hangUpIntercomCall(camId: string): Promise<IntercomOpenResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };
  const ok = await endIntercomCall(camId, "hangup").catch(() => false);
  return ok ? { ok: true } : { ok: false, error: "הניתוק לא הצליח" };
}

// Testing aid: a call from the chosen panel, played by vision/intercom/replay_call.py
// — the popup and the openings list react as to a real one, marked סימולציה.
// It only writes events; the door is never touched.
export async function simulateIntercomCall(
  camId: string,
  answered: boolean
): Promise<IntercomOpenResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const panel = INTERCOM_PANELS.find((p) => p.camId === camId);
  if (!panel) return { ok: false, error: "עמדה לא מוכרת" };

  const vision = path.join(process.cwd(), "vision");
  const args = ["intercom/replay_call.py", panel.host.split(".").pop()!];
  if (!answered) args.push("--no-open", "--ring", "30");
  const started = await new Promise<boolean>((resolve) => {
    // pythonw: no console window (a detached python.exe pops a terminal open).
    const child = spawn(path.join(vision, ".venv", "Scripts", "pythonw.exe"), args, {
      cwd: vision,
      detached: true,
      stdio: "ignore",
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
    child.once("error", () => resolve(false));
  });
  return started ? { ok: true } : { ok: false, error: "הסימולציה לא הופעלה" };
}
