import "server-only";
import https from "node:https";

// Programmatic control of the building's pedestrian/access doors.
//
// The doors run on GeoVision access control (GV-ASManager + the ASWeb web UI
// "GeoWebServer"), which runs LOCALLY on this same lobby PC on HTTPS 443 — a
// completely separate system from the Hikvision parking gates (see gates.ts).
//
// One endpoint controls every door: POST https://localhost/ASWeb/bin/ControllerList.srf
//   1. POST /ASWeb/Login/            (username/password)  -> GvWebSessionID cookie
//   2. action=WEBCLIENT_LOGIN&login=1                     -> client_guid
//   3. action=DOOR_OPERATION&operation=UNLOCK_DOOR&...    -> momentary unlock
//
// Reverse-engineered + verified live in session 20 (ctrl 4 / door 0 unlocked,
// Moti watching). operation=UNLOCK_DOOR is a momentary strike release — the door
// doesn't swing on its own, the lock just releases so it can be pushed. NOTE the
// gotcha: operation="OPEN" is an ALARM-EVENT name, not a command (returns
// errcode 4). The real open command is UNLOCK_DOOR.

const BASE = "https://localhost/ASWeb";
const ENDPOINT = `${BASE}/bin/ControllerList.srf`;
const USER = "admin";
const PASS = "Sami0207!";

export type DoorId =
  | "lobby"
  | "north"
  | "carpark2"
  | "parking-guests-door"
  | "parking-main"
  | "parking-suppliers"
  | "parking-guests";

export type DoorDef = {
  id: DoorId;
  name: string;
  ctrlId: number;
  drId: number;
  // Live-view camera id (a CAMERAS entry in gates.ts) to pop on open, if any.
  cam?: string;
};

// The 7 doors as enumerated live from GET_ALL_DEVICES (session 20). "lobby" is
// בקר שומר / "Door 1" (ctrl 4) — the door by the guard desk we verified open;
// Moti treats it as the lobby door for now. The other labels are the raw
// GeoVision names — Moti will rename them to real-world doors later.
export const DOORS: readonly DoorDef[] = [
  { id: "lobby", name: "לובי", ctrlId: 4, drId: 0, cam: "lobby" },
  { id: "north", name: "דלת צפונית", ctrlId: 2, drId: 0 },
  { id: "carpark2", name: "חניון 2 ראשית", ctrlId: 1, drId: 0 },
  { id: "parking-guests-door", name: "דלת אורחים", ctrlId: 3, drId: 0 },
  { id: "parking-main", name: "דלת חניון ראשית", ctrlId: 3, drId: 1 },
  { id: "parking-suppliers", name: "חניון ספקים", ctrlId: 3, drId: 2 },
  { id: "parking-guests", name: "חניון אורחים", ctrlId: 3, drId: 3 },
];

export function getDoor(id: string): DoorDef | undefined {
  return DOORS.find((d) => d.id === id);
}

// ---------------------------------------------------------------------------
// Minimal HTTPS client. GeoWebServer uses a self-signed cert on localhost, so
// we talk to it with node:https + rejectUnauthorized:false (scoped to this
// helper only — never a global TLS override). Form-encoded POST, returns the
// body + any Set-Cookie.
// ---------------------------------------------------------------------------

type HttpReply = { status: number; body: string; setCookie: string[] };

function postForm(
  url: string,
  fields: Record<string, string>,
  cookie?: string
): Promise<HttpReply> {
  const data = new URLSearchParams(fields).toString();
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        rejectUnauthorized: false,
        timeout: 8000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            setCookie: res.headers["set-cookie"] ?? [],
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("door controller timeout")));
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Session — cached login cookie + monitor client_guid, refreshed on demand.
// ---------------------------------------------------------------------------

type Session = { cookie: string; guid: string };
let session: Session | null = null;
let loginInFlight: Promise<Session> | null = null;

async function login(): Promise<Session> {
  // 1. Authenticate -> GvWebSessionID cookie.
  const auth = await postForm(`${BASE}/Login/`, {
    username: USER,
    password: PASS,
    end: "end",
  });
  const cookie = auth.setCookie
    .map((c) => c.split(";")[0])
    .filter((c) => /^Gv/.test(c))
    .join("; ");
  if (!/GvWebSessionID=/.test(cookie)) {
    throw new Error("התחברות לבקר הדלתות נכשלה");
  }

  // 2. Register a monitor client -> client_guid (needed by DOOR_OPERATION).
  const reg = await postForm(
    ENDPOINT,
    { action: "WEBCLIENT_LOGIN", module: "monitor", client_guid: "", login: "1" },
    cookie
  );
  const guid = safeJson(reg.body)?.client_guid as string | undefined;
  if (!guid) throw new Error("רישום לבקר הדלתות נכשל");

  return { cookie, guid };
}

// Returns the cached session, logging in once if needed. Concurrent callers
// (e.g. the emergency fan-out across all doors) share a SINGLE in-flight login
// instead of each kicking off their own.
async function ensureSession(): Promise<Session> {
  if (session) return session;
  if (!loginInFlight) {
    loginInFlight = login()
      .then((s) => {
        session = s;
        return s;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type DoorResult = { ok: boolean; error?: string };

// GeoVision DOOR_OPERATION command values (verified live session 20 + 36 against
// the local ASWeb API / GeoVision's own WebSDK sample):
//   UNLOCK_DOOR             momentary strike release (open, then auto-relock)
//   FORCE_UNLOCK            latch the door OPEN until cleared (כפה פתיחה)
//   CLEAR_FORCE_LOCKUNLOCK  clear a force-lock/unlock → back to the card schedule
type DoorOperation = "UNLOCK_DOOR" | "FORCE_UNLOCK" | "CLEAR_FORCE_LOCKUNLOCK";

// Sends ONE DOOR_OPERATION to a door. Re-authenticates once and retries if the
// first attempt fails (covers an expired session) — safe because a failed first
// attempt means nothing changed at the door.
async function runDoorOperation(
  door: DoorDef,
  operation: DoorOperation
): Promise<DoorResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let s: Session;
    try {
      s = await ensureSession();
    } catch (e) {
      session = null;
      return { ok: false, error: e instanceof Error ? e.message : "תקלת תקשורת" };
    }

    try {
      const res = await postForm(
        ENDPOINT,
        {
          action: "DOOR_OPERATION",
          module: "monitor",
          dvg_id: "0",
          ctrl_id: String(door.ctrlId),
          dr_id: String(door.drId),
          operation,
          client_guid: s.guid,
          reason: "raam",
        },
        s.cookie
      );
      const json = safeJson(res.body);
      if (json?.success === 1) return { ok: true };
      // Failed — drop the session and let the loop re-auth + retry once.
      session = null;
      if (attempt === 1) {
        const msg = (json?.errmsg as string) || `שגיאה (${res.status})`;
        return { ok: false, error: `בקר הדלת החזיר שגיאה: ${msg}` };
      }
    } catch (e) {
      session = null;
      if (attempt === 1) {
        return { ok: false, error: e instanceof Error ? e.message : "תקלת תקשורת לבקר הדלת" };
      }
    }
  }
  return { ok: false, error: "הפעולה על הדלת נכשלה" };
}

// Momentary unlock — the door can be pushed, then auto-relocks on its timer.
export function unlockDoor(door: DoorDef): Promise<DoorResult> {
  return runDoorOperation(door, "UNLOCK_DOOR");
}

// Latch the door OPEN until released (GeoVision "force unlock"). Stays open
// across the relock timer — use releaseDoor() to return to normal.
export function holdDoorOpen(door: DoorDef): Promise<DoorResult> {
  return runDoorOperation(door, "FORCE_UNLOCK");
}

// Clear a force-unlock/lock → the door resumes its normal card schedule.
export function releaseDoor(door: DoorDef): Promise<DoorResult> {
  return runDoorOperation(door, "CLEAR_FORCE_LOCKUNLOCK");
}

// --- Emergency: every door at once -----------------------------------------
// For a missile/alert "open everything" — fan a single operation across all
// DOORS concurrently and report each door's outcome (a life-safety feature must
// KNOW which door, if any, didn't respond). The callers share one login (see
// ensureSession), so this is just a handful of parallel POSTs.

export type DoorOutcome = { id: DoorId; name: string; ok: boolean; error?: string };
export type AllDoorsResult = { results: DoorOutcome[]; okCount: number; total: number };

async function runOnAllDoors(operation: DoorOperation): Promise<AllDoorsResult> {
  // Warm the session once so the parallel calls below don't race to log in.
  try {
    await ensureSession();
  } catch {
    /* let the per-door calls surface the failure individually */
  }
  const results = await Promise.all(
    DOORS.map(async (door): Promise<DoorOutcome> => {
      const r = await runDoorOperation(door, operation);
      return { id: door.id, name: door.name, ok: r.ok, error: r.error };
    })
  );
  return {
    results,
    okCount: results.filter((r) => r.ok).length,
    total: results.length,
  };
}

// Latch EVERY door open (FORCE_UNLOCK) — the emergency "open all".
export function holdAllDoorsOpen(): Promise<AllDoorsResult> {
  return runOnAllDoors("FORCE_UNLOCK");
}

// Clear the force on EVERY door (CLEAR_FORCE_LOCKUNLOCK) → back to the normal
// card schedule. This RELEASES the forced-open state; it is NOT a lock-down.
export function releaseAllDoorHolds(): Promise<AllDoorsResult> {
  return runOnAllDoors("CLEAR_FORCE_LOCKUNLOCK");
}

export type DoorState = { ok: boolean; held?: boolean; mode?: string; error?: string };

type DeviceTree = {
  ctrl?: Array<{
    ctrl_id: number;
    door?: Array<{ dr_id: number; dr_work_mode?: string }>;
  }>;
};

// One GET_ALL_DEVICES read of the whole controller tree (re-auth + retry once).
// Shared by the single-door and all-doors status reads.
async function fetchDeviceTree(): Promise<DeviceTree | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let s: Session;
    try {
      s = await ensureSession();
    } catch {
      session = null;
      return null;
    }
    try {
      const res = await postForm(
        ENDPOINT,
        { action: "GET_ALL_DEVICES", module: "monitor", client_guid: s.guid },
        s.cookie
      );
      const json = safeJson(res.body) as DeviceTree | null;
      if (json?.ctrl) return json;
      session = null;
    } catch {
      session = null;
    }
  }
  return null;
}

// A door is "held" while it's force-unlocked (latched open) —
// LOCAL/REMOTE_FORCE_UNLOCK_MODE.
function isHeld(mode?: string): boolean {
  return mode ? /FORCE_UNLOCK/.test(mode) : false;
}

// Reads a single door's live work mode from GeoVision.
export async function getDoorWorkMode(door: DoorDef): Promise<DoorState> {
  const tree = await fetchDeviceTree();
  if (!tree?.ctrl) return { ok: false, error: "קריאת מצב הדלת נכשלה" };
  const ctrl = tree.ctrl.find((c) => c.ctrl_id === door.ctrlId);
  const mode = ctrl?.door?.find((d) => d.dr_id === door.drId)?.dr_work_mode;
  return { ok: true, mode, held: isHeld(mode) };
}

export type AllDoorsState = {
  ok: boolean;
  error?: string;
  doors: Array<{ id: DoorId; name: string; held: boolean; mode?: string }>;
  heldCount: number;
};

// Reads the live work mode of EVERY door in ONE GET_ALL_DEVICES call — drives
// the emergency status (how many doors are currently forced open).
export async function getAllDoorWorkModes(): Promise<AllDoorsState> {
  const tree = await fetchDeviceTree();
  if (!tree?.ctrl) {
    return { ok: false, error: "קריאת מצב הדלתות נכשלה", doors: [], heldCount: 0 };
  }
  const doors = DOORS.map((door) => {
    const ctrl = tree.ctrl!.find((c) => c.ctrl_id === door.ctrlId);
    const mode = ctrl?.door?.find((d) => d.dr_id === door.drId)?.dr_work_mode;
    return { id: door.id, name: door.name, held: isHeld(mode), mode };
  });
  return { ok: true, doors, heldCount: doors.filter((d) => d.held).length };
}
