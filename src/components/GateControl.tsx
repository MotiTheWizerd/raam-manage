"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp, DoorOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openDoor } from "@/app/doors/actions";
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

// Hide the "דלתות" doors menu for now (keep the code). The menu is only
// reachable through the toggle button, so the door list below stays dormant
// while this is false. Flip to true to bring it back.
const SHOW_DOORS_MENU = false;

// Mirror of src/lib/doors.ts (labels only) — the GeoVision doors other than the
// lobby, which has its own button. Names beyond "lobby" are the raw GeoVision
// labels for now; Moti will rename them to real-world doors later.
const DOORS: { id: string; name: string }[] = [
  { id: "north", name: "דלת צפונית" },
  { id: "carpark2", name: "חניון 2 ראשית" },
  { id: "parking-guests-door", name: "דלת אורחים" },
  { id: "parking-main", name: "דלת חניון ראשית" },
  { id: "parking-suppliers", name: "חניון ספקים" },
  { id: "parking-guests", name: "חניון אורחים" },
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

// Slimmer secondary pill for the rows inside the expandable doors list.
const DOOR_ROW_CLASS = cn(
  "group/door flex w-full items-center justify-center gap-2 rounded-full px-5 py-2 text-sm whitespace-nowrap",
  "border border-zinc-200/80 bg-white/70 font-medium text-zinc-700",
  "transition-all duration-200 ease-out",
  "hover:-translate-y-0.5 hover:border-red-300 hover:text-red-700 hover:shadow-md",
  "active:translate-y-0 active:scale-[0.97]",
  "disabled:opacity-60 disabled:hover:translate-y-0",
  "dark:border-zinc-700/80 dark:bg-zinc-800/70 dark:text-zinc-200 dark:hover:text-red-300"
);

// True when the focused element already has its own meaning for the Space key
// (typing a space, ticking a control, activating a button/link) — in those
// cases the global double-tap-Space lobby shortcut must NOT hijack it.
function spaceIsClaimedBy(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) return true;
  const role = el.getAttribute("role");
  return role !== null && ["button", "switch", "checkbox", "tab", "menuitem", "radio", "option"].includes(role);
}

const LOBBY_DOUBLE_TAP_MS = 350; // max gap between the two Space taps

export function GateControl() {
  // Per-gate in-flight lock — blocks an accidental double-tap from double-firing.
  const [busy, setBusy] = useState<Gate["id"] | null>(null);
  // Per-door in-flight lock (door id currently opening, null = none).
  const [doorBusy, setDoorBusy] = useState<string | null>(null);
  // The camera whose live view is currently popped (null = none).
  const [liveView, setLiveView] = useState<{ camId: string; title: string } | null>(null);
  // The "escort the car" 4-shot sequence (launched by the upper button).
  const [sequenceOpen, setSequenceOpen] = useState(false);
  // The expandable list of (non-lobby) doors.
  const [doorsOpen, setDoorsOpen] = useState(false);

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

  // Unlock a GeoVision door. camId pops a live view on success (the lobby door
  // has the "Outdoor Loby" cam; the others have none).
  async function fireDoor(id: string, name: string, camId?: string) {
    if (doorBusy) return;
    setDoorBusy(id);
    const result = await openDoor(id);
    setDoorBusy(null);
    if (result.ok) {
      toast.success(`${name} נפתחה`);
      if (camId) setLiveView({ camId, title: name });
    } else {
      toast.error(result.error ?? "פתיחת הדלת נכשלה");
    }
  }

  // Global shortcut: double-tap Space anywhere in the app to open the lobby door
  // (it's the most-opened door). A ref keeps the handler pointed at the latest
  // fireDoor so its doorBusy in-flight guard stays current without re-binding.
  const fireDoorRef = useRef(fireDoor);
  fireDoorRef.current = fireDoor;
  useEffect(() => {
    let lastTap = 0;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.repeat) return; // ignore auto-repeat from a held key
      if (spaceIsClaimedBy(document.activeElement)) return; // don't hijack typing/controls
      const now = Date.now();
      if (now - lastTap < LOBBY_DOUBLE_TAP_MS) {
        lastTap = 0; // consume — require two fresh taps for the next open
        e.preventDefault(); // stop the page-scroll jump on the triggering tap
        // No camId here on purpose — the shortcut just opens the door (it's
        // right next to the desk), no live-view popup needed.
        void fireDoorRef.current("lobby", "לובי");
      } else {
        lastTap = now;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

        {/* Expandable list of the other building doors (GeoVision). */}
        <AnimatePresence initial={false}>
          {doorsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex w-full flex-col gap-1.5 overflow-hidden"
            >
              {DOORS.map((door) => (
                <button
                  key={door.id}
                  type="button"
                  onClick={() => fireDoor(door.id, door.name)}
                  disabled={doorBusy === door.id}
                  className={DOOR_ROW_CLASS}
                >
                  <DoorOpen className="size-4 transition-transform duration-200 ease-out group-hover/door:scale-110" />
                  {door.name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

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

          {/* Lobby — unlocks the lobby door (GeoVision, ctrl 4) + pops its
              "Outdoor Loby" live view. */}
          <button
            type="button"
            onClick={() => fireDoor("lobby", "לובי", "lobby")}
            disabled={doorBusy === "lobby"}
            className={BUTTON_CLASS}
            title="פתיחה מהירה: הקשה כפולה על מקש הרווח"
          >
            <DoorOpen className="size-5 transition-transform duration-200 ease-out group-hover/gate:scale-110" />
            לובי
          </button>

          {/* Toggle the rest of the building doors. Hidden for now via
              SHOW_DOORS_MENU (code kept). */}
          {SHOW_DOORS_MENU && (
            <button
              type="button"
              onClick={() => setDoorsOpen((v) => !v)}
              aria-expanded={doorsOpen}
              className={cn(BUTTON_CLASS, "px-5")}
            >
              <ChevronUp
                className={cn(
                  "size-5 transition-transform duration-200 ease-out",
                  doorsOpen && "rotate-180"
                )}
              />
              דלתות
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
