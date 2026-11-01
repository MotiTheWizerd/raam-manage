"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PhoneCall, PhoneOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { hangUpIntercomCall } from "@/app/intercom/actions";
import { CameraTile } from "@/components/camera/CameraTile";
import { DoorKey } from "@/components/intercom/IntercomWall";
import { cn } from "@/lib/cn";
import type { IntercomCall } from "@/lib/intercom-calls";

const POLL_MS = 1000;
// How long the green "door opened" stays before the popup closes.
const OPENED_SHOW_MS = 2000;

const BY_LABEL: Record<string, string> = { tablet: "מהטאבלט בלובי", remote: "מהמערכת" };

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Ends the call without opening — at the panel, so the tablet stops too.
function HangUp({ camId }: { camId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  const hangUp = async () => {
    if (state === "busy") return;
    setState("busy");
    const res = await hangUpIntercomCall(camId).catch(() => ({ ok: false }));
    if (res.ok) return; // the popup turns grey and closes by itself
    setState("error");
    setTimeout(() => setState("idle"), 3000);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        onClick={hangUp}
        disabled={state === "busy"}
        aria-label="נתק שיחה"
        title="נתק שיחה — גם בטאבלט"
        className="flex size-11 items-center justify-center rounded-full bg-red-600 text-white shadow transition hover:bg-red-500 active:scale-95"
      >
        {state === "busy" ? <Loader2 className="size-5 animate-spin" /> : <PhoneOff className="size-5" />}
      </button>
      {state === "error" && <span className="text-sm text-red-400">הניתוק לא הצליח</span>}
    </div>
  );
}

// A door panel is calling the lobby: its live picture and the open key, while
// the tablet rings. Appears on the call's first ring and leaves a few seconds
// after it ends (see lib/intercom-calls.ts). The talking itself is still on
// the tablet.
export function IntercomCallPopup() {
  const [calls, setCalls] = useState<IntercomCall[]>([]);
  const [now, setNow] = useState(0); // server clock at the last poll
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/intercom/calls", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { now: number; calls: IntercomCall[] };
        if (!active) return;
        setNow(data.now);
        setCalls(data.calls);
      } catch {
        /* transient hiccup — retry next tick */
      }
    }
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  // Once the door opened, the lobbyist only needs to know that: a short green
  // "opened", then gone — even if the tablet is still finishing the call.
  const visible = calls.filter(
    (c) => !dismissed.has(c.id) && !(c.openedAt !== null && now - c.openedAt > OPENED_SHOW_MS)
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-3 px-4">
      <AnimatePresence initial={false}>
        {visible.map((c) => {
          const opened = c.openedAt !== null;
          const ended = c.endedAt !== null;
          const by = c.openedBy ? (BY_LABEL[c.openedBy] ?? c.openedBy) : "";
          const status = opened
            ? `הדלת נפתחה ${by}`
            : ended
              ? "השיחה הסתיימה — הדלת לא נפתחה"
              : "מצלצל בטאבלט בלובי…";
          return (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              role="alertdialog"
              aria-label={`שיחה נכנסת — ${c.name}`}
              className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            >
              <div
                className={cn(
                  "flex items-center justify-between gap-2 px-4 py-2.5 text-white",
                  opened
                    ? "bg-gradient-to-l from-emerald-600 to-teal-500"
                    : ended
                      ? "bg-zinc-700"
                      : "bg-gradient-to-l from-amber-500 to-orange-500"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <PhoneCall className={cn("size-4", !opened && !ended && "animate-pulse")} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs opacity-85">שיחה נכנסת</span>
                    <span className="block truncate text-lg font-extrabold leading-tight">{c.name}</span>
                  </span>
                  {c.replay && (
                    <span className="shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">
                      סימולציה
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-sm opacity-90">
                    {clock((c.endedAt ?? now) - c.startedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDismissed((d) => new Set(d).add(c.id))}
                    aria-label="סגור"
                    className="inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-white/20"
                  >
                    <X className="size-4" />
                  </button>
                </span>
              </div>
              <div className="aspect-[16/10]">
                <CameraTile
                  camId={c.camId}
                  title={c.name}
                  footer={
                    <div className="flex items-center justify-center bg-zinc-900">
                      <DoorKey camId={c.camId} endCall />
                      {!ended && <HangUp camId={c.camId} />}
                    </div>
                  }
                />
              </div>
              <div
                className={cn(
                  "px-4 py-2 text-center text-sm",
                  opened ? "text-emerald-400" : ended ? "text-zinc-400" : "text-amber-300"
                )}
              >
                {status}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
