"use client";

import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  /** "md" = equal-width segments (form toggle); "sm" = compact pills (filters). */
  size?: "sm" | "md";
};

/**
 * Boxed pill toggle — the shared segmented control used for the enroll mode
 * (דייר/עובד) and the entry-log filter (הכל/מזוהים/לא מזוהים).
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
  className,
  size = "md",
}: Props<T>) {
  return (
    <div
      className={cn(
        "flex rounded-lg border border-black/10 p-0.5 dark:border-white/10",
        className
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={cn(
            "rounded-md font-medium transition-colors disabled:opacity-50",
            size === "sm" ? "px-3 py-1 text-xs" : "flex-1 px-3 py-1.5 text-sm",
            value === o.value
              ? "bg-foreground/10"
              : "opacity-60 hover:opacity-100"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
