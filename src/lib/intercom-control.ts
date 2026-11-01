import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { buildDigest } from "@/lib/camera";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { INTERCOM_PANELS } from "@/lib/intercom";

// Opening a door and ending a call from our side. Every request and answer goes
// to logs/intercom-control.jsonl — the call parts can only be proven on a real
// call.
//
// Where a call lives (learned 2026-11-01): a visitor's call rings the lobby
// tablet (DS-KH8520, 10.0.0.248). The door panel's own ISAPI reports "idle"
// even mid-call and refuses hangUp / cancel (400 Wrong XMLcontent), so a call
// is ended — and opened, the way the tablet's 🔑 does — on the tablet, through
// the vision service's SDK session to it (vision/detection/tablet.py).

const LOG = path.join(process.cwd(), "logs", "intercom-control.jsonl");
const VISION_INTERNAL_URL = process.env.VISION_INTERNAL_URL ?? "http://127.0.0.1:8089";
// The lobbyist's 🔑 then hang-up — a beat between them so the unlock reaches
// the door before the call drops.
const HANGUP_AFTER_OPEN_MS = 1000;

// The panel's own lock output (door 1) — the same momentary unlock as the key
// button on the lobby tablet. Verified live on .71 (2026-10-30): the panel
// answers OK, the door relocks by itself, and it reports a "remote unlock"
// event on its SDK alarm channel.
const DOOR_PATH = "/ISAPI/AccessControl/RemoteControl/door/1";
const OPEN_BODY =
  '<RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>open</cmd></RemoteControlDoor>';

export async function openPanelDoor(host: string, user: string, pass: string): Promise<boolean> {
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

export async function logControl(entry: Record<string, unknown>) {
  try {
    await fs.appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* logging is best-effort */
  }
}

type TabletAction = "status" | "open" | "hangUp" | "reject";
type TabletReply = { ok: boolean; status?: string; reply?: string };

// One fixed action on the lobby tablet, logged.
async function tablet(action: TabletAction, camId: string): Promise<TabletReply> {
  let r: TabletReply;
  try {
    const res = await fetch(`${VISION_INTERNAL_URL}/intercom/tablet`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      signal: AbortSignal.timeout(8000),
    });
    r = (await res.json()) as TabletReply;
  } catch (e) {
    r = { ok: false, reply: `vision service: ${e}` };
  }
  await logControl({ camId, step: `tablet-${action}`, ...r });
  return r;
}

// End the call on the tablet — its hang-up button. reject while it still
// rings, if hangUp isn't taken. True if the tablet accepted one.
export async function endTabletCall(camId: string): Promise<boolean> {
  for (const cmd of ["hangUp", "reject"] as const) {
    if ((await tablet(cmd, camId)).ok) return true;
  }
  return false;
}

// Open the calling door during a call, as the lobbyist does: the tablet's own
// 🔑 (it opens whichever door is calling it), then hang up. If the tablet won't
// open, the panel's lock opens it instead (always worked) and the tablet is
// still hung up. True as soon as the door opened; the hang-up follows in the
// background.
export async function openDuringCall(camId: string): Promise<boolean> {
  await tablet("status", camId);
  let opened = (await tablet("open", camId)).ok;
  if (!opened) {
    const panel = INTERCOM_PANELS.find((p) => p.camId === camId);
    const cam = FLEET_CAMERAS.find((c) => c.id === camId);
    if (panel && cam) {
      opened = await openPanelDoor(panel.host, cam.user, cam.pass).catch(() => false);
      await logControl({ camId, step: "panel-open", ok: opened });
    }
  }
  if (opened) {
    setTimeout(() => void endTabletCall(camId).catch(() => false), HANGUP_AFTER_OPEN_MS);
  }
  return opened;
}
