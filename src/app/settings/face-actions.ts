"use server";

import { getCurrentUser, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  faceStatus,
  forgetFace,
  residentLabel,
  setArmed,
  staffLabel,
  startEnroll,
} from "@/lib/faces";

// Face-recognition admin actions. The whole tab lives under /settings, which is
// manager-only by page redirect; we re-check isManager() in every mutating call
// (defense in depth — enrolling biometric data is sensitive).
//
// Two kinds of enrolled face: a "resident" (linked to a residents row) and
// "staff" (a building worker who isn't a resident — just a name).

export type FaceKind = "resident" | "staff";

export type EnrolledFace = {
  id: number; // face_enrollments.id
  kind: FaceKind;
  residentId: number | null;
  label: string;
  name: string;
  apartment: string | null; // residents only
  enrolledBy: string;
  createdAt: string;
  inModel: boolean; // is this label actually present in the sentry's model?
};

export type FaceConsole = {
  faces: EnrolledFace[];
  sentryUp: boolean;
  armed: boolean;
  threshold: number;
  doorPx: number;
  running: string[];
  orphanLabels: string[]; // labels in the sentry model with no enrollment row
};

type EnrollmentRow = {
  id: number;
  kind: FaceKind;
  resident_id: number | null;
  label: string;
  enrolled_by: string;
  created_at: string;
  name: string | null;
  apartment: string | null;
};

function listEnrollmentRows(): EnrollmentRow[] {
  return db
    .prepare(
      `SELECT fe.id, fe.kind, fe.resident_id, fe.label, fe.enrolled_by, fe.created_at,
              COALESCE(r.first_name || ' ' || r.last_name, fe.name) AS name,
              a.number AS apartment
         FROM face_enrollments fe
         LEFT JOIN residents r  ON r.id = fe.resident_id
         LEFT JOIN apartments a ON a.id = r.apartment_id
        ORDER BY fe.created_at DESC`
    )
    .all() as EnrollmentRow[];
}

// Everything the tab needs in one call: our enrolled people reconciled against
// the sentry's live model + the sentry's armed/threshold state.
export async function getFaceConsole(): Promise<FaceConsole> {
  if (!(await isManager())) {
    return {
      faces: [], sentryUp: false, armed: false, threshold: 0, doorPx: 0,
      running: [], orphanLabels: [],
    };
  }

  const rows = listEnrollmentRows();

  let sentryUp = false;
  let modelLabels: string[] = [];
  let armed = false;
  let threshold = 0;
  let doorPx = 0;
  let running: string[] = [];
  try {
    const s = await faceStatus();
    sentryUp = true;
    modelLabels = s.enrolled;
    armed = s.armed;
    threshold = s.threshold;
    doorPx = s.doorPx;
    running = s.running;
  } catch {
    /* sentry down — show our DB rows, flag the service as offline */
  }

  const known = new Set(rows.map((r) => r.label));
  const faces: EnrolledFace[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    residentId: r.resident_id,
    label: r.label,
    name: (r.name ?? "").trim(),
    apartment: r.apartment,
    enrolledBy: r.enrolled_by,
    createdAt: r.created_at,
    inModel: modelLabels.includes(r.label),
  }));

  // Labels living in the sentry with no enrollment row (e.g. the legacy "moti"
  // test enrollment, or a deleted resident). Surfaced so they can be cleaned up.
  const orphanLabels = modelLabels.filter((l) => !known.has(l));

  return { faces, sentryUp, armed, threshold, doorPx, running, orphanLabels };
}

export type EnrollResult = { ok: boolean; msg: string; label?: string };

// Kicks off a hands-free capture for a resident, then records the link. The
// person must be standing at the lobby camera — the sentry collects samples for
// ~5s and saves the averaged faceprint under the resident's stable label.
export async function enrollResidentFace(
  residentId: number
): Promise<EnrollResult> {
  const user = await getCurrentUser();
  if (!user || user.user_role !== "manager") {
    return { ok: false, msg: "אין הרשאה" };
  }

  const resident = db
    .prepare(`SELECT id FROM residents WHERE id = ?`)
    .get(residentId) as { id: number } | undefined;
  if (!resident) return { ok: false, msg: "דייר לא נמצא" };

  const label = residentLabel(residentId);

  let res: { ok: boolean; msg: string };
  try {
    res = await startEnroll(label);
  } catch {
    return { ok: false, msg: "שירות זיהוי הפנים אינו פעיל" };
  }
  if (!res.ok) return { ok: false, msg: res.msg || "ההרשמה נכשלה" };

  // Record (or refresh) the resident <-> faceprint link. The faceprint itself
  // saves on the sentry once the ~5s capture finishes.
  db.prepare(
    `INSERT INTO face_enrollments (kind, resident_id, label, enrolled_by)
     VALUES ('resident', ?, ?, ?)
     ON CONFLICT(resident_id) DO UPDATE SET
       label = excluded.label,
       enrolled_by = excluded.enrolled_by,
       updated_at = CURRENT_TIMESTAMP`
  ).run(residentId, label, user.lobbyist_name);

  return { ok: true, msg: res.msg || "מביט במצלמה…", label };
}

// Enrolls a building worker (not a resident) — just a name. Creates the row
// first to mint a stable `s{id}` label, then starts the capture; rolls the row
// back if the sentry can't be reached so we never leave a dangling enrollment.
export async function enrollStaffFace(
  rawName: string
): Promise<EnrollResult> {
  const user = await getCurrentUser();
  if (!user || user.user_role !== "manager") {
    return { ok: false, msg: "אין הרשאה" };
  }

  const name = (rawName ?? "").trim();
  if (!name) return { ok: false, msg: "יש להזין שם" };

  const info = db
    .prepare(
      `INSERT INTO face_enrollments (kind, name, label, enrolled_by)
       VALUES ('staff', ?, ?, ?)`
    )
    // temporary placeholder label (unique) until we know the row id
    .run(name, `pending-${Date.now()}-${Math.random()}`, user.lobbyist_name);

  const id = Number(info.lastInsertRowid);
  const label = staffLabel(id);
  db.prepare(`UPDATE face_enrollments SET label = ? WHERE id = ?`).run(label, id);

  let res: { ok: boolean; msg: string };
  try {
    res = await startEnroll(label);
  } catch {
    db.prepare(`DELETE FROM face_enrollments WHERE id = ?`).run(id);
    return { ok: false, msg: "שירות זיהוי הפנים אינו פעיל" };
  }
  if (!res.ok) {
    db.prepare(`DELETE FROM face_enrollments WHERE id = ?`).run(id);
    return { ok: false, msg: res.msg || "ההרשמה נכשלה" };
  }

  return { ok: true, msg: res.msg || "מביט במצלמה…", label };
}

// Removes a faceprint from both the sentry model and our DB, by label. Works for
// any enrollment — resident, staff, or an orphan label with no row.
export async function forgetEnrolledFace(
  label: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isManager())) return { ok: false, error: "אין הרשאה" };

  try {
    await forgetFace(label);
  } catch {
    /* sentry down — still drop our row so the UI stays consistent */
  }
  db.prepare(`DELETE FROM face_enrollments WHERE label = ?`).run(label);
  return { ok: true };
}

// Arms / disarms automatic door opening on a recognized face.
export async function setFaceArmed(
  armed: boolean
): Promise<{ ok: boolean; armed: boolean; error?: string }> {
  if (!(await isManager())) return { ok: false, armed: false, error: "אין הרשאה" };
  try {
    const now = await setArmed(armed);
    return { ok: true, armed: now };
  } catch {
    return { ok: false, armed: false, error: "שירות זיהוי הפנים אינו פעיל" };
  }
}

// --- entry log -------------------------------------------------------------

export type LatestFaceEvent = {
  id: number;
  name: string;
  residentId: number | null;
  createdAt: string;
};

// The newest RECOGNIZED entry — drives the live "X נכנס ללובי" toast. Available
// to any logged-in staff (operational heads-up, like the car notifier).
export async function getLatestFaceEvent(): Promise<LatestFaceEvent | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const row = db
    .prepare(
      `SELECT id, name, resident_id AS residentId, created_at AS createdAt
         FROM face_events
        WHERE kind = 'known' AND name IS NOT NULL AND TRIM(name) <> ''
        ORDER BY id DESC LIMIT 1`
    )
    .get() as LatestFaceEvent | undefined;
  return row ?? null;
}

export type FaceEventRow = {
  id: number;
  kind: "known" | "unknown";
  name: string | null;
  score: number | null;
  px: number | null;
  createdAt: string;
  hasImage: boolean;
};

export type PaginatedFaceEvents = {
  rows: FaceEventRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type FaceEventFilter = "all" | "known" | "unknown";

// Paginated photo log of who's been seen (manager-only — lives in settings).
export async function getFaceEventsPage(
  page: number = 1,
  pageSize: number = 24,
  filter: FaceEventFilter = "all"
): Promise<PaginatedFaceEvents> {
  const empty: PaginatedFaceEvents = { rows: [], page: 1, pageSize, total: 0, totalPages: 1 };
  if (!(await isManager())) return empty;

  const safeSize = Math.max(1, Math.min(60, Math.floor(pageSize)));
  const where = filter === "all" ? "" : `WHERE kind = '${filter}'`;

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM face_events ${where}`).get() as { n: number }
  ).n;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const offset = (safePage - 1) * safeSize;

  const rows = db
    .prepare(
      `SELECT id, kind, name, score, px, created_at AS createdAt, image_path AS imagePath
         FROM face_events ${where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?`
    )
    .all(safeSize, offset) as (Omit<FaceEventRow, "hasImage"> & { imagePath: string | null })[];

  return {
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      score: r.score,
      px: r.px,
      createdAt: r.createdAt,
      hasImage: !!r.imagePath,
    })),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages,
  };
}
