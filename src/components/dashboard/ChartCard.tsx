"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Accent = "red" | "blue" | "amber" | "emerald" | "violet";

const ACCENT_TEXT: Record<Accent, string> = {
  red: "text-red-600 dark:text-red-400",
  blue: "text-sky-600 dark:text-sky-400",
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  violet: "text-violet-600 dark:text-violet-400",
};

export function ChartCard({
  title,
  subtitle,
  value,
  accent = "red",
  className,
  delay = 0,
  children,
}: {
  title: string;
  subtitle?: string;
  value?: ReactNode;
  accent?: Accent;
  className?: string;
  delay?: number;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className={cn(
        "rounded-lg border border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] p-4 flex flex-col gap-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-row-reverse">
        {value !== undefined ? (
          <div className={cn("text-3xl font-semibold tabular-nums", ACCENT_TEXT[accent])}>
            {value}
          </div>
        ) : null}
        <div>
          <div className="text-sm font-medium opacity-80">{title}</div>
          {subtitle ? (
            <div className="text-xs opacity-50 mt-0.5">{subtitle}</div>
          ) : null}
        </div>
      </div>
      {children ? <div className="min-w-0">{children}</div> : null}
    </motion.div>
  );
}

export const ACCENTS = {
  red: { stroke: "#dc2626", fill: "#dc2626", light: "#fecaca" },
  blue: { stroke: "#0284c7", fill: "#0284c7", light: "#bae6fd" },
  amber: { stroke: "#d97706", fill: "#d97706", light: "#fde68a" },
  emerald: { stroke: "#059669", fill: "#059669", light: "#a7f3d0" },
  violet: { stroke: "#7c3aed", fill: "#7c3aed", light: "#ddd6fe" },
} as const;
