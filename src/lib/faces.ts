import "server-only";

// Client for the face-recognition sentry (vision/face_probe.py).
//
// The sentry is a small Python service that watches a camera, recognizes
// enrolled faces, and opens that camera's GeoVision door on a match. It keeps
// its own faceprint database (vision/faces_db.json, biometric data — gitignored)
// keyed by a free-text label. The app owns the label <-> resident mapping in the
// face_enrollments table; here we just drive the sentry over its localhost HTTP
// API. All endpoints are GET (the sentry is a tiny BaseHTTPRequestHandler).
//
// Built session 25 — first wiring of the face sentry into the app proper.

const BASE = process.env.FACE_VISION_URL ?? "http://127.0.0.1:8090";
const TIMEOUT_MS = 8000;

// Which sentry camera we enroll / recognize at. The lobby approach cam (.119)
// is the only face cam today; this stays a constant until we add more.
export const FACE_CAM = "lobby";

// A resident's stable faceprint key in the sentry DB. Keyed by id (not name) so
// it survives renames and never collides. Notifications map it back to the
// resident; the standalone laptop banner just shows this raw label.
export function residentLabel(residentId: number): string {
  return `r${residentId}`;
}

export function labelToResidentId(label: string): number | null {
  const m = /^r(\d+)$/.exec(label.trim());
  return m ? Number(m[1]) : null;
}

// A building worker's faceprint key. Keyed by the face_enrollments row id (staff
// have no residents row), so it's stable and never collides with `r{id}`.
export function staffLabel(enrollmentId: number): string {
  return `s${enrollmentId}`;
}

export type FaceStatus = {
  enrolled: string[]; // labels currently in the sentry model
  threshold: number;
  doorScore: number;
  doorPx: number;
  armed: boolean;
  running: string[]; // cameras with a live worker
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`face sentry ${res.status}`);
  return (await res.json()) as T;
}

// Reads the sentry's live state: who's enrolled, thresholds, armed, running cams.
export async function faceStatus(): Promise<FaceStatus> {
  const j = await get<{
    enrolled: string[];
    threshold: number;
    door_score: number;
    door_px: number;
    armed: boolean;
    running: string[];
  }>("/list");
  return {
    enrolled: j.enrolled ?? [],
    threshold: j.threshold,
    doorScore: j.door_score,
    doorPx: j.door_px,
    armed: !!j.armed,
    running: j.running ?? [],
  };
}

// Starts a ~5s hands-free capture on the camera — the resident looks at the cam
// (and turns their head a little) while the sentry collects samples, then saves
// the averaged faceprint under `label`. Returns the sentry's instruction text.
export async function startEnroll(
  label: string,
  cam: string = FACE_CAM
): Promise<{ ok: boolean; msg: string }> {
  const j = await get<{ ok: boolean; enrolling: string; msg: string }>(
    `/enroll?name=${encodeURIComponent(label)}&cam=${encodeURIComponent(cam)}`
  );
  return { ok: !!j.ok, msg: j.msg ?? "" };
}

// Removes a faceprint from the sentry model.
export async function forgetFace(label: string): Promise<boolean> {
  const j = await get<{ ok: boolean; forgot: string }>(
    `/forget?name=${encodeURIComponent(label)}`
  );
  return !!j.ok;
}

// Arms / disarms door-opening. Disarmed = still recognizes, never opens.
export async function setArmed(armed: boolean): Promise<boolean> {
  const j = await get<{ ok: boolean; armed: boolean }>(
    `/door?arm=${armed ? 1 : 0}`
  );
  return !!j.armed;
}
