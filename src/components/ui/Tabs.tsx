"use client";

import { motion, Reorder } from "framer-motion";
import { GripVertical } from "lucide-react";
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
  // When true the tabs become drag-to-reorder (manager edit mode). `tabs` is
  // assumed to already be in the saved order; `onReorder` reports the new one.
  reorderable?: boolean;
  onReorder?: (orderedValues: string[]) => void;
};

function TabLabel({ tab }: { tab: TabItem }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {tab.label}
      {tab.badge !== undefined && tab.badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold bg-red-500 text-white">
          {tab.badge}
        </span>
      )}
    </span>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
  reorderable,
  onReorder,
}: Props) {
  const layoutId = useId();

  // Edit mode: draggable chips (drag only, no tab-switch on click), styled to
  // match the sidebar edit mode (dashed red border + grip handle).
  if (reorderable) {
    return (
      <Reorder.Group
        as="div"
        axis="x"
        values={tabs}
        onReorder={(next: TabItem[]) =>
          onReorder?.(next.map((t) => t.value))
        }
        className={cn(
          "flex items-center gap-1 border-b border-black/10 dark:border-white/10",
          className
        )}
      >
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <Reorder.Item
              as="div"
              key={tab.value}
              value={tab}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 mb-1 text-sm rounded-md cursor-grab active:cursor-grabbing select-none",
                "border border-dashed border-red-400/40 bg-black/[0.02] dark:bg-white/[0.04]",
                active ? "text-foreground font-medium" : "text-foreground/70"
              )}
            >
              <GripVertical
                size={13}
                aria-hidden="true"
                className="shrink-0 opacity-40"
              />
              <TabLabel tab={tab} />
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    );
  }

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
            <TabLabel tab={tab} />
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
