"use client";

import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  /**
   * CSS selector for the scroll container to watch and scroll. Defaults to the
   * app's main content area (the element that actually scrolls — the window
   * itself never does in this layout).
   */
  targetSelector?: string;
  /** Show the button once the container is scrolled past this many pixels. */
  threshold?: number;
  className?: string;
};

/**
 * Floating "back to top" button. Watches a scroll container and, once it's
 * scrolled past `threshold`, fades in a button that smooth-scrolls it back up.
 * Reusable on any long page — drop it in and point it at the right container.
 */
export function BackToTop({
  targetSelector = "main",
  threshold = 300,
  className,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The page may scroll on the target container OR on the window itself,
    // depending on content height. Track both and react to whichever moves.
    const readTop = () => {
      const el = document.querySelector<HTMLElement>(targetSelector);
      const elTop = el?.scrollTop ?? 0;
      const winTop = window.scrollY || document.documentElement.scrollTop || 0;
      return Math.max(elTop, winTop);
    };

    const onScroll = () => setVisible(readTop() > threshold);
    onScroll(); // sync initial state (e.g. on navigation into a scrolled view)

    // capture:true catches scroll from any descendant scroller (scroll events
    // don't bubble, but they do pass through the capture phase on window).
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, [targetSelector, threshold]);

  function scrollToTop() {
    const el = document.querySelector<HTMLElement>(targetSelector);
    if (el && el.scrollTop > 0) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="חזרה למעלה"
          title="חזרה למעלה"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className={cn(
            "fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full",
            "bg-red-600 text-white shadow-lg shadow-black/20 hover:bg-red-700",
            "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
            className
          )}
        >
          <ArrowUp size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
