"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, ScanFace, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLatestFaceEvent } from "@/app/settings/face-actions";
import { cn } from "@/lib/cn";

const POLL_MS = 4000;
const AUTO_DISMISS_MS = 10000;
const MAX_VISIBLE = 3;
const SOUND_PREF_KEY = "raam.faceNotify.sound";

type FaceNote = {
  key: number;
  id: number;
  name: string;
};

// A warm rising three-note chime via WebAudio (no asset). Audio is unlocked by
// the lobbyist's login click, so it's ready by the time someone is recognized.
let audioCtx: AudioContext | null = null;
function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [659.25, 880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.1;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  } catch {
    /* audio is best-effort */
  }
}

export function FaceNotifier() {
  const [items, setItems] = useState<FaceNote[]>([]);
  const [soundOn, setSoundOn] = useState(true);

  const lastSeenIdRef = useRef<number | null>(null);
  const baselinedRef = useRef(false);
  const soundOnRef = useRef(true);
  const keyRef = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(SOUND_PREF_KEY);
    if (saved !== null) {
      const on = saved === "1";
      setSoundOn(on);
      soundOnRef.current = on;
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      soundOnRef.current = next;
      window.localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const dismiss = useCallback((key: number) => {
    setItems((prev) => prev.filter((n) => n.key !== key));
  }, []);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const latest = await getLatestFaceEvent();
        if (!active || !latest) return;

        // First read sets the baseline silently — don't pop for prior entries.
        if (!baselinedRef.current) {
          baselinedRef.current = true;
          lastSeenIdRef.current = latest.id;
          return;
        }

        const prev = lastSeenIdRef.current;
        if (prev !== null && latest.id > prev) {
          lastSeenIdRef.current = latest.id;
          const key = ++keyRef.current;
          setItems((cur) =>
            [{ key, id: latest.id, name: latest.name }, ...cur].slice(0, MAX_VISIBLE)
          );
          if (soundOnRef.current) playChime();
          window.setTimeout(() => {
            if (active) dismiss(key);
          }, AUTO_DISMISS_MS);
        } else if (prev === null) {
          lastSeenIdRef.current = latest.id;
        }
      } catch {
        /* transient hiccup — retry next tick */
      }
    }

    poll();
    const intervalId = window.setInterval(poll, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [dismiss]);

  return (
    <div className="pointer-events-none flex w-full flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.div
            key={n.key}
            layout
            initial={{ opacity: 0, x: -28, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -28, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-emerald-500/40 bg-white shadow-2xl shadow-emerald-900/20 ring-1 ring-emerald-500/20 dark:border-emerald-500/40 dark:bg-zinc-900"
            role="status"
          >
            <div className="flex items-center justify-between gap-2 bg-gradient-to-l from-emerald-600 to-teal-500 px-3 py-2 text-white">
              <span className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                  <ScanFace size={15} />
                </span>
                כניסה מזוהה
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSound();
                  }}
                  aria-label={soundOn ? "כבה צליל התראה" : "הפעל צליל התראה"}
                  title={soundOn ? "צליל פעיל — לחץ להשתקה" : "מושתק — לחץ להפעלה"}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md text-white transition-colors hover:bg-white/20",
                    !soundOn && "opacity-60"
                  )}
                >
                  {soundOn ? <Bell size={14} /> : <BellOff size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(n.key)}
                  aria-label="סגור"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white transition-colors hover:bg-white/20"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-3 py-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/face-event/image?id=${n.id}`}
                alt={n.name}
                className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-black/10 dark:ring-white/10"
              />
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold leading-tight text-emerald-700 dark:text-emerald-300">
                  {n.name}
                </div>
                <div className="text-xs opacity-60">נכנס/ה ללובי</div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
