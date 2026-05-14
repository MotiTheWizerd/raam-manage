"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth";

const Ctx = createContext<CurrentUser | null>(null);

type Props = {
  user: CurrentUser | null;
  children: ReactNode;
};

export function AuthProvider({ user, children }: Props) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(Ctx);
}

export function useIsManager(): boolean {
  return useContext(Ctx)?.user_role === "manager";
}
