"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";

// A thin row under the header for live building info. Shows nothing until
// there is something to say. Today: the supplier-yard boom gate left open
// (see lib/supplier-gate.ts — camera 114 watches it).

const POLL_MS = 3000;
const LATE_MS = 10 * 60_000; // open this long → the row turns red

type Gate = { open: boolean; since: number | null; id: number | null };

const clock = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });

function openFor(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec} שנ׳`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} דק׳`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} שע׳`;
}

export function HeaderInfoRow() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [offset, setOffset] = useState(0); // server clock − this screen's clock
  const [now, setNow] = useState(() => Date.now());
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/supplier-gate", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Gate & { now: number };
        if (!alive) return;
        setOffset(data.now - Date.now());
        setGate({ open: data.open, since: data.since, id: data.id });
      } catch {
        /* keep the last state */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const open = gate?.open && gate.since !== null;
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open || gate?.since == null) return null;

  const elapsed = now + offset - gate.since;
  // Amber while it's plausibly a delivery; red once it looks forgotten.
  const late = elapsed >= LATE_MS;

  // The camera got it wrong (the gate is shut): mark this opening a false
  // positive. The strip hides now; the next poll agrees.
  const dismiss = async () => {
    setConfirmDismiss(false);
    if (gate.id === null) return;
    setGate({ open: false, since: null, id: null });
    await fetch("/api/supplier-gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: gate.id }),
    }).catch(() => {});
  };

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-2.5 border-b px-4 text-sm transition-colors duration-700",
        late ? "border-red-500/30 bg-red-500/[0.09]" : "border-amber-500/20 bg-amber-500/[0.06]"
      )}
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite] opacity-60",
            late ? "bg-red-500" : "bg-amber-500"
          )}
        />
        <span
          className={cn(
            "relative size-2.5 rounded-full animate-[pulse_2.6s_ease-in-out_infinite]",
            late ? "bg-red-500" : "bg-amber-500"
          )}
        />
      </span>
      <span className={late ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-200"}>
        רחבת ספקים פתוחה מהשעה{" "}
        <span className="font-semibold tabular-nums">{clock.format(gate.since)}</span>
        <span className="mx-2 opacity-40">·</span>
        במשך <span className="font-semibold tabular-nums">{openFor(elapsed)}</span>
      </span>
      <button
        type="button"
        onClick={() => setConfirmDismiss(true)}
        title="השער סגור — זו טעות של המצלמה"
        className={cn(
          "ms-auto rounded-md border px-2 py-0.5 text-xs transition-colors",
          late
            ? "border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
            : "border-amber-500/30 text-amber-800 hover:bg-amber-500/10 dark:text-amber-200"
        )}
      >
        בטל
      </button>
      <ConfirmDialog
        open={confirmDismiss}
        onClose={() => setConfirmDismiss(false)}
        onConfirm={dismiss}
        title="ביטול התראה"
        description="השער סגור? ההתראה תסומן כטעות של המצלמה ותוסתר."
        confirmLabel="כן, השער סגור"
        cancelLabel="חזור"
      />
    </div>
  );
}
