import "server-only";

import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { CAMERAS } from "@/lib/gates";
import { INTERCOM_PANELS } from "@/lib/intercom";
import { pg } from "@/lib/pg";

// The הקלטות page: cameras whose recordings we can search, keyed by their
// recorder channel id in the Postgres registry ("dvr-137-ch2"), named the way
// the rest of the app names them.

export type RecCamera = {
  id: string;
  name: string;
  /** The recorder's own channel name (often English) — extra words for the AI. */
  deviceName: string | null;
  location: string | null;
  records: "motion" | "continuous";
  groups: string[];
};

// Live id -> app name: curated entrance names first, then door names, then the fleet.
const APP_NAMES = new Map<string, string>([
  ...FLEET_CAMERAS.map((c) => [c.id, c.name] as const),
  ...INTERCOM_PANELS.map((p) => [p.camId, p.name] as const),
  ...CAMERAS.map((c) => [c.id, c.name] as const),
]);

// Registry rows without a live_id still match the app's dvr-N / nvr-N ids.
const LIVE_PREFIX: Record<string, string> = { "dvr-137": "dvr", "nvr-100": "nvr" };

export async function listRecordableCameras(): Promise<RecCamera[]> {
  const { rows } = await pg.query<{
    id: string;
    recorder_id: string;
    channel: number;
    name_he: string | null;
    device_name: string | null;
    location: string | null;
    live_id: string | null;
    records: "motion" | "continuous";
    groups: string[];
  }>(
    `SELECT c.id, c.recorder_id, c.channel, c.name_he, c.device_name, c.location, c.live_id, c.records,
            COALESCE(array_agg(g.name ORDER BY g.position) FILTER (WHERE g.name IS NOT NULL), '{}') AS groups
       FROM cameras c
       JOIN recorders r ON r.id = c.recorder_id
       LEFT JOIN camera_group_members m ON m.camera_id = c.id
       LEFT JOIN camera_groups g ON g.id = m.group_id
      WHERE c.records <> 'none' AND c.active AND r.accessible
      GROUP BY c.id
      ORDER BY c.recorder_id, c.channel`
  );
  return rows.map((r) => {
    const liveId = r.live_id ?? (LIVE_PREFIX[r.recorder_id] && `${LIVE_PREFIX[r.recorder_id]}-${r.channel}`);
    return {
      id: r.id,
      name: r.name_he ?? (liveId && APP_NAMES.get(liveId)) ?? r.device_name ?? r.id,
      deviceName: r.device_name,
      location: r.location,
      records: r.records,
      groups: r.groups,
    };
  });
}

export type RecSelection = { cameras: string[]; from: string; to: string };

// Recorder times are naive building-local ("2026-10-30T14:00:00"), so "now" is
// rendered in Israel time regardless of the server's zone.
export function nowLocal(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second} (${parts.weekday})`;
}
