"use client";

import { useEffect, useState } from "react";
import type { CameraId } from "@/lib/gates";
import { REFRESH_MS, VISION_URL } from "./sequence.config";

export type FrameSource =
  | { kind: "detect"; url: string }
  | { kind: "raw"; url: string }
  | { kind: "connecting" };

export type CameraFrame = {
  detect: boolean;
  detectError: boolean;
  toggleDetect: () => void;
  /** Wire to the detection <img>'s onError so it falls back to raw snapshots. */
  onDetectError: () => void;
  source: FrameSource;
};

/**
 * Resolves the picture for a camera: either the vision service's annotated
 * detection MJPEG, or a polled raw snapshot (also the fallback when detection
 * errors). The detection toggle lives here so the view just renders `source`.
 */
export function useCameraFrame(cam: CameraId): CameraFrame {
  const [src, setSrc] = useState<string | null>(null);
  const [detect, setDetect] = useState(false);
  const [detectError, setDetectError] = useState(false);
  const [detectStream, setDetectStream] = useState<string | null>(null);

  // ---- Detection stream (re-runs on each camera cut / toggle) ----
  // Point an MJPEG <img> at the vision service's annotated stream for the active
  // camera. The cache-bust token forces a fresh connection per cut so an
  // idled-out worker revives. Reset the error each cut so every shot retries
  // detection even if a previous one failed.
  useEffect(() => {
    if (detect) {
      setDetectError(false);
      setDetectStream(`${VISION_URL}/stream/${cam}?t=${Date.now()}`);
    } else {
      setDetectStream(null);
    }
  }, [detect, cam]);

  // ---- Raw snapshot loader (fallback / detection-off, re-runs on each cut) ----
  useEffect(() => {
    // Detection stream is carrying the picture — don't also poll snapshots.
    if (detect && !detectError) return;
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
  }, [cam, detect, detectError]);

  const source: FrameSource =
    detect && detectStream && !detectError
      ? { kind: "detect", url: detectStream }
      : src
        ? { kind: "raw", url: src }
        : { kind: "connecting" };

  return {
    detect,
    detectError,
    toggleDetect: () => setDetect((d) => !d),
    onDetectError: () => setDetectError(true),
    source,
  };
}
