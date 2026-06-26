"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createPreferencesStore,
  extractPreferences,
  type PreferencesState,
  type PreferencesStoreApi,
} from "@/lib/store/preferences-store";
import {
  savePreferences,
  type ActiveLobbyist,
  type Preferences,
} from "@/lib/preferences";

const Ctx = createContext<PreferencesStoreApi | null>(null);

type Props = {
  initial: Preferences;
  currentUser: ActiveLobbyist | null;
  children: ReactNode;
};

export function PreferencesProvider({ initial, currentUser, children }: Props) {
  const [store] = useState<PreferencesStoreApi>(() =>
    createPreferencesStore(initial, currentUser)
  );

  // Debounced auto-save: subscribe to store, push every change to the server.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = store.subscribe((state) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        savePreferences(extractPreferences(state)).catch((e) =>
          console.error("savePreferences failed", e)
        );
      }, 300);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

function usePreferencesStore<T>(selector: (state: PreferencesState) => T): T {
  const store = useContext(Ctx);
  if (!store) {
    throw new Error("usePreferencesStore must be used inside PreferencesProvider");
  }
  return useStore(store, selector);
}

export const useSidebarCollapsed = () =>
  usePreferencesStore((s) => s.sidebar.collapsed);
export const useToggleSidebar = () =>
  usePreferencesStore((s) => s.toggleSidebar);
export const useSidebarOrder = () =>
  usePreferencesStore((s) => s.sidebar.order);
export const useSetSidebarOrder = () =>
  usePreferencesStore((s) => s.setSidebarOrder);
export const useTabOrder = (key: string) =>
  usePreferencesStore((s) => s.tabOrders[key]);
export const useSetTabOrder = () =>
  usePreferencesStore((s) => s.setTabOrder);
export const useSelectedResident = () =>
  usePreferencesStore((s) => s.selectedResident);
export const useSetSelectedResident = () =>
  usePreferencesStore((s) => s.setSelectedResident);
export const useClearSelectedResident = () =>
  usePreferencesStore((s) => s.clearSelectedResident);
export const useActiveLobbyist = () =>
  usePreferencesStore((s) => s.activeLobbyist);
