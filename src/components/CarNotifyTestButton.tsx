"use client";

import { Car } from "lucide-react";
import { useIsManager } from "@/components/AuthProvider";
import { CAR_TEST_EVENT } from "@/components/NewCarNotifier";

/**
 * Manager-only header button that fires a sample "new car" alert on demand so
 * admins can preview the popup (card + chime + auto-dismiss) without waiting for
 * a real arrival. The alert itself is owned by <NewCarNotifier>; this button
 * only dispatches the trigger event, so it can sit anywhere in the header.
 */
export function CarNotifyTestButton() {
  const isManager = useIsManager();

  if (!isManager) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(CAR_TEST_EVENT))}
      title="הצג התראת רכב לדוגמה (מנהל בלבד)"
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors text-red-600 border-red-400/40 hover:bg-red-50 dark:text-red-300 dark:border-red-400/30 dark:hover:bg-red-950/30"
    >
      <Car size={14} />
      בדיקת התראת רכב
    </button>
  );
}
