import "server-only";

import { buildDigest, fetchCameraSnapshot } from "@/lib/camera";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { CAMERAS, type CameraCreds } from "@/lib/gates";

// Live motion map of the building, fed by the cameras' OWN motion detection.
//
// Every Hikvision device pushes an endless event stream at
// /ISAPI/Event/notification/alertStream: a "VMD active" pulse about once a
// second while something moves, "VMD inactive" when it stops, and a
// "videoloss inactive" heartbeat every ~10s. We hold one connection per device
// (the .137 DVR covers all 32 of its channels on one) and remember when each
// camera last moved — zero video decoding on our side. Verified live s58 on
// the lobby cam (.119). Cameras with motion detection switched off simply
// never report; RTSP-only cams (no ISAPI) aren't covered here.

const ALERT_PATH = "/ISAPI/Event/notification/alertStream";
const RETRY_MS = 5000;

// Object filter: on motion, one snapshot goes to the vision service's
// POST /objects (YOLO on a single image → people / vehicles / animals).
// Throttled per camera and globally so a windy day can't pile up CPU work.
const VISION_INTERNAL_URL = process.env.VISION_INTERNAL_URL ?? "http://127.0.0.1:8089";
const CHECK_EVERY_MS = 1000;
const MAX_IN_FLIGHT = 4;
// A kind seen this recently still counts (a person may turn / step behind a pillar).
const KIND_HOLD_MS = 5000;
// Parked-car filter: a vehicle whose box overlaps one from the camera's previous
// check at least this much hasn't moved, so it doesn't count as vehicle motion.
const STILL_IOU = 0.85;

// [x1, y1, x2, y2] as fractions of the frame.
type Box = [number, number, number, number];

export const MOTION_KINDS = ["person", "vehicle", "animal"] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

type Device = CameraCreds & {
  // alert channelID -> our camera id
  channels: Map<number, string>;
};

type Burst = {
  startedAt: number;
  lastAt: number;
  checkedAt: number;
  // when each kind was last seen in this camera's snapshots
  seenAt: Partial<Record<MotionKind, number>>;
};

type MotionState = {
  started: boolean;
  bursts: Map<string, Burst>;
  creds: Map<string, CameraCreds>;
  inFlight: number;
  // Vehicle boxes from each camera's last check. Kept across bursts: a parked
  // car is still in the same spot an hour later.
  vehicleBoxes: Map<string, Box[]>;
};

// One listener per server process (survives dev hot-reloads via globalThis).
const g = globalThis as typeof globalThis & { __raamMotion?: MotionState };
const state: MotionState = (g.__raamMotion ??= {
  started: false,
  bursts: new Map(),
  creds: new Map(),
  inFlight: 0,
  vehicleBoxes: new Map(),
});
// A listener started before vehicleBoxes existed (dev hot-reload) lacks it.
state.vehicleBoxes ??= new Map();

function iou(a: Box, b: Box): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const area = (r: Box) => (r[2] - r[0]) * (r[3] - r[1]);
  return inter / (area(a) + area(b) - inter);
}

// True if any vehicle is new or has left its previous spot. With no previous
// check for this camera there's nothing to compare against, so no verdict yet
// (otherwise every parked car would count once after a restart).
function vehicleMoved(id: string, boxes: Box[]): boolean {
  const prev = state.vehicleBoxes.get(id);
  state.vehicleBoxes.set(id, boxes);
  if (!prev) return false;
  return boxes.some((b) => !prev.some((p) => iou(p, b) >= STILL_IOU));
}

// Channel number from a snapshot path (/ISAPI/Streaming/channels/2901/... -> 29).
function channelOf(cam: CameraCreds): number {
  const m = cam.path ? /channels\/(\d+)\d{2}\//.exec(cam.path) : null;
  return m ? Number(m[1]) : 1;
}

// Group every ISAPI camera by device host. Curated cameras go first so a
// shared channel (road = DVR ch29) reports under its curated id.
function buildDevices(): Device[] {
  const byHost = new Map<string, Device>();
  const add = (id: string, cam: CameraCreds) => {
    let dev = byHost.get(cam.host);
    if (!dev) {
      dev = { host: cam.host, user: cam.user, pass: cam.pass, channels: new Map() };
      byHost.set(cam.host, dev);
    }
    const ch = channelOf(cam);
    if (!dev.channels.has(ch)) dev.channels.set(ch, id);
    state.creds.set(id, cam);
  };
  for (const cam of CAMERAS) add(cam.id, cam);
  for (const cam of FLEET_CAMERAS) if (cam.rtsp === undefined) add(cam.id, cam);
  return [...byHost.values()];
}

function tag(xml: string, name: string): string | null {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? null;
}

function onAlert(dev: Device, xml: string) {
  if (tag(xml, "eventType") !== "VMD" || tag(xml, "eventState") !== "active") return;
  const ch = Number(tag(xml, "channelID") ?? tag(xml, "dynChannelID") ?? 1);
  // Single-channel cams report 1; fall back to the device's only camera.
  const id =
    dev.channels.get(ch) ?? (dev.channels.size === 1 ? [...dev.channels.values()][0] : null);
  if (!id) return;
  const now = Date.now();
  let burst = state.bursts.get(id);
  // A gap longer than a few seconds starts a new burst.
  if (burst && now - burst.lastAt < 5000) burst.lastAt = now;
  else {
    burst = { startedAt: now, lastAt: now, checkedAt: 0, seenAt: {} };
    state.bursts.set(id, burst);
  }
  if (now - burst.checkedAt >= CHECK_EVERY_MS && state.inFlight < MAX_IN_FLIGHT) {
    burst.checkedAt = now;
    void checkObjects(id, burst);
  }
}

// Snapshot the moving camera and ask the vision service what's in it.
async function checkObjects(id: string, burst: Burst) {
  const cam = state.creds.get(id);
  if (!cam) return;
  state.inFlight++;
  try {
    const jpeg = await fetchCameraSnapshot(cam);
    if (!jpeg) return;
    const res = await fetch(`${VISION_INTERNAL_URL}/objects`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: jpeg,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    const { counts, vehicles = [] } = (await res.json()) as {
      counts: Record<MotionKind, number>;
      vehicles?: Box[];
    };
    const now = Date.now();
    if (counts.person > 0) burst.seenAt.person = now;
    if (counts.animal > 0) burst.seenAt.animal = now;
    if (vehicleMoved(id, vehicles)) burst.seenAt.vehicle = now;
  } catch {
    // Camera or vision service unavailable — just no verdict this time.
  } finally {
    state.inFlight--;
  }
}

async function openStream(dev: Device): Promise<Response | null> {
  const url = `http://${dev.host}${ALERT_PATH}`;
  const challenge = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (challenge.ok) return challenge;
  await challenge.body?.cancel();
  const wwwAuth = challenge.headers.get("www-authenticate");
  if (challenge.status !== 401 || !wwwAuth) return null;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: buildDigest(wwwAuth, ALERT_PATH, dev.user, dev.pass) },
  });
  return res.ok ? res : null;
}

// Hold one device's event stream forever, reconnecting on any drop.
async function listen(dev: Device) {
  for (;;) {
    try {
      const res = await openStream(dev);
      if (res?.body) {
        const decoder = new TextDecoder();
        let buf = "";
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buf.indexOf("</EventNotificationAlert>")) !== -1) {
            onAlert(dev, buf.slice(0, end));
            buf = buf.slice(end + 25);
          }
          if (buf.length > 65536) buf = buf.slice(-8192);
        }
      }
    } catch {
      // Unreachable / dropped — retry below.
    }
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
}

// Start the listeners once, on first use.
export function ensureMotionListener() {
  if (state.started) return;
  state.started = true;
  for (const dev of buildDevices()) void listen(dev);
}

export type ActiveMotion = {
  id: string;
  startedAt: number;
  lastAt: number;
  kinds: MotionKind[];
};

// Cameras that moved within the last `windowMs`, most recent first. `kinds` =
// what was seen in its snapshots within the last few seconds.
export function getActiveMotion(windowMs = 3000): ActiveMotion[] {
  const now = Date.now();
  return [...state.bursts.entries()]
    .filter(([, b]) => now - b.lastAt <= windowMs)
    .map(([id, b]) => ({
      id,
      startedAt: b.startedAt,
      lastAt: b.lastAt,
      kinds: MOTION_KINDS.filter((k) => now - (b.seenAt[k] ?? 0) <= KIND_HOLD_MS),
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
}
