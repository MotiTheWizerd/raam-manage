"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Wait after a failed frame before asking again (service restarting, camera down).
const RETRY_MS = 3000;

// "live" once frames with boxes are showing; until then (or after a failure) the
// parent keeps its plain live picture up, with a label saying why.
export type DetectStatus = "starting" | "live" | "down" | "camera";

export const DETECT_STATUS_LABEL: Record<Exclude<DetectStatus, "live">, string> = {
  starting: "מפעיל זיהוי…",
  down: "שירות הזיהוי אינו פעיל — מנסה שוב",
  camera: "המצלמה לא מחזירה תמונה לזיהוי — מנסה שוב",
};

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

// A camera's live object detection (YOLO boxes drawn by the vision service),
// from /api/detect-frame — any camera the app knows. Long-polls: each request
// waits for a frame newer than the last, so the picture moves at the detection
// rate. Mounted only while detection is on (the parent keys it by camera), so
// turning it back on never shows a stale frame. Renders nothing until it has a
// frame. `lite` = a wall tile: the camera's sub stream at a few frames a second.
export function DetectView({
  camId,
  title,
  lite,
  paused,
  contain,
  onStatus,
}: {
  camId: string;
  title: string;
  lite: boolean;
  /** Tab hidden — stop asking (the camera's worker idles out on its own). */
  paused: boolean;
  /** Show the whole frame stretched to the box (spotlight / wall / fullscreen) rather than crop to fill. */
  contain: boolean;
  onStatus: (status: DetectStatus) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Every frame's blob: URL, oldest first; released once a newer one painted.
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (paused) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    const fail = async (status: DetectStatus) => {
      setFailed(true);
      onStatus(status);
      await pause(RETRY_MS, signal);
    };
    void (async () => {
      let after = -1;
      while (!signal.aborted) {
        try {
          const res = await fetch(
            `/api/detect-frame?cam=${encodeURIComponent(camId)}&after=${after}${lite ? "&lite=1" : ""}`,
            { cache: "no-store", signal }
          );
          if (!res.ok) {
            after = -1;
            await fail(res.status === 502 ? "down" : "camera");
            continue;
          }
          after = Number(res.headers.get("X-Frame-Seq") ?? -1);
          const url = URL.createObjectURL(await res.blob());
          urls.current.push(url);
          setSrc(url);
          setFailed(false);
          onStatus("live");
        } catch {
          if (signal.aborted) break;
          after = -1;
          await fail("down");
        }
      }
    })();
    return () => ctrl.abort();
  }, [camId, lite, paused, onStatus]);

  // Unmount: release every frame, and the parent goes back to "starting" for
  // the next time detection is switched on.
  useEffect(() => {
    const held = urls.current;
    return () => {
      held.forEach((u) => URL.revokeObjectURL(u));
      held.length = 0;
      onStatus("starting");
    };
  }, [onStatus]);

  // A frame painted: the ones before it are no longer needed.
  function onShown(shown: string) {
    const i = urls.current.indexOf(shown);
    if (i > 0) urls.current.splice(0, i).forEach((u) => URL.revokeObjectURL(u));
  }

  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`זיהוי אובייקטים — ${title}`}
      onLoad={() => onShown(src)}
      className={cn("block h-full w-full", contain ? "object-fill" : "object-cover")}
    />
  );
}
