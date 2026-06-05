import "server-only";

import { runAllBackups } from "./backup";

// Nightly automatic backup at ~01:00 local time. The app runs persistently on
// the lobby PC (pm2), so an in-process timer is enough — no external cron.
const RUN_HOUR = 1;

declare global {
  var __raamBackupScheduled: boolean | undefined;
  var __raamBackupNextRun: number | undefined; // epoch ms
}

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(RUN_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNext(): void {
  const delay = msUntilNextRun();
  globalThis.__raamBackupNextRun = Date.now() + delay;
  setTimeout(() => {
    void (async () => {
      console.log("[backup] nightly run starting");
      try {
        await runAllBackups();
        console.log("[backup] nightly run finished");
      } catch (e) {
        console.error("[backup] nightly run error:", e);
      }
      scheduleNext(); // re-arm for the following night (recomputed, DST-safe)
    })();
  }, delay);
}

// Idempotent — the globalThis guard survives Turbopack HMR so we never stack
// duplicate timers during development.
export function startBackupScheduler(): void {
  if (globalThis.__raamBackupScheduled) return;
  globalThis.__raamBackupScheduled = true;
  scheduleNext();
  const next = new Date(globalThis.__raamBackupNextRun ?? Date.now());
  console.log(`[backup] scheduler started; next run ${next.toISOString()}`);
}

export function getNextScheduledRun(): number | null {
  return globalThis.__raamBackupNextRun ?? null;
}
