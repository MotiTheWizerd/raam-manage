"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, Car, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLatestCarEvent } from "@/app/events/cars-actions";
import { cn } from "@/lib/cn";

const POLL_MS = 5000;
const AUTO_DISMISS_MS = 12000;
const MAX_VISIBLE = 4;
const SOUND_PREF_KEY = "raam.carNotify.sound";

type CarNotification = {
  key: number;
  id: number;
  plate: string;
  status: string;
  guestName: string | null;
  ownerName: string | null;
  apartmentNumber: string | null;
};

function isApproved(status: string): boolean {
  return !!status && status.toUpperCase() !== "INVALID";
}

// A short, pleasant two-note chime via WebAudio — no asset to ship. Browsers
// gate audio until a user gesture; lobbyists log in by clicking, so by the time
// a car arrives the context is unlocked.
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
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  } catch {
    // Audio is best-effort; never let it break the popup.
  }
}

export function NewCarNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CarNotification[]>([]);
  const [soundOn, setSoundOn] = useState(true);

  // Refs so the polling closure always reads current values without re-binding.
  const lastSeenIdRef = useRef<number | null>(null);
  const baselinedRef = useRef(false);
  const soundOnRef = useRef(true);
  const onCarsTabRef = useRef(false);
  const keyRef = useRef(0);

  // The רכבים tab already live-updates; suppress popups while it's open.
  const onCarsTab =
    pathname === "/events" && searchParams.get("tab") === "cars";
  useEffect(() => {
    onCarsTabRef.current = onCarsTab;
  }, [onCarsTab]);

  // Restore the sound preference (per lobby PC).
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

  const openCarsTab = useCallback(
    (key: number) => {
      dismiss(key);
      router.push("/events?tab=cars");
    },
    [dismiss, router]
  );

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const latest = await getLatestCarEvent();
        if (!active || !latest) return;

        // First successful read establishes the baseline silently — existing
        // cars must not pop just because the page loaded.
        if (!baselinedRef.current) {
          baselinedRef.current = true;
          lastSeenIdRef.current = latest.id;
          return;
        }

        const prev = lastSeenIdRef.current;
        if (prev !== null && latest.id > prev) {
          lastSeenIdRef.current = latest.id;
          // Advance the baseline even when suppressed, so leaving the cars tab
          // doesn't replay cars the lobbyist already watched there.
          if (onCarsTabRef.current) return;

          const key = ++keyRef.current;
          const note: CarNotification = { key, ...latest };
          setItems((cur) => [note, ...cur].slice(0, MAX_VISIBLE));
          if (soundOnRef.current) playChime();
          window.setTimeout(() => {
            if (active) dismiss(key);
          }, AUTO_DISMISS_MS);
        } else if (prev === null) {
          lastSeenIdRef.current = latest.id;
        }
      } catch {
        // Transient SLPR/network hiccup — just try again next tick.
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
    <div className="pointer-events-none fixed top-20 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {items.map((n) => {
            const approved = isApproved(n.status);
            return (
              <motion.div
                key={n.key}
                layout
                initial={{ opacity: 0, x: 28, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 28, scale: 0.94 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className="pointer-events-auto overflow-hidden rounded-2xl border border-red-500/40 bg-white shadow-2xl shadow-red-900/20 ring-1 ring-red-500/20 dark:border-red-500/40 dark:bg-zinc-900"
                role="status"
              >
                {/* Bold brand-red header so the alert reads instantly. */}
                <div className="flex items-center justify-between gap-2 bg-gradient-to-l from-red-600 to-rose-500 px-3 py-2 text-white">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                      <Car size={15} />
                    </span>
                    רכב חדש בכניסה
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSound();
                      }}
                      aria-label={soundOn ? "כבה צליל התראה" : "הפעל צליל התראה"}
                      title={
                        soundOn ? "צליל פעיל — לחץ להשתקה" : "מושתק — לחץ להפעלה"
                      }
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-md text-white transition-colors hover:bg-white/20",
                        !soundOn && "opacity-60"
                      )}
                    >
                      {soundOn ? <Bell size={14} /> : <BellOff size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss(n.key);
                      }}
                      aria-label="סגור"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white transition-colors hover:bg-white/20"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Clickable body -> opens the cars tab. */}
                <button
                  type="button"
                  onClick={() => openCarsTab(n.key)}
                  className="block w-full px-3 py-2.5 text-start transition-colors hover:bg-red-50/70 dark:hover:bg-red-950/20"
                  title="פתח את לשונית הרכבים"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-xl font-extrabold leading-none"
                      dir="ltr"
                    >
                      {n.plate || "—"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold",
                        approved
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      )}
                    >
                      {approved ? "מאושר" : "לא מאושר"}
                    </span>
                  </div>
                  {n.guestName ? (
                    <div className="mt-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
                      אורח מזוהה: {n.guestName}
                      {n.apartmentNumber ? ` · דירה ${n.apartmentNumber}` : ""}
                    </div>
                  ) : n.ownerName ? (
                    <div className="mt-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                      רכב רשום: {n.ownerName}
                      {n.apartmentNumber ? ` · דירה ${n.apartmentNumber}` : ""}
                    </div>
                  ) : null}
                  <div className="mt-1.5 text-[11px] opacity-50">
                    לחץ לפתיחת לשונית הרכבים ←
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
    </div>
  );
}
