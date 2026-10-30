import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { buildDigest, fetchCameraSnapshot } from "@/lib/camera";
import { cameraRtspUrl, hikChannel } from "@/lib/camera-rtsp";
import { FLEET_CAMERAS, fleetRtspUrl, getFleetCamera } from "@/lib/fleet-cameras";
import { CAMERAS, type CameraCreds } from "@/lib/gates";
import { INTERCOM_PANELS } from "@/lib/intercom";

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
  // motion events in this burst
  events: number;
  // when each kind was last seen — by our snapshot check or the device itself
  seenAt: Partial<Record<MotionKind, number>>;
  // ...and when the DEVICE said so (the DVR's own human/vehicle detection)
  deviceSeenAt: Partial<Record<MotionKind, number>>;
  description: string | null; // eventDescription, e.g. "Motion alarm"
  channelName: string | null; // the camera's own name, when it sends one
  holdMs: number; // extra time it stays active after its last pulse
};

// The DVR's AcuSense motion reports what it saw (<targetType>human</targetType>).
const DEVICE_TARGETS: Record<string, MotionKind> = { human: "person", vehicle: "vehicle" };

type MotionState = {
  started: boolean;
  tailing?: boolean;
  // Hosts with a running listener — kept across dev hot-reloads, so a device
  // added to the fleet starts listening without a server restart.
  listening?: Set<string>;
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
    const ch = hikChannel(cam);
    if (!dev.channels.has(ch)) dev.channels.set(ch, id);
    state.creds.set(id, cam);
  };
  for (const cam of CAMERAS) add(cam.id, cam);
  // Everything on a Hikvision device: the ISAPI cams, the intercom panels
  // (their motion comes via the SDK log) and the NVR channels (the NVR's own
  // stream). The Easy-Rtsp units have no device to listen to; the elevator
  // recorder has no web port (its motion would come via the SDK log too), so
  // it only needs creds for the object check.
  for (const cam of FLEET_CAMERAS) {
    if (cam.group === "rtsp") continue;
    if (cam.sdk !== undefined) state.creds.set(cam.id, cam);
    else add(cam.id, cam);
  }
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
  const burst = recordMotion(id, 0);
  burst.description = tag(xml, "eventDescription") ?? burst.description;
  burst.channelName = tag(xml, "channelName") ?? burst.channelName;
  // Trust the device's own classification right away: our snapshot check often
  // misses people on the DVR's dark analog feeds at night.
  const now = Date.now();
  for (const t of (tag(xml, "targetType") ?? "").split(",")) {
    const kind = DEVICE_TARGETS[t.trim()];
    if (kind) burst.seenAt[kind] = burst.deviceSeenAt[kind] = now;
  }
  maybeCheck(id, burst);
}

// One motion pulse for a camera: extend its burst or start a new one. `holdMs`
// keeps it active that much longer than the usual window (sparse reporters).
function recordMotion(id: string, holdMs: number): Burst {
  const now = Date.now();
  let burst = state.bursts.get(id);
  // A gap longer than a few seconds starts a new burst.
  if (burst && now - burst.lastAt < 5000) {
    burst.lastAt = now;
    burst.events++;
  } else {
    burst = {
      startedAt: now,
      lastAt: now,
      checkedAt: 0,
      events: 1,
      seenAt: {},
      deviceSeenAt: {},
      description: null,
      channelName: null,
      holdMs: 0,
    };
    state.bursts.set(id, burst);
  }
  burst.holdMs = holdMs;
  return burst;
}

function maybeCheck(id: string, burst: Burst) {
  const now = Date.now();
  if (now - burst.checkedAt >= CHECK_EVERY_MS && state.inFlight < MAX_IN_FLIGHT) {
    burst.checkedAt = now;
    void checkObjects(id, burst);
  }
}

// The door intercom panels don't stream alertStream; their motion arrives over
// Hik's SDK, which vision/intercom/sdk_listen.py arms and appends to a JSONL log.
// We tail that log: COMM_ALARM_V30 (0x4000) with dwAlarmType 3 = motion. The
// panels pulse every ~4s while something moves, so each pulse is held a bit
// longer than the normal window to keep the tile from flickering.
const INTERCOM_LOG = path.join(process.cwd(), "logs", "intercom-events.jsonl");
const PANEL_HOLD_MS = 4000;
const panelIds = new Map(INTERCOM_PANELS.map((p) => [p.host, p.camId]));

// The elevator recorder reports through the same listener: its events carry the
// SDK channel numbers that moved. ip -> SDK channel -> camera id.
const sdkChannelIds = new Map<string, Map<number, string>>();
for (const cam of FLEET_CAMERAS) {
  if (cam.sdk === undefined) continue;
  const ip = cam.host.split(":")[0];
  if (!sdkChannelIds.has(ip)) sdkChannelIds.set(ip, new Map());
  sdkChannelIds.get(ip)!.set(cam.sdk, cam.id);
}

function onPanelEvent(line: string) {
  let ev: { panel?: string; cmd?: string; hex?: string; channels?: number[] };
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  if (ev.cmd !== "0x4000" || !ev.hex?.startsWith("03 00 00 00")) return;
  const panel = panelIds.get(ev.panel ?? "");
  const byChannel = sdkChannelIds.get(ev.panel ?? "");
  const ids = panel
    ? [panel]
    : (ev.channels ?? []).map((ch) => byChannel?.get(ch)).filter((id): id is string => !!id);
  for (const id of ids) {
    const burst = recordMotion(id, PANEL_HOLD_MS);
    burst.description ??= "Motion alarm";
    maybeCheck(id, burst);
  }
}

// Follow the log from its current end (history isn't motion "now").
async function tailIntercomLog() {
  let pos = -1;
  let rest = "";
  for (;;) {
    try {
      const { size } = await fs.stat(INTERCOM_LOG);
      if (pos < 0 || size < pos) pos = size; // first look, or the log was reset
      if (size > pos) {
        const fh = await fs.open(INTERCOM_LOG, "r");
        try {
          const buf = Buffer.alloc(size - pos);
          await fh.read(buf, 0, buf.length, pos);
          pos = size;
          const lines = (rest + buf.toString("utf8")).split("\n");
          rest = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) onPanelEvent(line);
        } finally {
          await fh.close();
        }
      }
    } catch {
      // No log yet (listener not running) — keep looking.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// A camera whose device snapshot fails (most NVR channels) or that has none (the
// SDK-only elevators): one frame via the vision service — RTSP sub stream or
// SDK capture. Only for cameras with such a source — an unreachable ISAPI
// camera shouldn't tie up a check.
async function rtspFrame(id: string): Promise<ArrayBuffer | null> {
  const fleet = getFleetCamera(id);
  if (!fleet || fleetRtspUrl(fleet) === null) return null;
  const url = cameraRtspUrl(id, "sub");
  if (!url) return null;
  const res = await fetch(`${VISION_INTERNAL_URL}/rtsp?url=${encodeURIComponent(url)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  return res.ok ? res.arrayBuffer() : null;
}

// Snapshot the moving camera and ask the vision service what's in it.
async function checkObjects(id: string, burst: Burst) {
  const cam = state.creds.get(id);
  if (!cam) return;
  state.inFlight++;
  try {
    // SDK-only cameras have no web port to ask (it would just time out).
    const viaDevice = getFleetCamera(id)?.sdk === undefined;
    const jpeg = (viaDevice ? await fetchCameraSnapshot(cam) : null) ?? (await rtspFrame(id));
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

// This module instance has started whatever listeners were missing.
let listenersChecked = false;

// Start the listeners on first use — and, after a dev hot-reload, any device
// that's new in the fleet since.
export function ensureMotionListener() {
  // Separate flag: a listener from before the tail existed (dev hot-reload) still gets it.
  if (!state.tailing) {
    state.tailing = true;
    void tailIntercomLog();
  }
  if (listenersChecked) return;
  listenersChecked = true;
  // Started by an older module instance that kept no record of its hosts:
  // only a server restart can add devices safely (no double listeners).
  if (state.started && !state.listening) return;
  state.started = true;
  const listening = (state.listening ??= new Set());
  for (const dev of buildDevices()) {
    // Panels answer alertStream with an empty reply; they report via the SDK log.
    if (panelIds.has(dev.host) || listening.has(dev.host)) continue;
    listening.add(dev.host);
    void listen(dev);
  }
}

export type ActiveMotion = {
  id: string;
  startedAt: number;
  lastAt: number;
  kinds: MotionKind[];
  // of `kinds`, the ones the camera/DVR detected itself (the rest: our AI check)
  deviceKinds: MotionKind[];
  events: number;
  description: string | null;
  channelName: string | null;
};

// Cameras that moved within the last `windowMs`, most recent first. `kinds` =
// what was seen within the last few seconds (snapshot check or the device).
export function getActiveMotion(windowMs = 3000): ActiveMotion[] {
  const now = Date.now();
  const recent = (at?: Partial<Record<MotionKind, number>>) =>
    MOTION_KINDS.filter((k) => now - (at?.[k] ?? 0) <= KIND_HOLD_MS);
  return [...state.bursts.entries()]
    .filter(([, b]) => now - b.lastAt <= windowMs + (b.holdMs ?? 0))
    .map(([id, b]) => ({
      id,
      startedAt: b.startedAt,
      lastAt: b.lastAt,
      kinds: recent(b.seenAt),
      // a burst from before a dev hot-reload lacks the newer fields
      deviceKinds: recent(b.deviceSeenAt),
      events: b.events ?? 1,
      description: b.description ?? null,
      channelName: b.channelName ?? null,
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
}
