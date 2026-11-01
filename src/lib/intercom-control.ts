import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { buildDigest } from "@/lib/camera";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { INTERCOM_PANELS } from "@/lib/intercom";

// A door panel's call state, and ending its call from our side — the call runs
// panel ↔ lobby tablet, so when the panel ends it the tablet stops too. The
// panel lists these in /ISAPI/VideoIntercom/callSignal/capabilities (cmdType
// answer / reject / cancel / hangUp, …) and reports idle / ring / onCall at
// /ISAPI/VideoIntercom/callStatus. Written blind on 2026-11-01 (nobody calls at
// night to test with), so every request and the panel's answer goes to
// logs/intercom-control.jsonl, to read after the first real call.

const LOG = path.join(process.cwd(), "logs", "intercom-control.jsonl");
const STATUS_PATH = "/ISAPI/VideoIntercom/callStatus?format=json";
const SIGNAL_JSON_PATH = "/ISAPI/VideoIntercom/callSignal?format=json";
const SIGNAL_XML_PATH = "/ISAPI/VideoIntercom/callSignal";

export type PanelCallStatus = "idle" | "ring" | "onCall";
const STATUSES = new Set<string>(["idle", "ring", "onCall"]);

type Panel = { camId: string; host: string; user: string; pass: string };

function panelFor(camId: string): Panel | null {
  const panel = INTERCOM_PANELS.find((p) => p.camId === camId);
  const cam = FLEET_CAMERAS.find((c) => c.id === camId);
  return panel && cam ? { camId, host: panel.host, user: cam.user, pass: cam.pass } : null;
}

export async function logControl(entry: Record<string, unknown>) {
  try {
    await fs.appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* logging is best-effort */
  }
}

// One ISAPI request with the digest handshake (the panel answers 401 first).
async function isapi(
  p: Panel,
  method: "GET" | "PUT",
  reqPath: string,
  body?: string,
  contentType?: string
): Promise<{ status: number; text: string }> {
  const url = `http://${p.host}${reqPath}`;
  const headers: Record<string, string> = contentType ? { "Content-Type": contentType } : {};
  const init = { method, cache: "no-store" as const, body };
  const challenge = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(4000) });
  const wwwAuth = challenge.headers.get("www-authenticate");
  if (challenge.status !== 401 || !wwwAuth) {
    return { status: challenge.status, text: await challenge.text() };
  }
  await challenge.body?.cancel();
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, Authorization: buildDigest(wwwAuth, reqPath, p.user, p.pass, method) },
    signal: AbortSignal.timeout(4000),
  });
  return { status: res.status, text: await res.text() };
}

async function statusOf(p: Panel): Promise<PanelCallStatus | null> {
  try {
    const { status, text } = await isapi(p, "GET", STATUS_PATH);
    if (status !== 200) return null;
    const s = (JSON.parse(text) as { CallStatus?: { status?: string } }).CallStatus?.status;
    return s && STATUSES.has(s) ? (s as PanelCallStatus) : null;
  } catch {
    return null;
  }
}

export async function readPanelCallStatus(camId: string): Promise<PanelCallStatus | null> {
  const p = panelFor(camId);
  return p ? statusOf(p) : null;
}

const accepted = (text: string) => /"statusCode"\s*:\s*1\b|<statusCode>1</i.test(text);

// One call command: the panel's JSON form first, the XML form if that's refused.
async function signal(p: Panel, cmd: string): Promise<boolean> {
  const tries = [
    {
      format: "json",
      path: SIGNAL_JSON_PATH,
      type: "application/json",
      body: JSON.stringify({ CallSignal: { cmdType: cmd } }),
    },
    {
      format: "xml",
      path: SIGNAL_XML_PATH,
      type: "application/xml",
      body: `<CallSignal version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmdType>${cmd}</cmdType></CallSignal>`,
    },
  ];
  for (const t of tries) {
    try {
      const { status, text } = await isapi(p, "PUT", t.path, t.body, t.type);
      const ok = status === 200 && accepted(text);
      await logControl({ camId: p.camId, step: "signal", cmd, format: t.format, http: status, ok, reply: text.slice(0, 400) });
      if (ok) return true;
    } catch (e) {
      await logControl({ camId: p.camId, step: "signal", cmd, format: t.format, error: String(e) });
    }
  }
  return false;
}

// End the panel's call: cancel while it rings (the panel is the caller), hang up
// once answered. Stops at the first command the panel accepts and that leaves
// it no longer ringing / on a call. True if the panel accepted one.
export async function endPanelCall(camId: string, reason: string): Promise<boolean> {
  const p = panelFor(camId);
  if (!p) return false;
  const before = await statusOf(p);
  await logControl({ camId, step: "end", reason, status: before });
  const cmds =
    before === "ring" ? ["cancel", "hangUp", "reject"] : before === "onCall" ? ["hangUp"] : ["hangUp", "cancel"];
  for (const cmd of cmds) {
    const ok = await signal(p, cmd);
    const after = await statusOf(p);
    await logControl({ camId, step: "after", cmd, ok, status: after });
    if (ok && after !== "ring" && after !== "onCall") return true;
  }
  return false;
}
