"use client";

import {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Draw = (frame: ImageBitmap) => void;

export type LiveWall = {
  /** The wall has few tiles: every tile gets the HD main stream. */
  hd: boolean;
  /** Start a camera's video into `draw`; returns the stop. */
  subscribe: (camId: string, hd: boolean, draw: Draw) => () => void;
};

// Present only inside the follow wall; tiles elsewhere keep snapshot polling.
export const LiveWallContext = createContext<LiveWall | null>(null);

// Wait this long after the tile list changes before reconnecting, so a burst
// of tiles arriving together costs one reconnect, not several.
const RECONNECT_DEBOUNCE_MS = 150;
const RETRY_MS = 1000;
// Frames a tile decodes at once. One at a time capped a big HD tile at ~10-14
// fps in testing (a 720p decode can take 50 ms on a busy box); two overlap.
const DECODES_PER_TILE = 2;

// The follow wall's live video hub: ONE request (/api/live-wall) for every
// tile on the wall, reopened whenever the set of tiles changes. Frames are
// decoded off the main thread and handed to the tile as an ImageBitmap; a
// tile that falls behind skips to the newest frame.
export function LiveWallProvider({ hd, children }: { hd: boolean; children: ReactNode }) {
  const subs = useRef(new Map<string, { hd: boolean; draw: Draw }>());
  // "id,id:hd,..." — what the open request carries; a change reopens it.
  const [cams, setCams] = useState("");

  const wall = useMemo<LiveWall>(
    () => ({
      hd,
      subscribe(camId, camHd, draw) {
        subs.current.set(camId, { hd: camHd, draw });
        setCams(camList(subs.current));
        return () => {
          if (subs.current.get(camId)?.draw === draw) subs.current.delete(camId);
          setCams(camList(subs.current));
        };
      },
    }),
    [hd]
  );

  useEffect(() => {
    if (!cams) return;
    const ctrl = new AbortController();
    // Per camera: decodes in flight, the newest frame waiting for a free slot,
    // and the number of the last frame drawn (two decodes can finish out of
    // order; an older one is dropped, never drawn over a newer one).
    const inFlight = new Map<string, number>();
    const pending = new Map<string, { blob: Blob; n: number }>();
    const drawn = new Map<string, number>();
    let frameNo = 0;

    const decode = async (cam: string, blob: Blob, n: number) => {
      inFlight.set(cam, (inFlight.get(cam) ?? 0) + 1);
      try {
        const frame = await createImageBitmap(blob);
        const sub = ctrl.signal.aborted ? undefined : subs.current.get(cam);
        if (sub && n > (drawn.get(cam) ?? 0)) {
          drawn.set(cam, n);
          sub.draw(frame);
        } else frame.close();
      } catch {
        // a broken frame — skip it
      } finally {
        inFlight.set(cam, (inFlight.get(cam) ?? 1) - 1);
        const next = pending.get(cam);
        if (next) {
          pending.delete(cam);
          void decode(cam, next.blob, next.n);
        }
      }
    };
    const deliver = (cam: string, jpeg: Uint8Array<ArrayBuffer>) => {
      const blob = new Blob([jpeg], { type: "image/jpeg" });
      const n = ++frameNo;
      if ((inFlight.get(cam) ?? 0) >= DECODES_PER_TILE) pending.set(cam, { blob, n });
      else void decode(cam, blob, n);
    };

    const run = async () => {
      while (!ctrl.signal.aborted) {
        try {
          const res = await fetch(`/api/live-wall?cams=${encodeURIComponent(cams)}`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (res.ok && res.body) await readFrames(res.body, deliver);
        } catch {
          // aborted, or the app restarting — retry below
        }
        if (ctrl.signal.aborted) return;
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
    };
    const timer = setTimeout(run, RECONNECT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [cams]);

  return <LiveWallContext.Provider value={wall}>{children}</LiveWallContext.Provider>;
}

function camList(subs: Map<string, { hd: boolean }>): string {
  return [...subs]
    .map(([id, s]) => (s.hd ? `${id}:hd` : id))
    .sort()
    .join(",");
}

// Splits the /api/live-wall body ("<cam> <bytes>\n" + JPEG, repeated) into frames.
async function readFrames(
  body: ReadableStream<Uint8Array>,
  onFrame: (cam: string, jpeg: Uint8Array<ArrayBuffer>) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = new Uint8Array(0);
  let cam = "";
  let need = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const joined = new Uint8Array(buf.length + value.length);
    joined.set(buf);
    joined.set(value, buf.length);
    buf = joined;
    for (;;) {
      if (need < 0) {
        const nl = buf.indexOf(10); // "\n"
        if (nl < 0) break;
        const [id, len] = decoder.decode(buf.subarray(0, nl)).split(" ");
        cam = id;
        need = Number(len);
        buf = buf.subarray(nl + 1);
      }
      if (buf.length < need) break;
      onFrame(cam, buf.slice(0, need));
      buf = buf.subarray(need);
      need = -1;
    }
  }
}
