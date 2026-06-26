"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getEmergencyStatus } from "@/app/doors/actions";

type EmergencyContextValue = {
  // True while the building-wide emergency (all doors forced open) is active.
  active: boolean;
  // Optimistic setter — the trigger flips it instantly, the poll keeps it honest.
  setActive: (v: boolean) => void;
  // Re-read the live state a beat later (GeoVision's GET_ALL_DEVICES lags the
  // DOOR_OPERATION by ~1-2s, so an instant read is stale).
  refreshSoon: () => void;
};

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

const POLL_MS = 15000;
const RECHECK_MS = 2500;

// Holds the live "are all doors forced open?" state in one place so both the
// trigger (the gate drawer ⋮ menu) and the alarm signal (the header logo) stay
// in sync. Polls the controller so a hold/release done from anywhere — the app,
// the GeoVision GUI, a page refresh — is reflected.
export function EmergencyProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);

  const refresh = useCallback(async () => {
    const r = await getEmergencyStatus();
    if (r.ok) setActive(r.active);
  }, []);

  const refreshSoon = useCallback(() => {
    setTimeout(() => void refresh(), RECHECK_MS);
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await getEmergencyStatus();
      if (alive && r.ok) setActive(r.active);
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <EmergencyContext.Provider value={{ active, setActive, refreshSoon }}>
      {children}
    </EmergencyContext.Provider>
  );
}

export function useEmergency(): EmergencyContextValue {
  const ctx = useContext(EmergencyContext);
  if (!ctx) throw new Error("useEmergency must be used within EmergencyProvider");
  return ctx;
}
