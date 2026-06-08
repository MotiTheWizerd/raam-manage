"use client";

import { Clapperboard, Maximize2, Minimize2, ScanEye, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  detect: boolean;
  onToggleDetect: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
};

export function EscortHeader({
  detect,
  onToggleDetect,
  isFullscreen,
  onToggleFullscreen,
  onClose,
}: Props) {
  return (
    <div className="flex items-center justify-between bg-zinc-900 px-3 py-2">
      <div className="flex items-center gap-2">
        <Clapperboard className="size-4 text-red-500" />
        <span className="text-sm font-semibold text-white">
          ליווי רכב — שידור חי
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleDetect}
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
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          {isFullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="עצור"
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
