"use client";

import { Cctv } from "lucide-react";
import { CameraTile } from "@/components/camera/CameraTile";

export type CameraInfo = { id: string; name: string };

// The cameras page: every building camera as a live tile in a responsive grid.
// Each tile is a full camera window (object-detection toggle + fullscreen).
export function CameraWall({ cameras }: { cameras: CameraInfo[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Cctv size={22} aria-hidden="true" className="text-foreground/70" />
        <h1 className="text-xl font-semibold tracking-tight">מצלמות</h1>
        <span className="text-sm text-foreground/50">({cameras.length})</span>
      </div>

      {cameras.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-xl border border-black/10 text-sm text-foreground/50 dark:border-white/10">
          אין מצלמות מוגדרות
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3 xl:grid-cols-3">
          {cameras.map((cam) => (
            <CameraTile key={cam.id} camId={cam.id} title={cam.name} />
          ))}
        </div>
      )}
    </div>
  );
}
