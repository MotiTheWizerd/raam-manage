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
  setSidebarLabel: (href: string, label: string) => void;
  setTabOrder: (key: string, order: string[]) => void;
  setTabLabel: (key: string, value: string, label: string) => void;
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
    setSidebarLabel: (href, label) =>
      set((s) => {
        const labels = { ...s.sidebar.labels };
        const trimmed = label.trim();
        if (trimmed) labels[href] = trimmed;
        else delete labels[href];
        return { sidebar: { ...s.sidebar, labels } };
      }),
    setTabOrder: (key, order) =>
      set((s) => ({ tabOrders: { ...s.tabOrders, [key]: order } })),
    setTabLabel: (key, value, label) =>
      set((s) => {
        const group = { ...(s.tabLabels[key] ?? {}) };
        const trimmed = label.trim();
        if (trimmed) group[value] = trimmed;
        else delete group[value];
        const tabLabels = { ...s.tabLabels };
        if (Object.keys(group).length) tabLabels[key] = group;
        else delete tabLabels[key];
        return { tabLabels };
      }),
    setSelectedResident: (r) => set({ selectedResident: r }),
    clearSelectedResident: () => set({ selectedResident: null }),
  }));
}

export function extractPreferences(state: PreferencesState): Preferences {
  return {
    sidebar: state.sidebar,
    tabOrders: state.tabOrders,
    tabLabels: state.tabLabels,
    selectedResident: state.selectedResident,
  };
}
