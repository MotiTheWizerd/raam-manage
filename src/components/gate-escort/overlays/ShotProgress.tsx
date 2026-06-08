import { cn } from "@/lib/cn";
import { SHOTS } from "../sequence.config";

/** The per-shot progress dots along the bottom of the popup. */
export function ShotProgress({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {SHOTS.map((shot, i) => (
        <span
          key={shot.cam}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === activeIndex
              ? "w-6 bg-red-500"
              : i < activeIndex
                ? "w-3 bg-red-800"
                : "w-3 bg-zinc-700"
          )}
        />
      ))}
    </div>
  );
}
