"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  value: string;
  label: string;
  badge?: number;
};

type Props = {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function Tabs({ tabs, value, onChange, className }: Props) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 border-b border-black/10 dark:border-white/10",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative px-4 py-2 text-sm transition-colors",
              active
                ? "text-foreground font-medium"
                : "text-foreground/60 hover:text-foreground"
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold bg-red-500 text-white">
                  {tab.badge}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-2 -bottom-px h-0.5 bg-linear-to-b from-red-500 to-red-600 rounded-t-sm"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
