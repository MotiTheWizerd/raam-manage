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
  // Manager-chosen tab label overrides, keyed by group id then by tab value
  // (e.g. tabLabels["events"]["vehicles"]). Missing = use the built-in default
  // label. Blank values are dropped on save.
  tabLabels: Record<string, Record<string, string>>;
  selectedResident: SelectedResident | null;
  // The lobby-messages drawer: the set of message ids (StickyMessages'
  // signature) the lobbyist hid. While the set is unchanged a refresh keeps it
  // tucked; a new or removed message changes the set and pops it open again.
  lobbyMessages: { dismissedSignature: string };
  // Camera ids hidden from the /cameras motion-follow wall (a duplicate angle
  // of the same room, or a camera that keeps picking the wrong view).
  motionFollow: { excluded: string[] };
  // The camera computer's screen the dock opens the follow wall on — the
  // physical monitor's id (see lib/follow-screen.ts). null = not picked yet.
  followScreen: string | null;
};

const DEFAULTS: Preferences = {
  sidebar: { collapsed: false, order: [], labels: {} },
  tabOrders: {},
  tabLabels: {},
  selectedResident: null,
  lobbyMessages: { dismissedSignature: "" },
  motionFollow: { excluded: [] },
  followScreen: null,
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

function sanitizeTabLabels(
  value: unknown
): Record<string, Record<string, string>> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [group, val] of Object.entries(value as Record<string, unknown>)) {
    const inner = sanitizeLabels(val); // trims + drops blanks, same as sidebar
    if (Object.keys(inner).length) out[group] = inner;
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
    tabLabels: sanitizeTabLabels(stored.tabLabels),
    selectedResident: stored.selectedResident ?? DEFAULTS.selectedResident,
    lobbyMessages: {
      dismissedSignature:
        typeof stored.lobbyMessages?.dismissedSignature === "string"
          ? stored.lobbyMessages.dismissedSignature
          : DEFAULTS.lobbyMessages.dismissedSignature,
    },
    motionFollow: {
      excluded: Array.isArray(stored.motionFollow?.excluded)
        ? stored.motionFollow.excluded.filter((id): id is string => typeof id === "string")
        : DEFAULTS.motionFollow.excluded,
    },
    followScreen:
      typeof stored.followScreen === "string" ? stored.followScreen : DEFAULTS.followScreen,
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

// Saves only the fields a browser changed, on top of what's stored — the row is
// shared by every open window (lobby PCs, the follow wall on the camera
// screen), so writing a whole stale copy would undo another window's changes.
export async function savePreferences(changed: Partial<Preferences>): Promise<void> {
  const safe = merge({ ...(await getPreferences()), ...changed });
  db.prepare(
    `UPDATE user_preferences
       SET data = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  ).run(JSON.stringify(safe));
}
