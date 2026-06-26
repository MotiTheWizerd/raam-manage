"use client";

import { createStore } from "zustand/vanilla";
import type {
  ActiveLobbyist,
  Preferences,
  SelectedResident,
} from "@/lib/preferences";

export type PreferencesActions = {
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOrder: (order: string[]) => void;
  setTabOrder: (key: string, order: string[]) => void;
  setSelectedResident: (r: SelectedResident | null) => void;
  clearSelectedResident: () => void;
};

export type PreferencesState = Preferences &
  PreferencesActions & {
    activeLobbyist: ActiveLobbyist | null;
  };

export type PreferencesStoreApi = ReturnType<typeof createPreferencesStore>;

export function createPreferencesStore(
  initial: Preferences,
  currentUser: ActiveLobbyist | null
) {
  return createStore<PreferencesState>()((set) => ({
    ...initial,
    activeLobbyist: currentUser,
    setSidebarCollapsed: (v) =>
      set((s) => ({ sidebar: { ...s.sidebar, collapsed: v } })),
    toggleSidebar: () =>
      set((s) => ({ sidebar: { ...s.sidebar, collapsed: !s.sidebar.collapsed } })),
    setSidebarOrder: (order) =>
      set((s) => ({ sidebar: { ...s.sidebar, order } })),
    setTabOrder: (key, order) =>
      set((s) => ({ tabOrders: { ...s.tabOrders, [key]: order } })),
    setSelectedResident: (r) => set({ selectedResident: r }),
    clearSelectedResident: () => set({ selectedResident: null }),
  }));
}

export function extractPreferences(state: PreferencesState): Preferences {
  return {
    sidebar: state.sidebar,
    tabOrders: state.tabOrders,
    selectedResident: state.selectedResident,
  };
}
