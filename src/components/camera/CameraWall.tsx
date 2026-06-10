"use client";

import { Cctv } from "lucide-react";
import { useState } from "react";
import { CameraTile } from "@/components/camera/CameraTile";

export type CameraInfo = { id: string; name: string };

// One vertical stack of clickable camera thumbnails (a side column).
function CameraColumn({
  cameras,
  onSelect,
}: {
  cameras: CameraInfo[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-1/5 shrink-0 flex-col gap-3">
      {cameras.map((cam) => (
        <div key={cam.id} className="min-h-0 flex-1">
          <CameraTile
            camId={cam.id}
            title={cam.name}
            onSelect={() => onSelect(cam.id)}
          />
        </div>
      ))}
    </div>
  );
}

// The cameras page: a "spotlight" wall — one big camera in the center, flanked by
// the rest as live thumbnails stacked down the left and right sides. Click any
// thumbnail to promote it into the center. The center tile is kept mounted
// (constant key) so switching just swaps its source and shows the previous frame
// until the new one loads — no blank flicker. Everything fits one screen.
export function CameraWall({ cameras }: { cameras: CameraInfo[] }) {
  const [activeId, setActiveId] = useState<string>(cameras[0]?.id ?? "");

  const active = cameras.find((c) => c.id === activeId) ?? cameras[0];
  const others = cameras.filter((c) => c.id !== active?.id);
  const split = Math.ceil(others.length / 2);
  const leftCol = others.slice(0, split);
  const rightCol = others.slice(split);

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
        <div className="flex min-h-0 flex-1 gap-3">
          {leftCol.length > 0 && (
            <CameraColumn cameras={leftCol} onSelect={setActiveId} />
          )}

          {active && (
            <div className="min-h-0 flex-1">
              <CameraTile key="spotlight" camId={active.id} title={active.name} />
            </div>
          )}

          {rightCol.length > 0 && (
            <CameraColumn cameras={rightCol} onSelect={setActiveId} />
          )}
        </div>
      )}
    </div>
  );
}
