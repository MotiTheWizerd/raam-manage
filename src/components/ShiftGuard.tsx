"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Hourglass } from "lucide-react";
import { logout } from "@/app/login/actions";

// Shift-boundary auto-logout. The lobby runs three 8-hour shifts a day; at each
// changeover we warn the outgoing lobbyist with a countdown and then disconnect
// them so the incoming person signs in as themselves (correct attribution for
// keys / cars / door-opens / messages). Purely clock-based on this trusted
// single-building PC — same reasoning as the plaintext passwords.

// Shift changeover times (local clock). Edit here to change the schedule.
type Boundary = { h: number; m: number };
const SHIFT_BOUNDARIES: Boundary[] = [
  { h: 7, m: 0 }, // 07:00
  { h: 15, m: 0 }, // 15:00
  { h: 23, m: 0 }, // 23:00
];

const WARN_MS = 5 * 60_000; // banner appears 5 min BEFORE the changeover
const LOGOUT_MS = 5 * 60_000; // disconnect fires 5 min AFTER the changeover

// The changeover whose [B-5min, B+5min] window contains `now`, as an epoch ms —
// or null if we're not near a changeover. We test yesterday/today/tomorrow so
// the 23:00 / 07:00 windows that straddle midnight are handled uniformly.
function activeBoundary(now: number): number | null {
  const d = new Date(now);
  for (let off = -1; off <= 1; off++) {
    for (const { h, m } of SHIFT_BOUNDARIES) {
      const b = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + off,
        h,
        m,
        0,
        0
      ).getTime();
      if (now >= b - WARN_MS && now <= b + LOGOUT_MS) return b;
    }
  }
  return null;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function ShiftGuard({ loginAt }: { loginAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  // The changeover the lobbyist waved off ("בטל"). Scoped to that one boundary
  // so it can't permanently disable the auto-logout — the banner returns fresh
  // at the next shift changeover.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const firedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const boundary = activeBoundary(now);
  // Only cycle a session that BEGAN before this changeover. The incoming
  // lobbyist who just logged in (loginAt >= boundary) belongs to the new shift
  // and is left alone. A session with no known login time (pre-dates this
  // feature) is treated as old and cycled at the next changeover.
  const engaged =
    boundary !== null &&
    (loginAt == null || loginAt < boundary) &&
    dismissed !== boundary;

  const logoutAt = boundary != null ? boundary + LOGOUT_MS : 0;
  const remaining = logoutAt - now;

  useEffect(() => {
    if (engaged && remaining <= 0 && !firedRef.current) {
      firedRef.current = true;
      // Same server-action path as the manual logout button (CurrentUserChip):
      // clears the session cookie and redirects to /login.
      formRef.current?.requestSubmit();
    }
  }, [engaged, remaining]);

  if (!engaged || boundary === null) return null;

  const passed = now >= boundary; // the changeover moment has come and gone

  return (
    <>
      <form ref={formRef} action={logout} className="hidden" aria-hidden="true" />
      <motion.div
        initial={{ x: "-50%", y: -24, opacity: 0 }}
        animate={{ x: "-50%", y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={`fixed top-16 left-1/2 z-[60] flex items-center gap-3 rounded-xl px-4 py-2.5 text-white shadow-xl ring-1 ring-black/10 ${
          passed ? "bg-red-600" : "bg-amber-500"
        }`}
        role="status"
        aria-live="polite"
      >
        <Hourglass
          size={18}
          className={passed ? "animate-pulse" : ""}
          aria-hidden="true"
        />
        <div className="leading-tight">
          <div className="text-sm font-semibold">
            {passed ? "המשמרת הסתיימה" : "המשמרת שלך מסתיימת"}
          </div>
          <div className="text-xs opacity-95 tabular-nums">
            התנתקות אוטומטית בעוד {format(remaining)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ps-1">
          <button
            type="button"
            onClick={() => {
              firedRef.current = true;
              formRef.current?.requestSubmit();
            }}
            className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-black/80 transition-colors hover:bg-white/90"
          >
            התנתק עכשיו
          </button>
          <button
            type="button"
            onClick={() => setDismissed(boundary)}
            className="rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-white/50 transition-colors hover:bg-white/15"
          >
            בטל
          </button>
        </div>
      </motion.div>
    </>
  );
}
