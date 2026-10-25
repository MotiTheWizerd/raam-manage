// Runs once per server start (Next.js instrumentation hook). We use it to arm
// the nightly database-backup scheduler. Node-only: the backup code uses
// better-sqlite3 / node:net, which can't load in the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupScheduler } = await import("./lib/backup-scheduler");
    startBackupScheduler();

    const { startGateWatcher } = await import("./lib/gate-watcher");
    startGateWatcher();

    // Restore the WhatsApp session on boot if it's already linked (creds on
    // disk), so a pm2 restart / nightly reboot brings it back without anyone
    // re-scanning a QR. Does nothing until WhatsApp has been linked once.
    const { whatsappTest } = await import("./lib/whatsapp-test");
    void whatsappTest.connectIfLinked();

    // Drain the face sentry's entry events into the entry log. The sentry
    // (raam-face, :8090) runs on this same box again since the RTX 5060 move.
    const { startFaceWatcher } = await import("./lib/face-watcher");
    startFaceWatcher();
  }
}
