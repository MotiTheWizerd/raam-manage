"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DoorOpen, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { openGate } from "@/app/gates/actions";
import { cn } from "@/lib/cn";

type Gate = { id: "upper" | "lower"; name: string };

// Mirror of src/lib/gates.ts (labels only — the real URLs live server-side).
const GATES: Gate[] = [
  { id: "upper", name: "שער עליון" },
  { id: "lower", name: "שער תחתון" },
];

export function GateControl() {
  const [open, setOpen] = useState(false);
  // Per-gate in-flight lock — blocks an accidental double-tap from double-firing.
  const [busy, setBusy] = useState<Gate["id"] | null>(null);

  async function fire(gate: Gate) {
    if (busy) return;
    setBusy(gate.id);
    const result = await openGate(gate.id);
    setBusy(null);
    if (result.ok) toast.success(`${gate.name} נפתח`);
    else toast.error(result.error ?? "פתיחת השער נכשלה");
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-row gap-2 rounded-2xl border border-zinc-200 bg-white/90 p-2 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90"
          >
            {GATES.map((gate) => (
              <button
                key={gate.id}
                type="button"
                onClick={() => fire(gate)}
                disabled={busy === gate.id}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-6 py-3 whitespace-nowrap",
                  "bg-linear-to-b from-red-500 to-red-700 font-semibold text-white",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(127,29,29,0.35)]",
                  "transition-all duration-150 hover:from-red-500 hover:to-red-600",
                  "active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
                )}
              >
                <DoorOpen className="size-5" />
                {gate.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="פתיחת שערים"
        className={cn(
          "flex items-center gap-2 rounded-full border px-5 py-2.5 font-semibold shadow-lg backdrop-blur",
          "transition-all duration-150 active:scale-[0.98]",
          open
            ? "border-zinc-300 bg-white/90 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200"
            : "border-red-700/30 bg-linear-to-b from-red-500 to-red-700 text-white hover:from-red-500 hover:to-red-600"
        )}
      >
        {open ? <X className="size-5" /> : <DoorOpen className="size-5" />}
        שערים
      </button>
    </div>
  );
}
