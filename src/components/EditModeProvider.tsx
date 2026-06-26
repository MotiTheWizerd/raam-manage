"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type EditModeContext = {
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  toggle: () => void;
};

const Ctx = createContext<EditModeContext | null>(null);

/**
 * Ephemeral, session-only "edit mode" toggle (default OFF, never persisted).
 * Shared between the header toggle and the sidebar so a manager can rearrange
 * the menu by dragging. Mounted inside the logged-in app shell.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  return (
    <Ctx.Provider
      value={{ editMode, setEditMode, toggle: () => setEditMode((v) => !v) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useEditMode(): EditModeContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useEditMode must be used inside EditModeProvider");
  }
  return ctx;
}
