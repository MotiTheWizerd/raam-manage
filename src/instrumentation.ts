// Runs once per server start (Next.js instrumentation hook). We use it to arm
// the nightly database-backup scheduler. Node-only: the backup code uses
// better-sqlite3 / node:net, which can't load in the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupScheduler } = await import("./lib/backup-scheduler");
    startBackupScheduler();

    const { startGateWatcher } = await import("./lib/gate-watcher");
    startGateWatcher();
  }
}
