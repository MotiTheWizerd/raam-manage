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
  };
  selectedResident: SelectedResident | null;
};

const DEFAULTS: Preferences = {
  sidebar: { collapsed: false },
  selectedResident: null,
};

function merge(stored: Partial<Preferences>): Preferences {
  return {
    sidebar: {
      collapsed:
        typeof stored.sidebar?.collapsed === "boolean"
          ? stored.sidebar.collapsed
          : DEFAULTS.sidebar.collapsed,
    },
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
