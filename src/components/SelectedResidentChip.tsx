"use client";

import { X } from "lucide-react";
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
      <span className="truncate font-medium">
        {resident.first_name} {resident.last_name}
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
