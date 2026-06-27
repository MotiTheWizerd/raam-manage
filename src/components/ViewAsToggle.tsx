"use client";

import { Eye, ShieldCheck } from "lucide-react";
import {
  useIsActualManager,
  useSetViewAsLobbyist,
  useViewAsLobbyist,
} from "@/components/AuthProvider";
import { cn } from "@/lib/cn";

/**
 * Manager-only header button to preview the app as a regular lobbyist would
 * see it (client-side role gates only — never changes real server access).
 * Stays visible while previewing (uses the real role) so the manager can
 * switch back. Amber while previewing = "you are not seeing your full powers".
 */
export function ViewAsToggle() {
  const isActualManager = useIsActualManager();
  const viewAsLobbyist = useViewAsLobbyist();
  const setViewAsLobbyist = useSetViewAsLobbyist();

  if (!isActualManager) return null;

  return (
    <button
      type="button"
      onClick={() => setViewAsLobbyist(!viewAsLobbyist)}
      aria-pressed={viewAsLobbyist}
      title={
        viewAsLobbyist
          ? "חזרה לתצוגת מנהל"
          : "תצוגה כפקיד לובי רגיל (תצוגה בלבד)"
      }
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors",
        viewAsLobbyist
          ? "bg-amber-500 text-white border-amber-600 shadow-sm hover:bg-amber-600"
          : "text-foreground/70 border-black/10 dark:border-white/15 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
      )}
    >
      {viewAsLobbyist ? <Eye size={14} /> : <ShieldCheck size={14} />}
      {viewAsLobbyist ? "תצוגת לובי" : "תצוגת מנהל"}
    </button>
  );
}
