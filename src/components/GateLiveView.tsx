"use client";

import { motion } from "framer-motion";
import { Maximize2, Minimize2, ScanEye, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useFullscreen } from "@/lib/hooks/useFullscreen";

const AUTO_CLOSE_MS = 12000; // roughly the gate open/close cycle
const REFRESH_MS = 400;

// The local vision service (vision/server.py) that serves annotated MJPEG
// detection feeds. Runs on the lobby PC alongside the app; override per-machine
// with NEXT_PUBLIC_VISION_URL if the port ever changes.
const VISION_URL =
  process.env.NEXT_PUBLIC_VISION_URL ?? "http://127.0.0.1:8089";

type Props = {
  camId: string;
  title: string;
  onClose: () => void;
};

export function GateLiveView({ camId, title, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [detect, setDetect] = useState(false);
  const [detectStream, setDetectStream] = useState<string | null>(null);
  const [detectError, setDetectError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // While detection mode is on we show the MJPEG stream instead, so don't
    // burn cycles polling snapshots.
    if (detect) return;

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
  }, [camId, detect]);

  // Open / close the detection MJPEG stream as the toggle flips. The cache-bust
  // token forces a fresh stream each time it's turned on (so re-opening revives
  // an idled-out worker).
  useEffect(() => {
    if (detect) {
      setDetectError(false);
      setDetectStream(`${VISION_URL}/stream/${camId}?t=${Date.now()}`);
    } else {
      setDetectStream(null);
    }
  }, [detect, camId]);

  // Auto-close after the gate cycle — but never while the user is actively
  // watching (fullscreen or detection mode). Leaving them restarts the timer.
  useEffect(() => {
    if (isFullscreen || detect) return;
    const autoClose = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(autoClose);
  }, [isFullscreen, detect]);

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
          : "fixed bottom-28 left-1/2 w-[380px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl"
      )}
    >
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 animate-pulse rounded-full",
              detect ? "bg-emerald-400" : "bg-red-500"
            )}
          />
          <span className="text-sm font-semibold text-white">
            {title} — {detect ? "זיהוי אובייקטים" : "שידור חי"}
          </span>
        </div>
        <div className="flex items-center gap-1">
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
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className={cn("w-full bg-black", isFullscreen ? "flex-1" : "aspect-video")}>
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
    </motion.div>
  );
}
