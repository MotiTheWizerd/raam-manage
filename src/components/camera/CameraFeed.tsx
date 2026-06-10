"use client";

import { Maximize2, Minimize2, ScanEye, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const REFRESH_MS = 400;

// The local vision service (vision/server.py) that serves annotated MJPEG
// detection feeds. Runs on the lobby PC alongside the app; override per-machine
// with NEXT_PUBLIC_VISION_URL if the port ever changes.
const VISION_URL =
  process.env.NEXT_PUBLIC_VISION_URL ?? "http://127.0.0.1:8089";

type Props = {
  camId: string;
  title: string;
  /** Whether the containing element is currently fullscreen (drives icon + object-fit). */
  isFullscreen: boolean;
  /** Toggle fullscreen on the container that owns this feed. */
  onToggleFullscreen: () => void;
  /** When provided, a close (X) button is shown. The grid tiles omit it. */
  onClose?: () => void;
  /** Snapshot refresh interval. Slower for the multi-camera wall. */
  refreshMs?: number;
  /** Notified when detection mode toggles (lets the popup pause its auto-close). */
  onDetectChange?: (detect: boolean) => void;
  /** Stretch the body to fill its container (the wall) instead of a fixed 16:9. */
  fill?: boolean;
};

// The live camera panel: header controls (object-detection toggle, fullscreen,
// optional close) + the body (auth-gated snapshot polling, or the annotated
// MJPEG detection stream). Shared by the gate popup (GateLiveView) and the
// cameras wall (CameraTile) so both windows stay identical as features grow.
export function CameraFeed({
  camId,
  title,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  refreshMs = REFRESH_MS,
  onDetectChange,
  fill = false,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [detect, setDetect] = useState(false);
  const [detectStream, setDetectStream] = useState<string | null>(null);
  const [detectError, setDetectError] = useState(false);
  const [docVisible, setDocVisible] = useState(true);

  // Pause snapshot polling while the tab is hidden — otherwise a wall of
  // cameras keeps hammering the hardware in the background.
  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    // While detection mode is on we show the MJPEG stream instead, and while
    // the tab is hidden we idle — either way, don't poll snapshots.
    if (detect || !docVisible) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    // Load each frame into an offscreen Image and only swap it in once it has
    // decoded — no blank flicker between refreshes.
    const loadNext = () => {
      const next = `/api/gate-cam?cam=${camId}&t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        if (!active) return;
        setSrc(next);
        timer = setTimeout(loadNext, refreshMs);
      };
      img.onerror = () => {
        if (!active) return;
        timer = setTimeout(loadNext, refreshMs);
      };
      img.src = next;
    };

    loadNext();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [camId, detect, docVisible, refreshMs]);

  // Open / close the detection MJPEG stream as the toggle flips. The cache-bust
  // token forces a fresh stream each time it's turned on (so re-opening revives
  // an idled-out worker).
  useEffect(() => {
    onDetectChange?.(detect);
    if (detect) {
      setDetectError(false);
      setDetectStream(`${VISION_URL}/stream/${camId}?t=${Date.now()}`);
    } else {
      setDetectStream(null);
    }
  }, [detect, camId, onDetectChange]);

  return (
    <>
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 animate-pulse rounded-full",
              detect ? "bg-emerald-400" : "bg-red-500"
            )}
          />
          <span className="truncate text-sm font-semibold text-white">
            {title} — {detect ? "זיהוי אובייקטים" : "שידור חי"}
          </span>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setDetect((d) => !d)}
            aria-label={detect ? "כבה זיהוי אובייקטים" : "הפעל זיהוי אובייקטים"}
            title={detect ? "כבה זיהוי אובייקטים" : "הפעל זיהוי אובייקטים"}
            className={cn(
              "rounded-md p-1 transition-colors hover:bg-white/10",
              detect
                ? "bg-emerald-500/20 text-emerald-300 hover:text-emerald-200"
                : "text-zinc-400 hover:text-white"
            )}
          >
            <ScanEye className="size-4" />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
            title={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "w-full bg-black",
          isFullscreen || fill ? "min-h-0 flex-1" : "aspect-video"
        )}
      >
        {detect ? (
          detectError ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-zinc-400">
              <span>שירות הזיהוי אינו פעיל</span>
              <span className="text-xs text-zinc-500">הפעל את vision/server.py</span>
            </div>
          ) : detectStream ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={detectStream}
              alt={`זיהוי אובייקטים — ${title}`}
              onError={() => setDetectError(true)}
              className={cn(
                "block h-full w-full",
                isFullscreen ? "object-contain" : "object-cover"
              )}
            />
          ) : null
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`מצלמת ${title}`}
            className={cn("block h-full w-full", isFullscreen ? "object-contain" : "object-cover")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
            מתחבר למצלמה…
          </div>
        )}
      </div>
    </>
  );
}
