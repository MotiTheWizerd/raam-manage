import "server-only";

import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import { faceEventSnap, faceEvents, type SentryFaceEvent } from "./faces";

// Drains the face sentry's entry-event ring buffer into our own DB + disk, so
// every appearance (resident, worker, or unknown) becomes a permanent, photo-
// backed log row that survives the sentry's small in-memory buffer and restarts.
// Mirrors the gate-watcher pattern: armed once per server start, globalThis-
// guarded, anchors to the newest event so we never replay history on boot.

const POLL_MS = 3000;
const BATCH = 100;
const MAX_EVENTS = 5000; // retention cap — older rows + their snapshots are pruned
const PRUNE_INTERVAL_MS = 5 * 60_000;

const DIR = path.join(process.cwd(), "data", "face_events");

declare global {
  var __raamFaceWatcher: boolean | undefined;
  var __raamFaceWatcherLastId: number | undefined;
}

let lastPrune = 0;

function resolveKnown(label: string | null): { name: string | null; residentId: number | null } {
  if (!label) return { name: null, residentId: null };
  const row = db
    .prepare(
      `SELECT fe.resident_id AS rid,
              COALESCE(r.first_name || ' ' || r.last_name, fe.name) AS name
         FROM face_enrollments fe
         LEFT JOIN residents r ON r.id = fe.resident_id
        WHERE fe.label = ?`
    )
    .get(label) as { rid: number | null; name: string | null } | undefined;
  if (!row) return { name: null, residentId: null };
  return { name: (row.name ?? "").trim() || null, residentId: row.rid ?? null };
}

async function ingest(ev: SentryFaceEvent): Promise<void> {
  const { name, residentId } =
    ev.kind === "known" ? resolveKnown(ev.label) : { name: null, residentId: null };

  const info = db
    .prepare(
      `INSERT INTO face_events (sentry_id, cam, kind, label, name, resident_id, score, px)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ev.id, ev.cam, ev.kind, ev.label, name, residentId, ev.score, ev.px);
  const id = Number(info.lastInsertRowid);

  // Persist the snapshot named by our own row id (the sentry's id resets on its
  // restart, so it isn't a safe filename key).
  try {
    const jpeg = await faceEventSnap(ev.id);
    if (jpeg) {
      const file = `${id}.jpg`;
      fs.writeFileSync(path.join(DIR, file), jpeg);
      db.prepare(`UPDATE face_events SET image_path = ? WHERE id = ?`).run(file, id);
    }
  } catch {
    /* snapshot is best-effort — the row still stands without a photo */
  }
}

function maybePrune(): void {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  try {
    const stale = db
      .prepare(
        `SELECT id, image_path FROM face_events
          WHERE id NOT IN (SELECT id FROM face_events ORDER BY id DESC LIMIT ?)`
      )
      .all(MAX_EVENTS) as { id: number; image_path: string | null }[];
    for (const r of stale) {
      if (r.image_path) {
        try {
          fs.unlinkSync(path.join(DIR, r.image_path));
        } catch {
          /* file may already be gone */
        }
      }
    }
    db.prepare(
      `DELETE FROM face_events
        WHERE id NOT IN (SELECT id FROM face_events ORDER BY id DESC LIMIT ?)`
    ).run(MAX_EVENTS);
  } catch (e) {
    console.error("[face-watcher] prune error:", e);
  }
}

async function tick(): Promise<void> {
  // First run: anchor to the sentry's newest event so we don't replay its buffer.
  if (globalThis.__raamFaceWatcherLastId === undefined) {
    const { lastId } = await faceEvents(0, 1);
    globalThis.__raamFaceWatcherLastId = lastId;
    return;
  }

  const cursor = globalThis.__raamFaceWatcherLastId;
  const { events, lastId } = await faceEvents(cursor, BATCH);

  // The sentry restarted (its ids reset below our cursor) — re-anchor and catch
  // up on the next tick rather than missing everything until ids climb back.
  if (lastId < cursor) {
    globalThis.__raamFaceWatcherLastId = 0;
    return;
  }
  if (events.length === 0) return;

  for (const ev of events) {
    try {
      await ingest(ev);
    } catch (e) {
      console.error("[face-watcher] ingest error:", e);
    }
  }
  globalThis.__raamFaceWatcherLastId = events.reduce(
    (m, e) => Math.max(m, e.id),
    cursor
  );
  maybePrune();
}

// Idempotent — globalThis guard survives Turbopack HMR so we never stack timers.
export function startFaceWatcher(): void {
  if (globalThis.__raamFaceWatcher) return;
  globalThis.__raamFaceWatcher = true;

  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* dir may exist */
  }

  const loop = async () => {
    try {
      await tick();
    } catch {
      /* sentry may be down/restarting — try again next tick, quietly */
    }
    setTimeout(loop, POLL_MS);
  };
  void loop();

  console.log(`[face-watcher] started (poll=${POLL_MS}ms, keep=${MAX_EVENTS})`);
}
