"use server";

import { db } from "@/lib/db";

export type SelectedResident = {
  id: number;
  first_name: string;
  last_name: string;
  apartment_id: number;
  apartment_number: string;
  floor: number | null;
  zone_name: string | null;
  // Optional so previously-persisted selections (without it) still parse.
  must_call?: number;
};

export type ActiveLobbyist = {
  id: number;
  lobbyist_name: string;
};

export type Preferences = {
  sidebar: {
    collapsed: boolean;
    // Sidebar item hrefs in the manager-chosen display order. Empty = default
    // order. Items missing from this list fall back to their default position.
    order: string[];
    // Manager-chosen label overrides, keyed by item href. Missing = use the
    // built-in default label. Blank values are dropped on save.
    labels: Record<string, string>;
  };
  // Manager-chosen order of reorderable tab groups, keyed by a stable group id
  // (e.g. "events"). Each value is a list of tab values in display order.
  tabOrders: Record<string, string[]>;
  selectedResident: SelectedResident | null;
};

const DEFAULTS: Preferences = {
  sidebar: { collapsed: false, order: [], labels: {} },
  tabOrders: {},
  selectedResident: null,
};

function sanitizeLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string" && val.trim()) out[key] = val.trim();
  }
  return out;
}

function sanitizeTabOrders(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      out[key] = val.filter((x): x is string => typeof x === "string");
    }
  }
  return out;
}

function merge(stored: Partial<Preferences>): Preferences {
  return {
    sidebar: {
      collapsed:
        typeof stored.sidebar?.collapsed === "boolean"
          ? stored.sidebar.collapsed
          : DEFAULTS.sidebar.collapsed,
      order: Array.isArray(stored.sidebar?.order)
        ? stored.sidebar.order.filter((h): h is string => typeof h === "string")
        : DEFAULTS.sidebar.order,
      labels: sanitizeLabels(stored.sidebar?.labels),
    },
    tabOrders: sanitizeTabOrders(stored.tabOrders),
    selectedResident: stored.selectedResident ?? DEFAULTS.selectedResident,
  };
}

export async function getPreferences(): Promise<Preferences> {
  const row = db
    .prepare(`SELECT data FROM user_preferences WHERE id = 1`)
    .get() as { data: string } | undefined;
  if (!row) return DEFAULTS;
  try {
    return merge(JSON.parse(row.data) as Partial<Preferences>);
  } catch {
    return DEFAULTS;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  const safe = merge(prefs);
  db.prepare(
    `UPDATE user_preferences
       SET data = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  ).run(JSON.stringify(safe));
}
