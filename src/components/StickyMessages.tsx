"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Megaphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveSystemMessages,
  type SystemMessageRow,
} from "@/app/lobby-messages/actions";
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

// The grip-handle tab takes the colour of the most urgent message in the stack.
const PRIORITY_HANDLE: Record<SystemMessageRow["priority"], string> = {
  high: "bg-red-600 text-white",
  med: "bg-amber-500 text-white",
  low: "bg-sky-600 text-white",
};

const PRIORITY_RANK: Record<SystemMessageRow["priority"], number> = {
  high: 3,
  med: 2,
  low: 1,
};

// How long the card stays open before it tucks itself back into the edge.
const INITIAL_OPEN_MS = 12000; // on load / login / a newly published message
const HOVER_OPEN_MS = 10000; // after a hover/click peek

const CARD_WIDTH = 320; // matches w-80; the card slides this far off the edge

export function StickyMessages() {
  const [messages, setMessages] = useState<SystemMessageRow[]>([]);
  const [open, setOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  const scheduleCollapse = useCallback(
    (ms: number) => {
      cancelCollapse();
      collapseTimer.current = setTimeout(() => setOpen(false), ms);
    },
    [cancelCollapse]
  );

  const openFor = useCallback(
    (ms: number) => {
      setOpen(true);
      scheduleCollapse(ms);
    },
    [scheduleCollapse]
  );

  // Fetch the active messages; refresh on the broadcast + on an interval.
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

  // Pop the drawer open for a long beat whenever the *set* of visible messages
  // changes — i.e. the first load after a refresh/login, or a newly published
  // message. The signature is value-compared, so the 60s refetch (same ids)
  // does NOT keep re-opening it.
  const signature = messages.map((m) => m.id).join(",");
  useEffect(() => {
    if (!signature) return;
    openFor(INITIAL_OPEN_MS);
  }, [signature, openFor]);

  // Clear any pending timer on unmount.
  useEffect(() => cancelCollapse, [cancelCollapse]);

  if (messages.length === 0) return null;

  const topPriority = messages.reduce<SystemMessageRow["priority"]>(
    (acc, m) =>
      PRIORITY_RANK[m.priority] > PRIORITY_RANK[acc] ? m.priority : acc,
    "low"
  );

  return (
    <div className="pointer-events-none fixed left-0 top-1/3 z-50">
      <motion.div
        initial={false}
        animate={{ x: open ? 0 : -CARD_WIDTH }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
        style={{ width: CARD_WIDTH }}
      >
        {/* Manual close — tuck the drawer away now (the message stays reachable
            via the grip handle) for when it's in the way. */}
        {open && (
          <button
            type="button"
            onClick={() => {
              cancelCollapse();
              setOpen(false);
            }}
            aria-label="סגור"
            className={cn(
              "pointer-events-auto absolute right-2 top-2 z-10 flex size-6",
              "items-center justify-center rounded-full bg-black/30 text-white",
              "shadow-sm backdrop-blur-sm transition-colors hover:bg-black/50"
            )}
          >
            <X className="size-3.5" />
          </button>
        )}

        {/* The message stack. Off-screen + inert while tucked. */}
        <div
          className={cn(
            "flex w-full flex-col gap-2 pl-3",
            open ? "pointer-events-auto" : "pointer-events-none"
          )}
          onMouseEnter={cancelCollapse}
          onMouseLeave={() => scheduleCollapse(HOVER_OPEN_MS)}
        >
          <AnimatePresence initial={false}>
            {messages.slice(0, 3).map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "rounded-lg border p-3 shadow-md backdrop-blur-sm",
                  PRIORITY_CARD[m.priority]
                )}
                role="status"
                aria-label={`הודעת לובי — עדיפות ${PRIORITY_LABEL[m.priority]}`}
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

        {/* Grip handle — pinned to the right side of the stack, so it sits flush
            at the screen edge while the cards are tucked. Hover/click/focus
            peeks the drawer open for ~10s. Faded out while the drawer is open. */}
        <button
          type="button"
          onMouseEnter={() => openFor(HOVER_OPEN_MS)}
          onFocus={() => openFor(HOVER_OPEN_MS)}
          onClick={() => (open ? setOpen(false) : openFor(HOVER_OPEN_MS))}
          aria-label={`הודעות לובי (${messages.length})`}
          className={cn(
            "pointer-events-auto absolute left-full top-4 flex flex-col items-center gap-1",
            "rounded-r-xl py-3 pl-1.5 pr-2 shadow-lg ring-1 ring-black/10",
            PRIORITY_HANDLE[topPriority],
            "transition-opacity duration-200",
            open ? "pointer-events-none opacity-0" : "opacity-100"
          )}
        >
          <Megaphone className="size-4" aria-hidden />
          {messages.length > 1 && (
            <span className="text-[10px] font-bold leading-none">
              {messages.length}
            </span>
          )}
        </button>
      </motion.div>
    </div>
  );
}
