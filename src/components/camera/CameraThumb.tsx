"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

// A single lazy-loaded still from a camera, for the group picker — enough to
// recognize which physical camera a placeholder name is. Uses native lazy
// loading so scrolling a long list only fetches the thumbnails in view, and it
// never polls (one frame, not a live feed). Fills its (aspect-video) parent.
// `src` overrides the default gate-cam URL (e.g. a recorder-channel snapshot).
export function CameraThumb({ camId, src }: { camId?: string; src?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  return (
    <>
      {state !== "ok" && (
        <div className="absolute inset-0 grid place-items-center text-[11px] text-zinc-500">
          {state === "error" ? "אין תצוגה" : "טוען…"}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src ?? `/api/gate-cam?cam=${camId}`}
        alt=""
        loading="lazy"
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className={cn(
          "h-full w-full object-cover transition-opacity",
          state === "ok" ? "opacity-100" : "opacity-0"
        )}
      />
    </>
  );
}
