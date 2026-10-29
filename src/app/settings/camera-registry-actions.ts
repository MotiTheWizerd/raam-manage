"use server";

import { getCurrentUser, isManager } from "@/lib/auth";
import { pg } from "@/lib/pg";

/**
 * The camera registry (Postgres `cameras` + `recorders`), filled from the
 * recorders by vision/tracing/seed_cameras.py. Here staff only edit the human
 * columns — the seed never overwrites them, and we never touch the device ones.
 */

export type RegistryCamera = {
  id: string;
  recorderId: string;
  recorderName: string;
  channel: number;
  kind: "analog" | "ip";
  deviceName: string | null;
  nameHe: string | null;
  location: string | null;
  notes: string | null;
  cameraIp: string | null;
  liveId: string | null;
  records: "motion" | "continuous" | "none" | null;
  hours24h: number | null;
  active: boolean;
};

export type RegistryCameraEdit = {
  nameHe: string;
  location: string;
  notes: string;
  active: boolean;
};

export async function getRegistryCameras(): Promise<RegistryCamera[]> {
  if (!(await getCurrentUser())) return [];
  const { rows } = await pg.query(
    `SELECT c.id, c.recorder_id, r.name AS recorder_name, c.channel, c.kind,
            c.device_name, c.name_he, c.location, c.notes, c.camera_ip, c.live_id,
            c.records, c.hours_24h, c.active
       FROM cameras c JOIN recorders r ON r.id = c.recorder_id
      ORDER BY c.recorder_id, c.channel`
  );
  return rows.map((r) => ({
    id: r.id,
    recorderId: r.recorder_id,
    recorderName: r.recorder_name,
    channel: r.channel,
    kind: r.kind,
    deviceName: r.device_name,
    nameHe: r.name_he,
    location: r.location,
    notes: r.notes,
    cameraIp: r.camera_ip,
    liveId: r.live_id,
    records: r.records,
    hours24h: r.hours_24h,
    active: r.active,
  }));
}

const clean = (s: string, max: number): string | null => {
  const t = s.trim().slice(0, max);
  return t.length > 0 ? t : null;
};

export async function updateRegistryCamera(
  id: string,
  edit: RegistryCameraEdit
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };
  const { rowCount } = await pg.query(
    `UPDATE cameras SET name_he = $2, location = $3, notes = $4, active = $5, updated_at = now()
      WHERE id = $1`,
    [id, clean(edit.nameHe, 80), clean(edit.location, 80), clean(edit.notes, 500), edit.active]
  );
  return rowCount === 1 ? { ok: true } : { ok: false, error: "מצלמה לא נמצאה" };
}
