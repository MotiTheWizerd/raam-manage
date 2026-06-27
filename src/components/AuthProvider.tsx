"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CurrentUser } from "@/lib/auth";

type AuthContextValue = {
  user: CurrentUser | null;
  // Manager-only preview: render the app as a regular lobbyist would see it.
  viewAsLobbyist: boolean;
  setViewAsLobbyist: (v: boolean) => void;
};

const Ctx = createContext<AuthContextValue>({
  user: null,
  viewAsLobbyist: false,
  setViewAsLobbyist: () => {},
});

type Props = {
  user: CurrentUser | null;
  children: ReactNode;
};

export function AuthProvider({ user, children }: Props) {
  // Ephemeral, session-only, default OFF. Flips the CLIENT-side role gates so a
  // manager can preview the regular-staff UI. Server actions still enforce the
  // real role via the session cookie — this never grants/removes real access.
  const [viewAsLobbyist, setViewAsLobbyist] = useState(false);
  const value = useMemo(
    () => ({ user, viewAsLobbyist, setViewAsLobbyist }),
    [user, viewAsLobbyist]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(Ctx).user;
}

// The real role from the session. Use for controls that must stay available
// even while previewing as a lobbyist (e.g. the "switch back" button).
export function useIsActualManager(): boolean {
  return useContext(Ctx).user?.user_role === "manager";
}

// Effective role for UI gating: false while a manager previews as a lobbyist.
export function useIsManager(): boolean {
  const { user, viewAsLobbyist } = useContext(Ctx);
  return user?.user_role === "manager" && !viewAsLobbyist;
}

export function useViewAsLobbyist(): boolean {
  return useContext(Ctx).viewAsLobbyist;
}

export function useSetViewAsLobbyist(): (v: boolean) => void {
  return useContext(Ctx).setViewAsLobbyist;
}
