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
  groupIds: number[];
};

export type CameraGroup = {
  id: number;
  name: string;
  cameraCount: number;
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
            c.records, c.hours_24h, c.active,
            COALESCE(array_agg(m.group_id) FILTER (WHERE m.group_id IS NOT NULL), '{}') AS group_ids
       FROM cameras c JOIN recorders r ON r.id = c.recorder_id
       LEFT JOIN camera_group_members m ON m.camera_id = c.id
      GROUP BY c.id, r.name
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
    groupIds: r.group_ids,
  }));
}

export async function getCameraGroups(): Promise<CameraGroup[]> {
  if (!(await getCurrentUser())) return [];
  const { rows } = await pg.query(
    `SELECT g.id, g.name, count(m.camera_id)::int AS camera_count
       FROM camera_groups g LEFT JOIN camera_group_members m ON m.group_id = g.id
      GROUP BY g.id
      ORDER BY g.position, g.name`
  );
  return rows.map((r) => ({ id: r.id, name: r.name, cameraCount: r.camera_count }));
}

type ActionResult = { ok: boolean; error?: string };

// unique_violation on camera_groups.name
const isDuplicate = (e: unknown) => (e as { code?: string })?.code === "23505";

export async function createCameraGroup(name: string): Promise<ActionResult> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };
  const n = clean(name, 40);
  if (!n) return { ok: false, error: "נדרש שם" };
  try {
    await pg.query(
      `INSERT INTO camera_groups (name, position)
       VALUES ($1, (SELECT COALESCE(max(position), 0) + 1 FROM camera_groups))`,
      [n]
    );
    return { ok: true };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: "קבוצה בשם הזה כבר קיימת" };
    throw e;
  }
}

export async function renameCameraGroup(id: number, name: string): Promise<ActionResult> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };
  const n = clean(name, 40);
  if (!n) return { ok: false, error: "נדרש שם" };
  try {
    await pg.query(`UPDATE camera_groups SET name = $2 WHERE id = $1`, [id, n]);
    return { ok: true };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: "קבוצה בשם הזה כבר קיימת" };
    throw e;
  }
}

export async function deleteCameraGroup(id: number): Promise<ActionResult> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };
  await pg.query(`DELETE FROM camera_groups WHERE id = $1`, [id]);
  return { ok: true };
}

export async function addCamerasToGroup(
  cameraIds: string[],
  groupId: number
): Promise<ActionResult> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };
  if (cameraIds.length === 0) return { ok: true };
  await pg.query(
    `INSERT INTO camera_group_members (group_id, camera_id)
     SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
    [groupId, cameraIds]
  );
  return { ok: true };
}

export async function setCameraInGroup(
  cameraId: string,
  groupId: number,
  member: boolean
): Promise<ActionResult> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };
  await pg.query(
    member
      ? `INSERT INTO camera_group_members (group_id, camera_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`
      : `DELETE FROM camera_group_members WHERE group_id = $1 AND camera_id = $2`,
    [groupId, cameraId]
  );
  return { ok: true };
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
