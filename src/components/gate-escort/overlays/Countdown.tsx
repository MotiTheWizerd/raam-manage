"use client";

import { motion } from "framer-motion";

/** Big centered countdown to the lower gate opening. */
export function Countdown({ secs }: { secs: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.span
        key={secs}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="text-7xl font-black text-white tabular-nums [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]"
      >
        {secs}
      </motion.span>
    </div>
  );
}
