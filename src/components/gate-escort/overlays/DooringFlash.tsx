"use client";

import { motion } from "framer-motion";

/** "פותח דלת" flash — big-centered the moment the lower gate opens. */
export function DooringFlash() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="px-4 text-center text-7xl font-black text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]"
      >
        פותח דלת
      </motion.span>
    </div>
  );
}
