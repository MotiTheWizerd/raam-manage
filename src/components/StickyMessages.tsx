"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  getActiveSystemMessages,
  type SystemMessageRow,
} from "@/app/settings/actions";
import { cn } from "@/lib/cn";
import { onSystemMessagesChanged } from "@/lib/system-messages-events";

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

export function StickyMessages() {
  const [messages, setMessages] = useState<SystemMessageRow[]>([]);

  useEffect(() => {
    let active = true;
    const fetch = () => {
      getActiveSystemMessages().then((rows) => {
        if (active) setMessages(rows);
      });
    };
    fetch();
    const id = setInterval(fetch, 60000);
    const unsubscribe = onSystemMessagesChanged(fetch);
    return () => {
      active = false;
      clearInterval(id);
      unsubscribe();
    };
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="pointer-events-none fixed top-20 left-4 z-40 w-72 space-y-2">
      <AnimatePresence initial={false}>
        {messages.slice(0, 3).map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, x: -16, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "pointer-events-auto rounded-lg border p-3 shadow-md backdrop-blur-sm",
              PRIORITY_CARD[m.priority]
            )}
            role="status"
            aria-label={`הודעת מערכת — עדיפות ${PRIORITY_LABEL[m.priority]}`}
          >
            <div className="text-sm font-semibold leading-tight">
              {m.title}
            </div>
            <div className="mt-1 text-xs opacity-90 whitespace-pre-wrap">
              {m.body}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
