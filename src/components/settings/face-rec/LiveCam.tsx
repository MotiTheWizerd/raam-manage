"use client";

import { useState } from "react";
import { FACE_URL } from "./constants";

export function LiveCam({ sentryUp }: { sentryUp: boolean }) {
  // Cache-bust so re-mount revives an idled-out worker.
  const [src, setSrc] = useState(() => `${FACE_URL}/lobby?t=${Date.now()}`);
  const [error, setError] = useState(false);

  function reconnect() {
    setError(false);
    setSrc(`${FACE_URL}/lobby?t=${Date.now()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium opacity-80">
          מצלמת לובי — שידור חי
        </span>
        <span className="flex items-center gap-1.5 text-xs opacity-60">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          זיהוי פעיל
        </span>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-black/10 bg-black dark:border-white/10">
        {sentryUp && !error ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="מצלמת זיהוי פנים"
            onError={() => setError(true)}
            className="block h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-zinc-400">
            <span>
              {sentryUp ? "המצלמה אינה זמינה" : "שירות הזיהוי אינו פעיל"}
            </span>
            {sentryUp && (
              <button
                type="button"
                onClick={reconnect}
                className="rounded-md border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
              >
                התחבר מחדש
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs opacity-50">
        הכיתוב על הוידאו מציג בזמן אמת מה המצלמה מזהה (התאמה / לא מזוהה / רישום).
      </p>
    </div>
  );
}
