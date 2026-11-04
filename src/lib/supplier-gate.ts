import "server-only";

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fetchCameraSnapshot } from "./camera";
import { db } from "./db";
import { getFleetCamera } from "./fleet-cameras";

// Watches the supplier-yard boom gate (רחבת ספקים) through camera 114 and logs
// every opening to supplier_parking_gate. Watch only — it never moves the gate
// (a heavy iron gate that doesn't stop once started; Moti's rule).
//
// How it sees the gate: the gate is a diamond mesh in the top-left corner of
// the 1920x1080 frame. Closed, the mesh is a dense grid of small edges; open,
// that patch is smooth wall and ramp. The gate rolls up into the ceiling, so a
// half-closed gate still shows mesh at the top — only the band near the floor
// says it's really shut. Measured on two full cycles (2026-11-02): closed reads
// top ~17.5 / bottom ~19, fully open ~10.5 / ~10, the ~22 s of travel between.
// The camera's clock overlay crosses rows 55-100, so those rows are skipped.
//
// The light changes the scores (checked on every logged photo, 2026-11-04).
// Dim (evening, night, dawn — the patch's mean grey ~77-90): closed reads top
// 15.3-17 / bottom 16.5-17.7, open or moving top <= 14.3 / bottom <= 13. The
// first lines (16 / 17) sat right on the closed scores, so noise logged false
// openings; dim light now uses lines in the middle of that gap. Bright day
// (mean grey ~115-180) keeps the first lines: there an open gate's sunlit
// paving can score as high as the mesh, so no line separates them — except
// that a bottom band this strong is always the mesh itself.

const CAM_ID = "net-114";
const POLL_MS = 3000;
const GATE_X: [number, number] = [410, 580];
const TOP_BAND: [number, number] = [0, 55];
const BOTTOM_BAND: [number, number] = [100, 150];
const DIM_BELOW = 100; // mean grey of the gate patch
const DIM_CLOSED_TOP = 13;
const DIM_CLOSED_BOTTOM = 15;
const DAY_CLOSED_TOP = 16;
const DAY_CLOSED_BOTTOM = 17;
const MESH_SURE_BOTTOM = 30;
// "Not closed" must hold this long before it counts as an opening (a blip or
// someone walking past never logs a row; a real opening always passes).
const OPEN_CONFIRM_MS = 6000;
// Closed must hold this long (two reads) before the opening is closed off.
const CLOSE_CONFIRM_MS = 3000;
// Whoever's screen polled within this window is taken as the lobbyist on shift.
const VIEWER_FRESH_MS = 2 * 60_000;
const PHOTO_RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 60 * 60_000;

const DIR = path.join(process.cwd(), "data", "supplier-gate-photos");

type GateState = {
  openId: number | null; // the open row, while the gate is open
  openSince: number | null; // ms, first "not closed" read of that opening
  // A lobbyist marked the open row a false positive ('בטל'): the strip hides
  // it, but it's still tracked until the camera reads closed, so it can't
  // reopen as a new row while the camera stays confused.
  openFalse: boolean;
  notClosedSince: number | null; // pending opening (not yet confirmed)
  closedSince: number | null; // pending close (not yet confirmed)
  viewer: { name: string; at: number } | null;
  lastPrune: number;
};

declare global {
  var __raamSupplierGate: GateState | undefined;
  var __raamSupplierGateTimer: boolean | undefined;
}

function state(): GateState {
  if (!globalThis.__raamSupplierGate) {
    // Resume an opening that was still open when the server stopped.
    const open = db
      .prepare(
        `SELECT id, opened_at, false_positive FROM supplier_parking_gate
          WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1`
      )
      .get() as { id: number; opened_at: string; false_positive: number } | undefined;
    globalThis.__raamSupplierGate = {
      openId: open?.id ?? null,
      openSince: open ? Date.parse(open.opened_at.replace(" ", "T") + "Z") : null,
      openFalse: open?.false_positive === 1,
      notClosedSince: null,
      closedSince: null,
      viewer: null,
      lastPrune: 0,
    };
  }
  return globalThis.__raamSupplierGate;
}

// SQLite CURRENT_TIMESTAMP format, UTC — same as the other tables.
function sqlTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

// Mean edge strength (sum of horizontal + vertical neighbour differences) of a
// band of the gate patch, on the greyscale frame.
function bandScore(
  pixels: Buffer,
  width: number,
  [y0, y1]: [number, number]
): number {
  const [x0, x1] = GATE_X;
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1 - 1; y++) {
    for (let x = x0; x < x1 - 1; x++) {
      const p = pixels[y * width + x];
      sum += Math.abs(pixels[y * width + x + 1] - p) + Math.abs(pixels[(y + 1) * width + x] - p);
      n++;
    }
  }
  return n ? sum / n : 0;
}

async function readGate(): Promise<{ closed: boolean; jpeg: Buffer } | null> {
  const cam = getFleetCamera(CAM_ID);
  if (!cam) return null;
  const buf = await fetchCameraSnapshot(cam).catch(() => null);
  if (!buf) return null;
  const jpeg = Buffer.from(buf);
  const { data, info } = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width < GATE_X[1] || info.height < BOTTOM_BAND[1]) return null;
  const top = bandScore(data, info.width, TOP_BAND);
  const bottom = bandScore(data, info.width, BOTTOM_BAND);
  const dim = patchBrightness(data, info.width) < DIM_BELOW;
  const closed =
    bottom >= MESH_SURE_BOTTOM ||
    (dim
      ? top >= DIM_CLOSED_TOP && bottom >= DIM_CLOSED_BOTTOM
      : top >= DAY_CLOSED_TOP && bottom >= DAY_CLOSED_BOTTOM);
  return { closed, jpeg };
}

// Mean grey of the whole gate patch (both bands and the clock strip between).
function patchBrightness(pixels: Buffer, width: number): number {
  const [x0, x1] = GATE_X;
  let sum = 0;
  for (let y = TOP_BAND[0]; y < BOTTOM_BAND[1]; y++) {
    for (let x = x0; x < x1; x++) sum += pixels[y * width + x];
  }
  return sum / ((BOTTOM_BAND[1] - TOP_BAND[0]) * (x1 - x0));
}

function savePhoto(jpeg: Buffer, at: number, kind: "open" | "close"): string | null {
  try {
    const day = sqlTime(at).slice(0, 10);
    fs.mkdirSync(path.join(DIR, day), { recursive: true });
    const rel = path.join(day, `${sqlTime(at).slice(11).replaceAll(":", "")}-${kind}.jpg`);
    fs.writeFileSync(path.join(DIR, rel), jpeg);
    return rel.replaceAll("\\", "/");
  } catch {
    return null;
  }
}

function prunePhotos(now: number) {
  const cutoff = sqlTime(now - PHOTO_RETENTION_DAYS * 86_400_000).slice(0, 10);
  try {
    for (const day of fs.readdirSync(DIR)) {
      if (day < cutoff) fs.rmSync(path.join(DIR, day), { recursive: true, force: true });
    }
  } catch {
    /* no photos yet */
  }
}

async function tick() {
  const s = state();
  const now = Date.now();
  if (now - s.lastPrune > PRUNE_INTERVAL_MS) {
    s.lastPrune = now;
    prunePhotos(now);
  }

  // Camera unreachable → we don't know; keep the last state as it is.
  const read = await readGate();
  if (!read) return;

  if (s.openId === null) {
    if (read.closed) {
      s.notClosedSince = null;
      return;
    }
    s.notClosedSince ??= now;
    if (now - s.notClosedSince < OPEN_CONFIRM_MS) return;

    const viewer = s.viewer && now - s.viewer.at < VIEWER_FRESH_MS ? s.viewer.name : "";
    const info = db
      .prepare(
        `INSERT INTO supplier_parking_gate (opened_at, lobbyist_name, open_photo)
         VALUES (?, ?, ?)`
      )
      .run(sqlTime(s.notClosedSince), viewer, savePhoto(read.jpeg, now, "open"));
    s.openId = Number(info.lastInsertRowid);
    s.openSince = s.notClosedSince;
    s.openFalse = false;
    s.notClosedSince = null;
    console.log(`[supplier-gate] opened (row ${s.openId}, ${viewer || "no lobbyist"})`);
    return;
  }

  if (!read.closed) {
    s.closedSince = null;
    return;
  }
  s.closedSince ??= now;
  if (now - s.closedSince < CLOSE_CONFIRM_MS) return;

  const durationSec = Math.round((s.closedSince - (s.openSince ?? s.closedSince)) / 1000);
  db.prepare(
    `UPDATE supplier_parking_gate SET closed_at = ?, duration_sec = ?, close_photo = ? WHERE id = ?`
  ).run(sqlTime(s.closedSince), durationSec, savePhoto(read.jpeg, now, "close"), s.openId);
  console.log(`[supplier-gate] closed (row ${s.openId}, ${durationSec}s)`);
  s.openId = null;
  s.openSince = null;
  s.openFalse = false;
  s.closedSince = null;
}

// 'בטל' on the strip: this opening was the camera's mistake. Only the open row
// can be marked, so a stale screen can't mark a later, real opening.
export function markGateFalsePositive(id: number): boolean {
  const s = state();
  if (s.openId !== id) return false;
  db.prepare(`UPDATE supplier_parking_gate SET false_positive = 1 WHERE id = ?`).run(id);
  s.openFalse = true;
  console.log(`[supplier-gate] row ${id} marked false positive`);
  return true;
}

// Every screen polls the gate state; the most recent one names the lobbyist
// (one lobbyist works a shift, on the lobby PC).
export function noteGateViewer(name: string): void {
  if (name) state().viewer = { name, at: Date.now() };
}

export type SupplierGateRow = {
  id: number;
  opened_at: string; // UTC, SQLite format
  closed_at: string | null;
  duration_sec: number | null;
  lobbyist_name: string;
  open_photo: string | null;
  close_photo: string | null;
};

export function listSupplierGateLog(limit = 200): SupplierGateRow[] {
  return db
    .prepare(
      `SELECT * FROM supplier_parking_gate WHERE false_positive = 0 ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as SupplierGateRow[];
}

const PHOTO_NAME = /^\d{4}-\d{2}-\d{2}\/\d{6}-(open|close)\.jpg$/;

export function readGatePhoto(name: string): Buffer | null {
  if (!PHOTO_NAME.test(name)) return null;
  try {
    return fs.readFileSync(path.join(DIR, name));
  } catch {
    return null;
  }
}

export function getSupplierGate(): { open: boolean; since: number | null; id: number | null } {
  const s = state();
  const open = s.openId !== null && !s.openFalse;
  return { open, since: open ? s.openSince : null, id: open ? s.openId : null };
}

// Idempotent — globalThis guard survives Turbopack HMR so we never stack timers.
export function startSupplierGateWatcher(): void {
  // Dev (:3001) and prod (:3000) share raam.db — only prod watches, or every
  // opening would be logged twice.
  if (process.env.NODE_ENV !== "production") return;
  if (globalThis.__raamSupplierGateTimer) return;
  globalThis.__raamSupplierGateTimer = true;

  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      console.error("[supplier-gate] tick error:", e);
    }
    setTimeout(loop, POLL_MS);
  };
  void loop();
  console.log(`[supplier-gate] started (cam=${CAM_ID}, poll=${POLL_MS}ms)`);
}
