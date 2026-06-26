"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEmergency } from "@/components/EmergencyProvider";

// The header brand (logo + name). While a building-wide emergency is active the
// logo mark becomes a rotating red SIREN BEACON (a sweeping light cone + pulsing
// glow behind it) and an "כל הדלתות פתוחות" alert appears beside the name, so
// the lobby staff can't miss that every door is open.
export function BrandLogo() {
  const { active } = useEmergency();

  return (
    <div className="relative flex items-center gap-3 shrink-0">
      {/* logo mark + its beacon, scoped to the mark so the glow hugs the logo */}
      <div className="relative flex h-9 items-center justify-center">
        <AnimatePresence>
          {active && (
            <motion.div
              key="beacon"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
            >
              {/* pulsing red glow hugging the logo */}
              <motion.div
                className="absolute -inset-3 rounded-full bg-red-500/40 blur-xl"
                animate={{ opacity: [0.3, 0.75, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* full red+blue gradient disk spinning behind the logo — the
                  two-tone wheel rotates around the mark, counter to the cone */}
              <motion.div
                className="absolute left-1/2 top-1/2 h-16 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[2px]"
                style={{
                  background:
                    "conic-gradient(from 0deg, rgba(239,68,68,0.95), rgba(59,130,246,0.95), rgba(239,68,68,0.95))",
                }}
                animate={{ rotate: -360 }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
              {/* sweeping light cone, centered behind the logo */}
              <motion.div
                className="absolute size-16 rounded-full blur-[2px]"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, rgba(239,68,68,0.9) 22deg, rgba(248,113,113,0) 50deg, transparent 360deg)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Image
          src="/logo.png"
          alt="רעם בטחון"
          width={279}
          height={91}
          priority
          unoptimized
          className="relative z-10 h-9 w-auto"
        />
      </div>

      <span className="relative z-10 text-lg font-semibold tracking-tight">
        רעם בטחון
      </span>

      {/* spelled-out alert (blinking bulb + label) so the signal is unmistakable */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="alert"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 flex items-center gap-2"
          >
            <motion.span
              aria-hidden
              animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.2, 0.9] }}
              transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
              className="size-3 rounded-full bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.95)]"
            />
            <span className="whitespace-nowrap text-sm font-bold text-red-600 dark:text-red-400">
              מצב חירום — כל הדלתות פתוחות
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
