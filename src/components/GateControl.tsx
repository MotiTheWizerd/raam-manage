"use client";

import { AnimatePresence } from "framer-motion";
import { DoorOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { openGate } from "@/app/gates/actions";
import { GateLiveView } from "@/components/GateLiveView";
import { GateSequenceView } from "@/components/GateSequenceView";
import { cn } from "@/lib/cn";

type Gate = { id: "upper" | "lower"; name: string; short: string };

// Mirror of src/lib/gates.ts (labels only — the real URLs live server-side).
const GATES: Gate[] = [
  { id: "upper", name: "שער עליון", short: "עליון" },
  { id: "lower", name: "שער תחתון", short: "תחתון" },
];

const BUTTON_CLASS = cn(
  "group/gate flex items-center justify-center gap-2 rounded-full px-7 py-3 whitespace-nowrap",
  "bg-linear-to-b from-red-500 to-red-700 font-semibold text-white",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_8px_rgba(127,29,29,0.35)]",
  "transition-all duration-200 ease-out",
  "hover:-translate-y-0.5 hover:from-red-500 hover:to-red-600",
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_26px_rgba(220,38,38,0.45)]",
  "active:translate-y-0 active:scale-[0.97]",
  "disabled:opacity-60 disabled:hover:translate-y-0"
);

export function GateControl() {
  // Per-gate in-flight lock — blocks an accidental double-tap from double-firing.
  const [busy, setBusy] = useState<Gate["id"] | null>(null);
  // The camera whose live view is currently popped (null = none).
  const [liveView, setLiveView] = useState<{ camId: string; title: string } | null>(null);
  // The "escort the car" 4-shot sequence (launched by the upper button).
  const [sequenceOpen, setSequenceOpen] = useState(false);

  async function fire(gate: Gate) {
    if (busy) return;
    setBusy(gate.id);
    const result = await openGate(gate.id);
    setBusy(null);
    if (result.ok) {
      toast.success(`${gate.name} נפתח`);
      setLiveView({ camId: gate.id, title: gate.name }); // pop the gate's live view
    } else {
      toast.error(result.error ?? "פתיחת השער נכשלה");
    }
  }

  // Upper gate → run the full escort sequence (it fires the upper gate itself).
  // Lower gate → plain single open with a live view, as before.
  function handleGate(gate: Gate) {
    if (gate.id === "upper") {
      if (!sequenceOpen) setSequenceOpen(true);
    } else {
      fire(gate);
    }
  }

  return (
    <>
      <AnimatePresence>
        {liveView && (
          <GateLiveView
            key={liveView.camId}
            camId={liveView.camId}
            title={liveView.title}
            onClose={() => setLiveView(null)}
          />
        )}
        {sequenceOpen && (
          <GateSequenceView onClose={() => setSequenceOpen(false)} />
        )}
      </AnimatePresence>

      <div className="fixed bottom-0 left-1/2 z-50 -translate-x-1/2">
      {/* Peeking drawer: rests half-tucked below the edge at 50% opacity,
          glides fully into view on hover/focus. */}
      <div
        className={cn(
          "flex translate-y-[45%] flex-col items-center gap-2 px-3 pt-2 pb-3",
          "rounded-t-3xl border border-b-0 border-zinc-200/80 bg-white/80 opacity-50 shadow-2xl backdrop-blur-md",
          "transition-all duration-300 ease-out",
          "hover:translate-y-0 hover:opacity-100",
          "focus-within:translate-y-0 focus-within:opacity-100",
          "dark:border-zinc-800/80 dark:bg-zinc-900/80"
        )}
      >
        {/* grip handle — signals the drawer pulls up */}
        <div className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />

        <div className="flex flex-row gap-2">
          {GATES.map((gate) => (
            <button
              key={gate.id}
              type="button"
              onClick={() => handleGate(gate)}
              disabled={busy === gate.id || (gate.id === "upper" && sequenceOpen)}
              className={BUTTON_CLASS}
            >
              <DoorOpen className="size-5 transition-transform duration-200 ease-out group-hover/gate:scale-110" />
              {gate.short}
            </button>
          ))}

          {/* Lobby — opens the "Outdoor Loby" live view. Door-open command not
              wired yet (different system from the gates); view-only for now. */}
          <button
            type="button"
            onClick={() => setLiveView({ camId: "lobby", title: "לובי" })}
            className={BUTTON_CLASS}
          >
            <DoorOpen className="size-5 transition-transform duration-200 ease-out group-hover/gate:scale-110" />
            לובי
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
