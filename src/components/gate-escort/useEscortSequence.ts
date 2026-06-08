"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openGate } from "@/app/gates/actions";
import type { CameraId } from "@/lib/gates";
import {
  SEQ,
  T_END,
  T_LOWER_CAM,
  T_OPEN,
  T_RAMP,
  T_ROAD,
  T_UPPER,
  type Phase,
} from "./sequence.config";

export type EscortSequence = {
  phase: Phase;
  cam: CameraId;
  secsToLower: number;
  dooring: boolean;
  abort: () => void;
};

/**
 * The car-escort orchestration engine. Owns all timers/intervals, fires the
 * gates, and exposes the choreography as declarative state. The timeline is
 * driven off the fixed T_* boundaries today; the phase transitions are isolated
 * here so a future event source (vision detections) can advance them instead.
 */
export function useEscortSequence(onClose: () => void): EscortSequence {
  const [phase, setPhase] = useState<Phase>("cold");
  const [cam, setCam] = useState<CameraId>("street");
  const [secsToLower, setSecsToLower] = useState(Math.ceil(T_OPEN / 1000));
  const [dooring, setDooring] = useState(false); // the big "פותח דלת" flash

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const aborted = useRef(false);

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
      if (!r.ok && !aborted.current)
        toast.error(r.error ?? "פתיחת שער עליון נכשלה");
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
    at(T_LOWER_CAM, () => {
      // Cut to the final shot — the lower-gate cam — while the countdown keeps
      // ticking. The gate is NOT opened yet; the car is still approaching.
      setCam("lower");
      setPhase("lower");
    });
    at(T_OPEN, () => {
      setPhase("open");
      setDooring(true); // flash the big "פותח דלת"
      // Open the lower gate, then re-pulse silently to hold it open.
      openGate("lower", { source: "sequence" });
      intervals.current.push(
        setInterval(() => {
          if (!aborted.current) openGate("lower", { silent: true });
        }, SEQ.pulseEveryMs)
      );
    });
    at(T_OPEN + SEQ.dooringMs, () => setDooring(false));
    at(T_END, () => {
      setPhase("done");
      intervals.current.forEach(clearInterval);
      intervals.current = [];
    });
    // Stay on the lower-gate shot through the auto-close so the lobbyist sees the
    // gate actually shut before the popup disappears.
    at(T_END + SEQ.closeWatchMs, () => onCloseRef.current());

    // Countdown to the door opening.
    intervals.current.push(
      setInterval(() => {
        setSecsToLower(
          Math.max(0, Math.ceil((T_OPEN - (Date.now() - startedAt)) / 1000))
        );
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

  function abort() {
    aborted.current = true;
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    onClose();
  }

  return { phase, cam, secsToLower, dooring, abort };
}
