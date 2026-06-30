"use client";

import { motion, Reorder, useDragControls } from "framer-motion";
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
  // Manager-chosen label overrides, keyed by tab value. Applied in BOTH normal
  // and edit modes. Missing value = use the tab's built-in label.
  labels?: Record<string, string>;
  // When provided (with reorderable), each edit-mode chip shows an inline
  // rename input. Reports the new label (blank = reset to the default).
  onRename?: (value: string, label: string) => void;
};

function TabLabel({ label, badge }: { label: string; badge?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold bg-red-500 text-white">
          {badge}
        </span>
      )}
    </span>
  );
}

// One draggable edit-mode chip. When `onRename` is set it drags only by the
// grip handle (dragControls) so the inline rename input stays editable —
// mirrors the sidebar's ReorderRow. The input is uncontrolled: committed on
// blur/Enter, cleared = reset to the tab's default label.
function ReorderTabChip({
  tab,
  active,
  label,
  onRename,
}: {
  tab: TabItem;
  active: boolean;
  label: string;
  onRename?: (value: string, label: string) => void;
}) {
  const controls = useDragControls();
  const editable = !!onRename;
  return (
    <Reorder.Item
      as="div"
      value={tab}
      // Editable: drag only by the grip handle so the rename input stays
      // clickable. Non-editable: drag the whole chip.
      dragListener={!editable}
      dragControls={controls}
      className={cn(
        "relative flex items-center gap-1.5 px-3 py-2 mb-1 text-sm rounded-md select-none",
        "border border-dashed border-red-400/40 bg-black/[0.02] dark:bg-white/[0.04]",
        !editable && "cursor-grab active:cursor-grabbing",
        active ? "text-foreground font-medium" : "text-foreground/70"
      )}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label="גרור לסידור"
        className="shrink-0 cursor-grab touch-none opacity-40 transition-opacity hover:opacity-70 active:cursor-grabbing"
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
      {editable ? (
        <input
          defaultValue={label}
          dir="rtl"
          aria-label={`שם הלשונית ${tab.label}`}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = label;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            const value = e.target.value.trim();
            onRename?.(tab.value, value);
            if (!value) e.target.value = tab.label; // cleared -> back to default
          }}
          className={cn(
            "min-w-0 w-32 rounded bg-transparent px-1 text-sm outline-none",
            "focus:bg-white/70 dark:focus:bg-black/30"
          )}
        />
      ) : (
        <TabLabel label={label} badge={tab.badge} />
      )}
    </Reorder.Item>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
  reorderable,
  onReorder,
  labels,
  onRename,
}: Props) {
  const layoutId = useId();
  const labelOf = (tab: TabItem) => labels?.[tab.value] ?? tab.label;

  // Edit mode: draggable chips (drag only, no tab-switch on click), styled to
  // match the sidebar edit mode (dashed red border + grip handle). With
  // `onRename` each chip also exposes an inline rename input.
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
        {tabs.map((tab) => (
          <ReorderTabChip
            key={tab.value}
            tab={tab}
            active={tab.value === value}
            label={labelOf(tab)}
            onRename={onRename}
          />
        ))}
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
            <TabLabel label={labelOf(tab)} badge={tab.badge} />
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
