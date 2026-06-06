"use server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fireGate, getGate } from "@/lib/gates";

export type OpenGateResult = { ok: boolean; error?: string };

// `source` tags where the open came from (gate_events.source): "manual" for the
// button box, "sequence" for the escort flow. `silent` skips the audit row —
// used for the escort's silent re-pulses that just HOLD the lower gate open, so
// one sequence logs once per gate instead of ~8 times.
export type OpenGateOptions = { source?: string; silent?: boolean };

// Opens a gate and records the action in gate_events. Any logged-in user can
// open a gate — it mirrors the physical button box the lobby staff already use.
export async function openGate(
  gateId: string,
  opts: OpenGateOptions = {}
): Promise<OpenGateResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const gate = getGate(gateId);
  if (!gate) return { ok: false, error: "שער לא מוכר" };

  let ok = false;
  let error: string | undefined;

  try {
    const result = await fireGate(gate);
    ok = result.ok;
    if (!ok) error = `בקר השער החזיר שגיאה (${result.status ?? "?"})`;
  } catch (e) {
    error = e instanceof Error ? e.message : "תקלת תקשורת לבקר השער";
  }

  // Audit log — best-effort, must never break the open itself.
  if (!opts.silent) {
    try {
      db.prepare(
        `INSERT INTO gate_events (gate_id, gate_name, lobbyist_name, ok, source)
         VALUES (?, ?, ?, ?, ?)`
      ).run(gate.id, gate.name, user.lobbyist_name, ok ? 1 : 0, opts.source ?? "manual");
    } catch {
      /* logging failure is non-fatal */
    }
  }

  return ok ? { ok: true } : { ok: false, error: error ?? "פתיחת השער נכשלה" };
}
