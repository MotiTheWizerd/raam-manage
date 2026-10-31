"use client";

import { Activity } from "lucide-react";
import type { CameraInfo } from "@/components/camera/CameraExplorer";
import {
  HiddenFromFollowMenu,
  MotionChips,
  MotionWall,
  MotionWallToggles,
  useMotionWall,
  useMotionWallOptions,
} from "@/components/camera/MotionWall";

// The follow wall on a screen of its own: one slim title row (the wall's icon
// controls, who's moving, the hidden-cameras dropdown) and the wall filling
// the rest.
export function FollowView({ cameras }: { cameras: CameraInfo[] }) {
  const options = useMotionWallOptions();
  const motion = useMotionWall(true, options);
  const nameOf = (id: string) => cameras.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="flex h-dvh flex-col gap-2 bg-background p-3 text-foreground">
      <div className="flex shrink-0 items-center gap-2">
        <Activity className="size-5 shrink-0 animate-pulse text-red-500" aria-hidden />
        <h1 className="shrink-0 text-lg font-semibold">מעקב תנועה</h1>
        <div className="ms-3 me-2 flex shrink-0 items-center gap-0.5">
          <MotionWallToggles options={options} />
        </div>
        <MotionChips motion={motion} nameOf={nameOf} />
        <HiddenFromFollowMenu nameOf={nameOf} />
      </div>
      <div className="min-h-0 flex-1">
        <MotionWall motion={motion} nameOf={nameOf} options={options} />
      </div>
    </div>
  );
}
