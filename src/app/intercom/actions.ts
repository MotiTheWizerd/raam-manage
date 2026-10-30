"use server";

import { getCurrentUser } from "@/lib/auth";
import { buildDigest } from "@/lib/camera";
import { db } from "@/lib/db";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { INTERCOM_PANELS } from "@/lib/intercom";

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

// Any logged-in staff may open — same policy as the door and gate buttons.
// Every attempt lands in door_events (source "intercom").
export async function openIntercomDoor(camId: string): Promise<IntercomOpenResult> {
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

  return ok ? { ok: true } : { ok: false, error: error ?? "פתיחת הדלת נכשלה" };
}
