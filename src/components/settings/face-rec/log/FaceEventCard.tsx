"use client";

import { ScanFace } from "lucide-react";
import { type FaceEventRow } from "@/app/settings/face-actions";
import { cn } from "@/lib/cn";
import { formatWhen } from "../ui/formatWhen";

export function FaceEventCard({ ev }: { ev: FaceEventRow }) {
  const known = ev.kind === "known";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white/40 dark:bg-white/[0.02]",
        known ? "border-emerald-500/30" : "border-amber-500/30"
      )}
    >
      <div className="relative aspect-square w-full bg-black">
        {ev.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/face-event/image?id=${ev.id}`}
            alt={ev.name ?? "לא מזוהה"}
            loading="lazy"
            className="block h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            <ScanFace className="size-8" />
          </div>
        )}
        <span
          className={cn(
            "absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            known ? "bg-emerald-500/90 text-white" : "bg-amber-500/90 text-white"
          )}
        >
          {known ? "מזוהה" : "לא מזוהה"}
        </span>
      </div>
      <div className="px-2.5 py-2">
        <div className="truncate text-sm font-medium">
          {known ? ev.name || "—" : "לא מזוהה"}
        </div>
        <div className="text-[11px] opacity-50">{formatWhen(ev.createdAt)}</div>
      </div>
    </div>
  );
}
