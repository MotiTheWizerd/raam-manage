"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import { cn } from "@/lib/cn";

export type GalleryImage = {
  src: string;
  alt?: string;
  /** Optional caption shown at the bottom-center of the viewer. */
  caption?: React.ReactNode;
};

type Props = {
  images: GalleryImage[];
  open: boolean;
  onClose: () => void;
  /** Image to show first when the gallery opens. Defaults to 0. */
  startIndex?: number;
};

/**
 * Reusable full-screen image viewer (lightbox). Supports one or many images:
 * with multiple it shows prev/next arrows, a counter and a thumbnail strip;
 * with a single image those chrome bits hide themselves. RTL-aware navigation
 * (ArrowRight = previous, like the rest of the app).
 */
export function Gallery({ images, open, onClose, startIndex = 0 }: Props) {
  const [index, setIndex] = useState(startIndex);
  const count = images.length;
  const many = count > 1;

  // Sync to the requested start image whenever the gallery (re)opens.
  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)));
  }, [open, startIndex, count]);

  const next = useCallback(
    () => setIndex((i) => (count ? (i + 1) % count : 0)),
    [count]
  );
  const prev = useCallback(
    () => setIndex((i) => (count ? (i - 1 + count) % count : 0)),
    [count]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") prev(); // RTL: right = previous
      else if (e.key === "ArrowLeft") next();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, next, prev]);

  if (typeof document === "undefined") return null;

  const current = images[Math.min(index, Math.max(count - 1, 0))];

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="גלריית תמונות"
        >
          {/* Top bar: counter + close */}
          <div
            className="flex items-center justify-between p-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm tabular-nums opacity-80" dir="ltr">
              {many ? `${index + 1} / ${count}` : ""}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              title="סגור"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X size={20} />
            </button>
          </div>

          {/* Stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-2">
            {many && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  aria-label="הקודם"
                  className="absolute end-2 top-1/2 z-10 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <ChevronRight size={26} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  aria-label="הבא"
                  className="absolute start-2 top-1/2 z-10 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <ChevronLeft size={26} />
                </button>
              </>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                className="relative flex max-h-full max-w-full items-center justify-center"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <NextImage
                  src={current.src}
                  alt={current.alt ?? "תמונה"}
                  width={1600}
                  height={1200}
                  unoptimized
                  className="max-h-[78vh] w-auto max-w-full object-contain"
                />
                {current.caption && (
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-black/35 px-3 py-2 text-center text-white backdrop-blur-md">
                    {current.caption}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Thumbnail strip */}
          {many && (
            <div
              className="flex justify-center gap-2 overflow-x-auto p-3"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`תמונה ${i + 1}`}
                  className={cn(
                    "h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 bg-black transition-colors",
                    i === index
                      ? "border-white"
                      : "border-white/20 opacity-60 hover:opacity-100"
                  )}
                >
                  <NextImage
                    src={img.src}
                    alt={img.alt ?? `תמונה ${i + 1}`}
                    width={160}
                    height={112}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
