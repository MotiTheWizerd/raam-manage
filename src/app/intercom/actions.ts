"use server";

import { spawn } from "node:child_process";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { buildDigest } from "@/lib/camera";
import { db } from "@/lib/db";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { INTERCOM_PANELS } from "@/lib/intercom";
import { endIntercomCall } from "@/lib/intercom-calls";

export type IntercomOpenResult = { ok: boolean; error?: string };

// The panel's own lock output (door 1) — the same momentary unlock as the key
// button on the lobby tablet. Verified live on .71 (2026-10-30): the panel
// answers OK, the door relocks by itself, and it reports a "remote unlock"
// event on its SDK alarm channel.
const DOOR_PATH = "/ISAPI/AccessControl/RemoteControl/door/1";
const OPEN_BODY =
  '<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>open</cmd></RemoteControlDoor>';

async function putOpen(host: string, user: string, pass: string): Promise<boolean> {
  const url = `http://${host}${DOOR_PATH}`;
  const init = {
    method: "PUT",
    cache: "no-store" as const,
    body: OPEN_BODY,
    signal: AbortSignal.timeout(5000),
  };
  const challenge = await fetch(url, { ...init, headers: { "Content-Type": "application/xml" } });
  if (challenge.ok) return true;
  const wwwAuth = challenge.headers.get("www-authenticate");
  if (challenge.status !== 401 || !wwwAuth) return false;

  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/xml",
      Authorization: buildDigest(wwwAuth, DOOR_PATH, user, pass, "PUT"),
    },
  });
  if (!res.ok) return false;
  return /<statusString>OK</i.test(await res.text());
}

// After our 🔑 opens during a call, the call is ended this much later, so the
// visitor isn't cut off mid-word as the door releases.
const END_AFTER_OPEN_MS = 2000;

// Any logged-in staff may open — same policy as the door and gate buttons.
// Every attempt lands in door_events (source "intercom"). From the call popup
// (`endCall`), an opening also ends the panel's call, on the tablet too.
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
  let error: string | undefined;
  try {
    ok = await putOpen(panel.host, cam.user, cam.pass);
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

  if (ok && opts?.endCall) {
    setTimeout(() => void endIntercomCall(camId, "opened").catch(() => false), END_AFTER_OPEN_MS);
  }
  return ok ? { ok: true } : { ok: false, error: error ?? "פתיחת הדלת נכשלה" };
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
  if (!answered) args.push("--no-open", "--ring", "15");
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
