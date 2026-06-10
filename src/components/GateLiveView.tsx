"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { cn } from "@/lib/cn";
import { useFullscreen } from "@/lib/hooks/useFullscreen";

const AUTO_CLOSE_MS = 12000; // roughly the gate open/close cycle

type Props = {
  camId: string;
  title: string;
  onClose: () => void;
};

// The per-camera popup shown by the gate controls — a floating window over the
// gate buttons that auto-dismisses after the open/close cycle. The live feed
// itself (snapshot polling, detection toggle, fullscreen) lives in CameraFeed,
// shared with the cameras wall.
export function GateLiveView({ camId, title, onClose }: Props) {
  const [detect, setDetect] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      <CameraFeed
        camId={camId}
        title={title}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onClose={onClose}
        onDetectChange={setDetect}
      />
    </motion.div>
  );
}
