"use client";

import { useRef } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { cn } from "@/lib/cn";
import { useFullscreen } from "@/lib/hooks/useFullscreen";

// Slower than the gate popup's 400ms — a wall of cameras polling that fast
// would pound the hardware. 1s is smooth enough for monitoring.
const WALL_REFRESH_MS = 1000;

// One live camera in the wall: the same window as the gate popup (CameraFeed —
// detection toggle + fullscreen), but as an inline grid cell with no auto-close
// and no close button.
export function CameraTile({ camId, title }: { camId: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(ref);

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col overflow-hidden border border-zinc-700 bg-zinc-900 shadow-sm",
        isFullscreen
          ? "h-screen w-screen rounded-none border-0"
          : "h-full rounded-xl"
      )}
    >
      <CameraFeed
        camId={camId}
        title={title}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        refreshMs={WALL_REFRESH_MS}
        fill
      />
    </div>
  );
}
