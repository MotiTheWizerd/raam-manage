"use client";

import { FunnelX, Maximize2, Minimize2, ScanEye, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  DETECT_STATUS_LABEL,
  DetectView,
  type DetectStatus,
} from "@/components/camera/DetectView";
import { cn } from "@/lib/cn";

const REFRESH_MS = 400;

type Props = {
  camId: string;
  title: string;
  /** Whether the containing element is currently fullscreen (drives icon + object-fit). */
  isFullscreen: boolean;
  /** Toggle fullscreen on the container that owns this feed. */
  onToggleFullscreen: () => void;
  /** When provided, a close (X) button is shown. The grid tiles omit it. */
  onClose?: () => void;
  /** When provided (the motion-follow wall), a "hide from follow" button is shown. */
  onExclude?: () => void;
  /** A strip under the picture (the motion-follow wall's event info). */
  footer?: ReactNode;
  /** Snapshot refresh interval. Slower for the multi-camera wall. */
  refreshMs?: number;
  /** Notified when detection mode toggles (lets the popup pause its auto-close). */
  onDetectChange?: (detect: boolean) => void;
  /** Stretch the body to fill its container (the wall) instead of a fixed 16:9. */
  fill?: boolean;
  /** Detection on from outside (the wall's global button); the tile's own toggle can still override it. */
  autoDetect?: boolean;
  /** A tile in a wall: lighter detection (sub stream, a few frames a second) unless fullscreen. */
  detectLite?: boolean;
};

// The live camera panel: header controls (object-detection toggle, fullscreen,
// optional close) + the body (auth-gated snapshot polling, or the object
// detection frames). Shared by the gate popup (GateLiveView) and the cameras
// wall (CameraTile) so both windows stay identical as features grow.
export function CameraFeed({
  camId,
  title,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  onExclude,
  footer,
  refreshMs = REFRESH_MS,
  onDetectChange,
  fill = false,
  autoDetect = false,
  detectLite = false,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  // The tile's own choice; null = follow autoDetect.
  const [manualDetect, setManualDetect] = useState<boolean | null>(null);
  const [prevAuto, setPrevAuto] = useState(autoDetect);
  if (prevAuto !== autoDetect) {
    // The global button flipped: it wins over a tile's own earlier choice.
    setPrevAuto(autoDetect);
    setManualDetect(null);
  }
  const detect = manualDetect ?? autoDetect;
  const [detectStatus, setDetectStatus] = useState<DetectStatus>("starting");
  // Boxes on screen. Until then (a camera's stream can take seconds to start)
  // and after a failure, the plain live picture stays up.
  const detectLive = detect && detectStatus === "live";
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
    // While detection frames are showing we don't need snapshots, and while
    // the tab is hidden we idle — either way, don't poll.
    if (detectLive || !docVisible) return;

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
  }, [camId, detectLive, docVisible, refreshMs]);

  useEffect(() => {
    onDetectChange?.(detect);
  }, [detect, onDetectChange]);

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
          {onExclude && (
            <button
              type="button"
              onClick={onExclude}
              aria-label="הסתר ממעקב תנועה"
              title="הסתר ממעקב תנועה"
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <FunnelX className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setManualDetect(!detect)}
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
          "relative w-full bg-black",
          isFullscreen || fill ? "min-h-0 flex-1" : "aspect-video"
        )}
      >
        {detect && (
          <DetectView
            key={camId}
            camId={camId}
            title={title}
            lite={detectLite && !isFullscreen}
            paused={!docVisible}
            contain={isFullscreen || fill}
            onStatus={setDetectStatus}
          />
        )}
        {detect && detectStatus !== "live" && (
          <span
            className={cn(
              "absolute start-2 top-2 rounded-md px-2 py-0.5 text-xs",
              detectStatus === "starting"
                ? "bg-black/60 text-zinc-300"
                : "bg-red-950/80 text-red-200"
            )}
          >
            {DETECT_STATUS_LABEL[detectStatus]}
          </span>
        )}
        {detectLive ? null : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`מצלמת ${title}`}
            // Spotlight (fill) and fullscreen show the WHOLE frame (contain) so
            // nothing is cropped; fixed thumbnails crop to fill (cover).
            className={cn(
              "block h-full w-full",
              isFullscreen || fill ? "object-contain" : "object-cover"
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
            מתחבר למצלמה…
          </div>
        )}
      </div>
      {footer}
    </>
  );
}
