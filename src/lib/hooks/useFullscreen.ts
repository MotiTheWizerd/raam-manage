"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

// Drives the browser's native Fullscreen API for a given element. Returns
// whether that element is currently fullscreen plus a toggle. Listens for
// fullscreenchange so the state stays correct when the user exits via Esc.
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void el.requestFullscreen?.();
    }
  }, [ref]);

  return { isFullscreen, toggle };
}
