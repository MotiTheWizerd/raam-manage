"use server";

import { getCurrentUser } from "@/lib/auth";
import { cameraName, isKnownCamera } from "@/lib/camera-registry";
import { db } from "@/lib/db";

// A user-built camera group: a named, ordered set of cameras shown together as
// one multi-camera wall on the cameras page.
export type CameraGroup = {
  id: number;
  name: string;
  cameras: { id: string; name: string }[];
};

export type CameraGroupResult = { ok: boolean; error?: string; groups?: CameraGroup[] };

const MAX_NAME = 40;
const MAX_MEMBERS = 24; // a sane cap — 24 live feeds is already a heavy wall.

// Keep only known camera ids, in the given order, without duplicates, capped.
function cleanCameraIds(camIds: unknown): string[] {
  if (!Array.isArray(camIds)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of camIds) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id) || !isKnownCamera(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}

// Reads every group with its ordered members (names resolved from the registry).
// Exported so both the page and the mutations can return a fresh list.
export async function listCameraGroups(): Promise<CameraGroup[]> {
  const groups = db
    .prepare(`SELECT id, name FROM camera_groups ORDER BY position, id`)
    .all() as { id: number; name: string }[];
  if (groups.length === 0) return [];

  const members = db
    .prepare(
      `SELECT group_id, cam_id FROM camera_group_members ORDER BY group_id, position, id`
    )
    .all() as { group_id: number; cam_id: string }[];

  const byGroup = new Map<number, { id: string; name: string }[]>();
  for (const m of members) {
    // Skip members whose camera has since left the registry.
    const name = cameraName(m.cam_id);
    if (!name) continue;
    const list = byGroup.get(m.group_id) ?? [];
    list.push({ id: m.cam_id, name });
    byGroup.set(m.group_id, list);
  }

  return groups.map((g) => ({ id: g.id, name: g.name, cameras: byGroup.get(g.id) ?? [] }));
}

function writeMembers(groupId: number, camIds: string[]): void {
  db.prepare(`DELETE FROM camera_group_members WHERE group_id = ?`).run(groupId);
  const insert = db.prepare(
    `INSERT INTO camera_group_members (group_id, cam_id, position) VALUES (?, ?, ?)`
  );
  camIds.forEach((camId, i) => insert.run(groupId, camId, i));
}

export async function createCameraGroup(
  name: string,
  camIds: string[]
): Promise<CameraGroupResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const clean = (name ?? "").trim().slice(0, MAX_NAME);
  if (!clean) return { ok: false, error: "יש להזין שם לקבוצה" };
  const cams = cleanCameraIds(camIds);
  if (cams.length === 0) return { ok: false, error: "יש לבחור לפחות מצלמה אחת" };

  const nextPos =
    (db.prepare(`SELECT MAX(position) AS p FROM camera_groups`).get() as { p: number | null })
      .p ?? 0;

  const tx = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO camera_groups (name, position) VALUES (?, ?)`)
      .run(clean, nextPos + 1);
    writeMembers(Number(lastInsertRowid), cams);
  });
  tx();

  return { ok: true, groups: await listCameraGroups() };
}

export async function updateCameraGroup(
  id: number,
  name: string,
  camIds: string[]
): Promise<CameraGroupResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  const exists = db.prepare(`SELECT id FROM camera_groups WHERE id = ?`).get(id);
  if (!exists) return { ok: false, error: "הקבוצה לא נמצאה" };

  const clean = (name ?? "").trim().slice(0, MAX_NAME);
  if (!clean) return { ok: false, error: "יש להזין שם לקבוצה" };
  const cams = cleanCameraIds(camIds);
  if (cams.length === 0) return { ok: false, error: "יש לבחור לפחות מצלמה אחת" };

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE camera_groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(clean, id);
    writeMembers(id, cams);
  });
  tx();

  return { ok: true, groups: await listCameraGroups() };
}

export async function deleteCameraGroup(id: number): Promise<CameraGroupResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  // Members cascade via the FK (foreign_keys pragma is ON).
  db.prepare(`DELETE FROM camera_groups WHERE id = ?`).run(id);
  return { ok: true, groups: await listCameraGroups() };
}
