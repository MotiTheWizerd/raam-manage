"use client";

import { motion } from "framer-motion";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useFullscreen } from "@/lib/hooks/useFullscreen";

const AUTO_CLOSE_MS = 12000; // roughly the gate open/close cycle
const REFRESH_MS = 400;

type Props = {
  camId: string;
  title: string;
  onClose: () => void;
};

export function GateLiveView({ camId, title, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
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
  }, [camId]);

  // Auto-close after the gate cycle — but never while the user is watching in
  // fullscreen. Leaving fullscreen restarts the timer fresh.
  useEffect(() => {
    if (isFullscreen) return;
    const autoClose = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => clearTimeout(autoClose);
  }, [isFullscreen]);

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
          <span className="size-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-white">
            {title} — שידור חי
          </span>
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
            onClick={onClose}
            aria-label="סגור"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className={cn("w-full bg-black", isFullscreen ? "flex-1" : "aspect-video")}>
        {src ? (
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
