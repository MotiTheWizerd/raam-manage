"use client";

import { PhoneCall, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { inputBase } from "@/components/ui/Input";
import {
  useClearSelectedResident,
  useSelectedResident,
} from "@/components/PreferencesProvider";

type Props = {
  className?: string;
};

export function SelectedResidentChip({ className }: Props) {
  const resident = useSelectedResident();
  const clear = useClearSelectedResident();

  if (!resident) return null;

  return (
    <div
      className={cn(
        inputBase,
        "flex items-center justify-between gap-2 cursor-default",
        className
      )}
      role="status"
      aria-label="דייר נבחר"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">
          {resident.first_name} {resident.last_name}
        </span>
        {resident.must_call === 1 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
            <PhoneCall size={11} aria-hidden="true" />
            חייבים להתקשר
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-xs opacity-70">
          דירה {resident.apartment_number}
        </span>
        <button
          type="button"
          onClick={clear}
          aria-label="נקה בחירה"
          title="נקה בחירה"
          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
