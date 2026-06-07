"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openGate } from "@/app/gates/actions";
import type { CameraId } from "@/lib/gates";
import { cn } from "@/lib/cn";
import { useFullscreen } from "@/lib/hooks/useFullscreen";

// "Escort the car" — one button press plays the whole arrival as a 5-shot cut
// and drives the gates automatically:
//
//   cold open (.60 street) -> upper gate (.107) -> ramp (.61)
//     -> road (cam 29 שביל כניסה) -> lower (.112)
//
// The upper gate fires the instant the lobbyist presses (the real car is
// waiting — never delay it for the cinematics). After the descent we open the
// lower gate and SILENTLY re-pulse it so it stays open while the car passes —
// the gates auto-close ~5s, so re-firing a touch faster keeps it solidly open.
//
// TUNE THESE after watching real cars (durations in ms):
const SEQ = {
  coldOpenMs: 3000, // .60 street — car approaching
  upperMs: 7000, // .107 upper gate — car enters
  rampMs: 15000, // .61 ramp — the descent into the garage
  roadMs: 12000, // cam 29 שביל — the driveway between the ramp and the lower gate
  lowerHoldMs: 30000, // .112 lower — how long we hold the lower gate open
  pulseEveryMs: 4000, // re-fire cadence (< the ~5s auto-close, so no visible judder)
  closeWatchMs: 7000, // after the last pulse, keep watching until the gate auto-closes (~5s) + margin
};

const REFRESH_MS = 400; // live-frame refresh

// Phase boundaries, measured from button press (T=0).
const T_UPPER = SEQ.coldOpenMs;
const T_RAMP = T_UPPER + SEQ.upperMs;
const T_ROAD = T_RAMP + SEQ.rampMs;
const T_LOWER = T_ROAD + SEQ.roadMs; // lower gate opens here
const T_END = T_LOWER + SEQ.lowerHoldMs;

type Phase = "cold" | "upper" | "ramp" | "road" | "lower" | "done";

// Client-side mirror of the camera labels (the real creds/IPs live server-side
// in gates.ts, which is import "server-only").
const SHOTS: { phase: Phase; cam: CameraId; label: string }[] = [
  { phase: "cold", cam: "street", label: "כניסה" },
  { phase: "upper", cam: "upper", label: "שער עליון" },
  { phase: "ramp", cam: "ramp", label: "רמפה" },
  { phase: "road", cam: "road", label: "שביל כניסה" },
  { phase: "lower", cam: "lower", label: "שער תחתון" },
];

type Props = { onClose: () => void };

export function GateSequenceView({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("cold");
  const [cam, setCam] = useState<CameraId>("street");
  const [src, setSrc] = useState<string | null>(null);
  const [secsToLower, setSecsToLower] = useState(Math.ceil(T_LOWER / 1000));

  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const aborted = useRef(false);

  // ---- Sequence orchestration (runs once) ----
  useEffect(() => {
    // Reset the abort flag — in dev, StrictMode mounts→cleans up→remounts, and
    // the cleanup sets aborted=true; without this reset the remounted run's
    // timers would all no-op and the sequence would freeze on the first shot.
    aborted.current = false;
    const startedAt = Date.now();
    const at = (ms: number, fn: () => void) => {
      timers.current.push(
        setTimeout(() => {
          if (!aborted.current) fn();
        }, ms)
      );
    };

    // Fire the UPPER gate immediately — the driver is waiting at the gate.
    openGate("upper", { source: "sequence" }).then((r) => {
      if (!r.ok && !aborted.current) toast.error(r.error ?? "פתיחת שער עליון נכשלה");
    });

    // Camera cuts.
    at(T_UPPER, () => {
      setCam("upper");
      setPhase("upper");
    });
    at(T_RAMP, () => {
      setCam("ramp");
      setPhase("ramp");
    });
    at(T_ROAD, () => {
      setCam("road");
      setPhase("road");
    });
    at(T_LOWER, () => {
      setCam("lower");
      setPhase("lower");
      // Open the lower gate, then re-pulse silently to hold it open.
      openGate("lower", { source: "sequence" });
      intervals.current.push(
        setInterval(() => {
          if (!aborted.current) openGate("lower", { silent: true });
        }, SEQ.pulseEveryMs)
      );
    });
    at(T_END, () => {
      setPhase("done");
      intervals.current.forEach(clearInterval);
      intervals.current = [];
    });
    // Stay on the lower-gate shot through the auto-close so the lobbyist sees the
    // gate actually shut before the popup disappears.
    at(T_END + SEQ.closeWatchMs, () => onCloseRef.current());

    // Descent countdown tick.
    intervals.current.push(
      setInterval(() => {
        setSecsToLower(Math.max(0, Math.ceil((T_LOWER - (Date.now() - startedAt)) / 1000)));
      }, 250)
    );

    return () => {
      aborted.current = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      intervals.current.forEach(clearInterval);
      intervals.current = [];
    };
  }, []);

  // ---- Live frame loader (re-runs on each camera cut) ----
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setSrc(null);
    const loadNext = () => {
      const next = `/api/gate-cam?cam=${cam}&t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        if (!active) return;
        setSrc(next);
        timer = setTimeout(loadNext, REFRESH_MS);
      };
      img.onerror = () => {
        if (!active) return;
        timer = setTimeout(loadNext, REFRESH_MS);
      };
      img.src = next;
    };
    loadNext();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cam]);

  function abort() {
    aborted.current = true;
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    onClose();
  }

  const caption: Record<Phase, string> = {
    cold: "רכב מתקרב לכניסה…",
    upper: "השער העליון נפתח — היכון",
    ramp: `הרכב יורד ברמפה · שער תחתון בעוד ${secsToLower}`,
    road: `הרכב בשביל הכניסה · שער תחתון בעוד ${secsToLower}`,
    lower: "שער תחתון פתוח · נסיעה טובה",
    done: "השער נסגר · הרצף הושלם",
  };

  const activeIndex = SHOTS.findIndex((s) => s.cam === cam);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      ref={rootRef}
      className={cn(
        "z-50 overflow-hidden border border-zinc-700 bg-zinc-900 shadow-2xl",
        isFullscreen
          ? "flex h-screen w-screen flex-col rounded-none border-0"
          : "fixed bottom-28 left-1/2 w-[460px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl"
      )}
    >
      {/* header */}
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-4 text-red-500" />
          <span className="text-sm font-semibold text-white">ליווי רכב — שידור חי</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={abort}
            aria-label="עצור"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* video */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-black",
          isFullscreen ? "flex-1" : "aspect-video"
        )}
      >
        {/* Film cut between shots: each camera change crossfades + gently
            pushes in. Keyed by `cam` so the every-400ms live refresh within a
            shot doesn't re-trigger it. */}
        <AnimatePresence>
          <motion.div
            key={cam}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="שידור חי" className="block h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                מתחבר למצלמה…
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* big descent countdown — runs from the upper shot through the ramp
            and the driveway, all the way down to the lower gate opening */}
        {(phase === "upper" || phase === "ramp" || phase === "road") && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.span
              key={secsToLower}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="text-7xl font-black text-white tabular-nums [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]"
            >
              {secsToLower}
            </motion.span>
          </div>
        )}

        {/* caption bar */}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-3 pt-8 pb-2">
          <span className="text-sm font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
            {caption[phase]}
          </span>
        </div>

        {/* live dot */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5">
          <span className="size-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-xs font-medium text-white">{SHOTS[activeIndex]?.label}</span>
        </div>
      </div>

      {/* shot progress dots + abort */}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex items-center gap-1.5">
          {SHOTS.map((shot, i) => (
            <span
              key={shot.cam}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === activeIndex ? "w-6 bg-red-500" : i < activeIndex ? "w-3 bg-red-800" : "w-3 bg-zinc-700"
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={abort}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
        >
          עצור רצף
        </button>
      </div>
    </motion.div>
  );
}
