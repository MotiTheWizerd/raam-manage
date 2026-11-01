import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

// The Hik SDK listener's event log (vision/intercom/sdk_listen.py): one JSON
// line per event from the door intercom panels and the elevator recorder —
// motion (motion.ts) and visitor calls / door unlocks (intercom-calls.ts).
const INTERCOM_LOG = path.join(process.cwd(), "logs", "intercom-events.jsonl");

// Follow the log from its current end (history isn't "now"), forever.
export async function followIntercomLog(onLine: (line: string) => void) {
  let pos = -1;
  let rest = "";
  for (;;) {
    try {
      const { size } = await fs.stat(INTERCOM_LOG);
      if (pos < 0) pos = size; // first look
      else if (size < pos) pos = 0; // the listener rotated the log — read the new one
      if (size > pos) {
        const fh = await fs.open(INTERCOM_LOG, "r");
        try {
          const buf = Buffer.alloc(size - pos);
          await fh.read(buf, 0, buf.length, pos);
          pos = size;
          const lines = (rest + buf.toString("utf8")).split("\n");
          rest = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) onLine(line);
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
