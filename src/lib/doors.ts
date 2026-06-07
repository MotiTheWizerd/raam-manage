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

async function ensureSession(): Promise<Session> {
  if (!session) session = await login();
  return session;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type DoorResult = { ok: boolean; error?: string };

// Sends ONE momentary unlock to a door. Re-authenticates once and retries if the
// first attempt fails (covers an expired session) — safe because a failed first
// attempt means the door did not open.
export async function unlockDoor(door: DoorDef): Promise<DoorResult> {
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
          operation: "UNLOCK_DOOR",
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
  return { ok: false, error: "פתיחת הדלת נכשלה" };
}
