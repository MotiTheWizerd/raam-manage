"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getFaceConsole, type FaceConsole } from "@/app/settings/face-actions";

type FaceConsoleContextValue = {
  data: FaceConsole | null;
  loading: boolean;
  /** Re-fetch the console. Returns the fresh snapshot so callers can inspect it. */
  reload: () => Promise<FaceConsole>;
};

const FaceConsoleContext = createContext<FaceConsoleContextValue | null>(null);

/**
 * Single source of truth for the face console. Every panel consumes this and
 * reacts to `reload()` — no callbacks are drilled between siblings, so the
 * enroll/arm/forget flows stay decoupled from the views that display their
 * results (an enrollment saving simply flows back through the shared state).
 */
export function FaceConsoleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FaceConsole | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const c = await getFaceConsole();
    setData(c);
    setLoading(false);
    return c;
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <FaceConsoleContext.Provider value={{ data, loading, reload }}>
      {children}
    </FaceConsoleContext.Provider>
  );
}

export function useFaceConsole() {
  const ctx = useContext(FaceConsoleContext);
  if (!ctx) {
    throw new Error("useFaceConsole must be used within a FaceConsoleProvider");
  }
  return ctx;
}
