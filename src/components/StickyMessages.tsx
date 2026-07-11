"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Maximize2, Megaphone, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getActiveSystemMessages,
  type SystemMessageRow,
} from "@/app/lobby-messages/actions";
import { cn } from "@/lib/cn";
import { onSystemMessagesChanged } from "@/lib/system-messages-events";
import { LobbyMessageCard } from "./lobby-messages/LobbyMessageCard";

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

// Stagger the cards flying into the centered view.
const ALL_CONTAINER_V: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.035 } },
};
const ALL_CARD_V: Variants = {
  hidden: { opacity: 0, scale: 0.8, y: 18 },
  show: { opacity: 1, scale: 1, y: 0 },
};

// A newly published message (or first load/login) pops the drawer open for this
// long, then it tucks itself back into the edge. Manual open (grip click) has no
// timer — it stays open until the lobbyist closes it.
const INITIAL_OPEN_MS = 12000;

const CARD_WIDTH = 320; // matches w-80; the card slides this far off the edge

// The drawer shows a rolling window of PAGE_SIZE cards, advancing to the next
// page every ROTATE_MS so every active message gets screen time. The query
// (getActiveSystemMessages) caps the pool at 25 → up to 7 pages.
const PAGE_SIZE = 4;
const ROTATE_MS = 60000;

export function StickyMessages() {
  const [messages, setMessages] = useState<SystemMessageRow[]>([]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
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

  // Jump the window back to the first page (highest priority / newest) and pop
  // the drawer open. Wrapped so the signature effect doesn't call setState
  // directly in its body.
  const surfaceFromTop = useCallback(() => {
    setPage(0);
    openFor(INITIAL_OPEN_MS);
  }, [openFor]);

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
    surfaceFromTop();
  }, [signature, surfaceFromTop]);

  // Clear any pending timer on unmount.
  useEffect(() => cancelCollapse, [cancelCollapse]);

  const pageCount = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));

  // Advance to the next page every minute (only when there's more than one).
  // Keyed on `page` too, so the countdown restarts after each change — a manual
  // dot tap included — instead of snapping to the next page right after.
  useEffect(() => {
    if (pageCount <= 1) return;
    const id = setTimeout(() => setPage((p) => (p + 1) % pageCount), ROTATE_MS);
    return () => clearTimeout(id);
  }, [page, pageCount]);

  if (messages.length === 0) return null;

  const topPriority = messages.reduce<SystemMessageRow["priority"]>(
    (acc, m) =>
      PRIORITY_RANK[m.priority] > PRIORITY_RANK[acc] ? m.priority : acc,
    "low"
  );

  const safePage = page % pageCount;
  const visible = messages.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  return (
    <>
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

        {/* The message stack. Off-screen + inert while tucked. A rolling window
            of PAGE_SIZE cards that swaps as a group every ROTATE_MS. */}
        <div
          className={cn(
            "flex w-full flex-col gap-2 pl-3",
            open ? "pointer-events-auto" : "pointer-events-none"
          )}
        >
          {/* Expand — fly every active message into a centered full view. */}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`הצג את כל ${messages.length} ההודעות`}
            title="הצג את כל ההודעות"
            className={cn(
              "pointer-events-auto flex items-center justify-center gap-1.5 rounded-lg py-1.5",
              "bg-black/55 text-[11px] font-semibold text-white shadow-md backdrop-blur-sm",
              "transition-colors hover:bg-black/70"
            )}
          >
            <Maximize2 className="size-3.5" aria-hidden />
            הצג הכל ({messages.length})
          </button>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={safePage}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-full flex-col gap-2"
            >
              {visible.map((m) => (
                <LobbyMessageCard key={m.id} message={m} />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Page dots — position indicator + jump-to-page. Only when the active
              messages span more than one page. Explicit black/white alpha so
              they read on the transparent drawer in either theme. */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`עמוד ${i + 1} מתוך ${pageCount}`}
                  aria-current={i === safePage}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === safePage
                      ? "w-4 bg-black/60 dark:bg-white/70"
                      : "w-1.5 bg-black/20 hover:bg-black/40 dark:bg-white/25 dark:hover:bg-white/45"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Grip handle — pinned to the right side of the stack, so it sits flush
            at the screen edge while the cards are tucked. Click it to open the
            drawer; it stays open until closed. Faded out while the drawer is open. */}
        <button
          type="button"
          onClick={() => {
            cancelCollapse();
            setOpen((o) => !o);
          }}
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

      {/* Expanded "all messages" view — every active message flown to the centre
          of the screen. Click anywhere (backdrop or a card) to snap back. Ported
          to <body> so the drawer's transform doesn't trap the fixed overlay. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {expanded && (
              <motion.div
                className="pointer-events-auto fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background/80 p-6 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setExpanded(false)}
                role="dialog"
                aria-modal="true"
                aria-label="כל הודעות הלובי"
              >
                <div className="text-center text-foreground">
                  <div className="text-lg font-semibold">כל הודעות הלובי</div>
                  <div className="text-xs opacity-60">לחץ בכל מקום כדי לחזור</div>
                </div>
                <motion.div
                  variants={ALL_CONTAINER_V}
                  initial="hidden"
                  animate="show"
                  className="grid max-h-[75vh] w-full max-w-5xl grid-cols-1 gap-3 overflow-y-auto pe-1 text-start sm:grid-cols-2 lg:grid-cols-3"
                >
                  {messages.map((m) => (
                    <motion.div key={m.id} variants={ALL_CARD_V}>
                      <LobbyMessageCard message={m} />
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
