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

  // Debounced auto-save: subscribe to store, push every change to the server —
  // only the fields that changed, so another window's changes to the shared
  // row aren't overwritten with this window's stale copy.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const dirty = new Set<keyof Preferences>();
    const unsub = store.subscribe((state, prev) => {
      const next = extractPreferences(state);
      const before = extractPreferences(prev);
      for (const key of Object.keys(next) as (keyof Preferences)[]) {
        if (next[key] !== before[key]) dirty.add(key);
      }
      if (dirty.size === 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const latest = extractPreferences(store.getState());
        const changed = Object.fromEntries(
          [...dirty].map((key) => [key, latest[key]])
        ) as Partial<Preferences>;
        dirty.clear();
        savePreferences(changed).catch((e) =>
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
export const useSidebarLabels = () =>
  usePreferencesStore((s) => s.sidebar.labels);
export const useSetSidebarLabel = () =>
  usePreferencesStore((s) => s.setSidebarLabel);
export const useTabOrder = (key: string) =>
  usePreferencesStore((s) => s.tabOrders[key]);
export const useSetTabOrder = () =>
  usePreferencesStore((s) => s.setTabOrder);
export const useTabLabels = (key: string) =>
  usePreferencesStore((s) => s.tabLabels[key]);
export const useSetTabLabel = () =>
  usePreferencesStore((s) => s.setTabLabel);
export const useSelectedResident = () =>
  usePreferencesStore((s) => s.selectedResident);
export const useSetSelectedResident = () =>
  usePreferencesStore((s) => s.setSelectedResident);
export const useClearSelectedResident = () =>
  usePreferencesStore((s) => s.clearSelectedResident);
export const useLobbyMessagesDismissed = () =>
  usePreferencesStore((s) => s.lobbyMessages.dismissedSignature);
export const useSetLobbyMessagesDismissed = () =>
  usePreferencesStore((s) => s.setLobbyMessagesDismissed);
export const useMotionExcluded = () =>
  usePreferencesStore((s) => s.motionFollow.excluded);
export const useSetMotionExcluded = () =>
  usePreferencesStore((s) => s.setMotionExcluded);
export const useFollowScreen = () =>
  usePreferencesStore((s) => s.followScreen);
export const useSetFollowScreen = () =>
  usePreferencesStore((s) => s.setFollowScreen);
export const useActiveLobbyist = () =>
  usePreferencesStore((s) => s.activeLobbyist);
