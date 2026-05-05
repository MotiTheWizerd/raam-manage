"use client";

import { createStore } from "zustand/vanilla";
import type { Preferences, SelectedResident } from "@/lib/preferences";

export type PreferencesActions = {
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setSelectedResident: (r: SelectedResident | null) => void;
  clearSelectedResident: () => void;
};

export type PreferencesState = Preferences & PreferencesActions;

export type PreferencesStoreApi = ReturnType<typeof createPreferencesStore>;

export function createPreferencesStore(initial: Preferences) {
  return createStore<PreferencesState>()((set) => ({
    ...initial,
    setSidebarCollapsed: (v) =>
      set((s) => ({ sidebar: { ...s.sidebar, collapsed: v } })),
    toggleSidebar: () =>
      set((s) => ({ sidebar: { ...s.sidebar, collapsed: !s.sidebar.collapsed } })),
    setSelectedResident: (r) => set({ selectedResident: r }),
    clearSelectedResident: () => set({ selectedResident: null }),
  }));
}

export function extractPreferences(state: PreferencesState): Preferences {
  return {
    sidebar: state.sidebar,
    selectedResident: state.selectedResident,
  };
}
