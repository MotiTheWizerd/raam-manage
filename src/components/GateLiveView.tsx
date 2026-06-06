"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const AUTO_CLOSE_MS = 12000; // roughly the gate open/close cycle
const REFRESH_MS = 400;

type Props = {
  camId: string;
  title: string;
  onClose: () => void;
};

export function GateLiveView({ camId, title, onClose }: Props) {
  const [src, setSrc] = useState<string | null>(null);
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
    const autoClose = setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(autoClose);
    };
  }, [camId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.95 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-28 left-1/2 z-50 w-[380px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
    >
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-white">
            {title} — שידור חי
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="aspect-video w-full bg-black">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`מצלמת ${title}`}
            className="block h-full w-full object-cover"
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
