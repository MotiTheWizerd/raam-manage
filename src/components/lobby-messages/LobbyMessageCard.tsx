"use client";

import type { SystemMessageRow } from "@/app/lobby-messages/actions";
import { cn } from "@/lib/cn";

// The canonical lobby-message card. This is how a message reads to lobby staff
// in the StickyMessages drawer; reused verbatim in the expanded "all messages"
// view so both surfaces show the same real card.
const PRIORITY_CARD: Record<SystemMessageRow["priority"], string> = {
  high: "bg-red-500/15 border-red-500/40 text-red-950 dark:text-red-100",
  med: "bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-100",
  low: "bg-sky-500/15 border-sky-500/40 text-sky-950 dark:text-sky-100",
};

const PRIORITY_LABEL: Record<SystemMessageRow["priority"], string> = {
  high: "גבוהה",
  med: "בינונית",
  low: "נמוכה",
};

export function LobbyMessageCard({
  message,
  className,
}: {
  message: SystemMessageRow;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 shadow-md backdrop-blur-sm",
        PRIORITY_CARD[message.priority],
        className
      )}
      role="status"
      aria-label={`הודעת לובי — עדיפות ${PRIORITY_LABEL[message.priority]}`}
    >
      <div className="text-sm font-semibold leading-tight">{message.title}</div>
      <div className="mt-1 whitespace-pre-wrap text-xs opacity-90">
        {message.body}
      </div>
    </div>
  );
}
