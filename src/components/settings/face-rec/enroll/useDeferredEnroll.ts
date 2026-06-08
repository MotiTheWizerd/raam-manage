"use client";

import { useEffect, useState } from "react";
import type { FaceConsole } from "@/app/settings/face-actions";
import { AWAIT_WINDOW_MS, POLL_MS } from "../constants";

type Awaiting = { label: string; name: string };
type Status = { ok: boolean; msg: string };

/**
 * Drives the deferred-capture handshake: once enrollment is armed we poll the
 * console (the capture only starts when a face actually appears at the camera)
 * until the faceprint is saved, or give up after the grace window. Each poll
 * re-fetches the console, so the enrolled list below updates live.
 */
export function useDeferredEnroll(reload: () => Promise<FaceConsole>) {
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const enrolling = awaiting !== null;

  useEffect(() => {
    if (!awaiting) return;
    let active = true;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!active) return;
      const c = await reload();
      if (!active) return;
      const hit = c.faces.find((f) => f.label === awaiting.label);
      if (hit?.inModel) {
        setStatus({ ok: true, msg: `נשמר! הפנים של ${awaiting.name} נרשמו.` });
        setAwaiting(null);
        return;
      }
      if (Date.now() - startedAt > AWAIT_WINDOW_MS) {
        setStatus({
          ok: false,
          msg: "לא זוהו פנים בזמן — נסה/י שוב מול המצלמה.",
        });
        setAwaiting(null);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [awaiting, reload]);

  return { awaiting, status, enrolling, start: setAwaiting, setStatus };
}
