import "server-only";

import { db } from "./db";
import { fireGate, GATES } from "./gates";
import { normalizePlate } from "./plate";
import { querySlpr } from "./slpr-mysql";

// Auto-opens the gate for explicitly-approved guest cars (resident_guests with
// auto_open = 1) when their plate is seen at the entrance — no lobbyist needed.
//
// SHADOW MODE: while true the watcher only *logs* what it WOULD open and never
// actually fires the gate. Flip to false to go live after verifying it catches
// the right cars. This is the one verification pass an auto-gate deserves.
const SHADOW_MODE = true;

const POLL_MS = 3000;
const ENTRANCE_CAM_ID = 1; // outdoor gate camera — sees the car the instant it arrives
const PLATE_COOLDOWN_MS = 2 * 60_000; // never re-open for the same plate within 2 min

declare global {
  var __raamGateWatcher: boolean | undefined;
  var __raamGateWatcherLastId: number | undefined;
}

const lastOpenedByPlate = new Map<string, number>();

type LogRow = { ID: string | null; LP: string | null };

function logGateEvent(
  gateId: string,
  gateName: string,
  who: string,
  ok: boolean,
  source: string,
  plate: string
) {
  try {
    db.prepare(
      `INSERT INTO gate_events (gate_id, gate_name, lobbyist_name, ok, source, plate)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(gateId, gateName, who, ok ? 1 : 0, source, plate);
  } catch {
    /* logging is best-effort */
  }
}

async function tick() {
  // First run: anchor to the current newest entrance read so we only ever react
  // to cars that arrive AFTER the watcher starts (never replay history).
  if (globalThis.__raamGateWatcherLastId === undefined) {
    const rows = await querySlpr<{ maxId: string | null }>(
      `SELECT MAX(ID) AS maxId FROM \`log\` WHERE CAM_ID = ${ENTRANCE_CAM_ID}`
    );
    globalThis.__raamGateWatcherLastId = Number(rows[0]?.maxId ?? 0) || 0;
    return;
  }

  const lastId = globalThis.__raamGateWatcherLastId;
  const rows = await querySlpr<LogRow>(
    `SELECT ID, LP FROM \`log\`
     WHERE CAM_ID = ${ENTRANCE_CAM_ID} AND ID > ${lastId}
     ORDER BY ID ASC LIMIT 50`
  );
  if (rows.length === 0) return;

  globalThis.__raamGateWatcherLastId = rows.reduce(
    (max, r) => Math.max(max, Number(r.ID) || 0),
    lastId
  );

  const upper = GATES.find((g) => g.id === "upper");
  if (!upper) return;

  for (const row of rows) {
    const plate = (row.LP ?? "").trim();
    const key = normalizePlate(plate);
    if (!key) continue;

    const guest = db
      .prepare(
        `SELECT id, guest_name FROM resident_guests
         WHERE plate_key = ? AND auto_open = 1`
      )
      .get(key) as { id: number; guest_name: string | null } | undefined;
    if (!guest) continue;

    const now = Date.now();
    if (now - (lastOpenedByPlate.get(key) ?? 0) < PLATE_COOLDOWN_MS) continue;
    lastOpenedByPlate.set(key, now);

    const name = guest.guest_name?.trim() || plate;
    const who = `אורח מאושר: ${name}`;

    if (SHADOW_MODE) {
      console.log(
        `[gate-watcher] SHADOW — would open ${upper.name} for approved guest "${name}" (plate ${plate})`
      );
      logGateEvent(upper.id, upper.name, who, false, "guest-auto-shadow", plate);
      continue;
    }

    try {
      const result = await fireGate(upper);
      console.log(
        `[gate-watcher] opened ${upper.name} for "${name}" (plate ${plate}) -> HTTP ${result.status}`
      );
      logGateEvent(upper.id, upper.name, who, result.ok, "guest-auto", plate);
    } catch (e) {
      console.error("[gate-watcher] open failed:", e);
      logGateEvent(upper.id, upper.name, who, false, "guest-auto", plate);
    }
  }
}

// Idempotent — globalThis guard survives Turbopack HMR so we never stack timers.
export function startGateWatcher(): void {
  if (globalThis.__raamGateWatcher) return;
  globalThis.__raamGateWatcher = true;

  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      console.error("[gate-watcher] tick error:", e);
    }
    setTimeout(loop, POLL_MS);
  };
  void loop();

  console.log(
    `[gate-watcher] started (shadow=${SHADOW_MODE}, poll=${POLL_MS}ms, cam=${ENTRANCE_CAM_ID})`
  );
}
