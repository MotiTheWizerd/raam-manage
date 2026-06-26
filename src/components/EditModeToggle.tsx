"use client";

import { Check, Pencil } from "lucide-react";
import { useIsManager } from "@/components/AuthProvider";
import { useEditMode } from "@/components/EditModeProvider";
import { cn } from "@/lib/cn";

/**
 * Header toggle that turns "edit mode" on/off. Manager-only (renders nothing
 * for lobbyists). While on, the sidebar menu items become drag-to-reorder.
 */
export function EditModeToggle() {
  const isManager = useIsManager();
  const { editMode, toggle } = useEditMode();

  if (!isManager) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editMode}
      title="מצב עריכה — סידור תפריט הצד בגרירה"
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors",
        editMode
          ? "bg-red-500 text-white border-red-600 shadow-sm hover:bg-red-600"
          : "text-foreground/70 border-black/10 dark:border-white/15 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
      )}
    >
      {editMode ? <Check size={14} /> : <Pencil size={14} />}
      עריכה
    </button>
  );
}
