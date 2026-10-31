import "server-only";

import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

// The motion-follow wall as a window of its own on the camera computer — the
// machine this server runs on. pm2 lives in the logged-in desktop session, so
// the server may open windows on its screens. The lobby's dock asks; we start
// Chrome in kiosk mode (full screen, no address bar) on the chosen screen, on a
// Chrome profile of its own so it can be placed and closed without touching any
// other Chrome window there.

const run = promisify(execFile);

const DIR = path.join(process.cwd(), "data", "follow-screen");
const PROFILE = path.join(DIR, "chrome-profile");
const STATE_FILE = path.join(DIR, "window.json");

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

export type Screen = {
  // The physical monitor: model + GPU port, e.g. "PHLC0D1#5&360cba2d&0&UID4354".
  // Not Windows' "\\.\DISPLAYn" — those renumber when a screen sleeps or is
  // switched off and comes back, so a saved pick would land on the wrong one.
  id: string;
  label: string;
  primary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FollowScreenState = { open: boolean; screen: string | null };

type Result = { ok: true } | { ok: false; error: string };

// ---- screens ---------------------------------------------------------------

// Each screen's place, and the monitor behind it (EnumDisplayDevices with
// EDD_GET_DEVICE_INTERFACE_NAME gives "\\?\DISPLAY#<model>#<port>#{guid}").
const SCREENS_PS = `
Add-Type -TypeDefinition '
using System; using System.Runtime.InteropServices;
public class RaamDisplays {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DD { public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  static extern bool EnumDisplayDevices(string dev, uint i, ref DD d, uint flags);
  public static string Monitor(string adapter) {
    var d = new DD(); d.cb = Marshal.SizeOf(d);
    return EnumDisplayDevices(adapter, 0, ref d, 1) ? d.DeviceID : ""; }
}';
Add-Type -AssemblyName System.Windows.Forms;
$s = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  [pscustomobject]@{ device = $_.DeviceName; monitor = [RaamDisplays]::Monitor($_.DeviceName);
    primary = $_.Primary; x = $_.Bounds.X; y = $_.Bounds.Y;
    width = $_.Bounds.Width; height = $_.Bounds.Height } });
ConvertTo-Json -InputObject $s -Compress
`;

let screensCache: { at: number; screens: Screen[] } | null = null;

// The machine's screens, left to right as Windows has them arranged.
export async function listScreens(): Promise<Screen[]> {
  if (screensCache && Date.now() - screensCache.at < 60_000) return screensCache.screens;
  const { stdout } = await run(
    "powershell",
    ["-NoProfile", "-EncodedCommand", Buffer.from(SCREENS_PS, "utf16le").toString("base64")],
    { windowsHide: true, timeout: 15_000 }
  );
  const raw = JSON.parse(stdout) as (Omit<Screen, "id" | "label"> & {
    device: string;
    monitor: string;
  })[];
  const sorted = raw.toSorted((a, b) => a.x - b.x);
  const screens = sorted.map(({ device, monitor, ...s }, i) => ({
    ...s,
    id: monitor.match(/DISPLAY#([^#]+#[^#]+)#/)?.[1] ?? device,
    label:
      (sorted.length === 2 ? (i === 0 ? "מסך שמאלי" : "מסך ימני") : `מסך ${i + 1}`) +
      (s.primary ? " (ראשי)" : ""),
  }));
  screensCache = { at: Date.now(), screens };
  return screens;
}

// ---- the window ------------------------------------------------------------

type WindowState = { pid: number; screen: string; openedAt: number };

function readState(): WindowState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as WindowState;
  } catch {
    return null;
  }
}

function writeState(state: WindowState | null) {
  if (state) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } else {
    fs.rmSync(STATE_FILE, { force: true });
  }
}

// Still running — and still a browser (a reused pid after a reboot isn't ours).
async function isBrowserAlive(pid: number): Promise<boolean> {
  try {
    const { stdout } = await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      windowsHide: true,
    });
    return /^"(chrome|msedge)\.exe"/im.test(stdout);
  } catch {
    return false;
  }
}

export async function followScreenState(): Promise<FollowScreenState> {
  const state = readState();
  if (!state) return { open: false, screen: null };
  if (await isBrowserAlive(state.pid)) return { open: true, screen: state.screen };
  // Closed on the camera computer itself (Alt+F4) — forget it.
  writeState(null);
  return { open: false, screen: null };
}

// Main browser processes on our profile — catches a window we lost track of.
async function profileBrowserPids(): Promise<number[]> {
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*follow-screen*chrome-profile*' -and $_.CommandLine -notlike '*--type=*' } | " +
    "ForEach-Object { $_.ProcessId }";
  try {
    const { stdout } = await run("powershell", ["-NoProfile", "-Command", ps], {
      windowsHide: true,
      timeout: 15_000,
    });
    return stdout
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

export async function closeFollowScreen(): Promise<Result> {
  const state = readState();
  const pids = new Set(await profileBrowserPids());
  if (state && (await isBrowserAlive(state.pid))) pids.add(state.pid);
  // Ask nicely first (a clean exit — no "restore pages?" next time), then force.
  // Not /T here: Chrome's windowless helpers refuse a polite close, and then
  // the browser refuses too; asked alone, it shuts its helpers down itself.
  for (const pid of pids) {
    await run("taskkill", ["/PID", String(pid)], { windowsHide: true }).catch(() => {});
  }
  for (let i = 0; i < 15 && pids.size > 0; i++) {
    await new Promise((r) => setTimeout(r, 200));
    for (const pid of pids) if (!(await isBrowserAlive(pid))) pids.delete(pid);
  }
  for (const pid of pids) {
    await run("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(
      () => {}
    );
  }
  writeState(null);
  return { ok: true };
}

// Opens the wall full screen on `screenId`. One window at a time: if it's open
// elsewhere it moves. `port` is this server's (dev and prod run side by side);
// `userId` is who pressed — the window signs in as them with a one-time key.
export async function openFollowScreen(
  screenId: string,
  port: string,
  userId: number
): Promise<Result> {
  const screen = (await listScreens()).find((s) => s.id === screenId);
  if (!screen) return { ok: false, error: "המסך לא נמצא במחשב המצלמות" };
  const browser = BROWSERS.find((p) => fs.existsSync(p));
  if (!browser) return { ok: false, error: "לא נמצא Chrome במחשב המצלמות" };

  await closeFollowScreen();
  fs.mkdirSync(PROFILE, { recursive: true });
  const url = `http://localhost:${port}/api/follow-screen/enter?t=${issueEnterKey(userId)}`;
  const child = spawn(
    browser,
    [
      `--user-data-dir=${PROFILE}`,
      `--window-position=${screen.x},${screen.y}`,
      `--window-size=${screen.width},${screen.height}`,
      "--kiosk",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-crash-restore-bubble",
      "--disable-features=Translate",
      "--autoplay-policy=no-user-gesture-required",
      `--app=${url}`,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  if (!child.pid) return { ok: false, error: "פתיחת החלון נכשלה" };
  writeState({ pid: child.pid, screen: screen.id, openedAt: Date.now() });
  return { ok: true };
}

// ---- one-time sign-in key ----------------------------------------------------
// The window runs on its own Chrome profile, which has no session. Rather than
// someone walking to the camera computer to sign in, the launch URL carries a
// single-use key (60 s) that /api/follow-screen/enter swaps for a session.

const KEY_TTL_MS = 60_000;
const g = globalThis as unknown as {
  followEnterKeys?: Map<string, { userId: number; expires: number }>;
};
const enterKeys = (g.followEnterKeys ??= new Map());

function issueEnterKey(userId: number): string {
  for (const [k, e] of enterKeys) if (e.expires <= Date.now()) enterKeys.delete(k);
  const key = randomBytes(24).toString("hex");
  enterKeys.set(key, { userId, expires: Date.now() + KEY_TTL_MS });
  return key;
}

export function redeemEnterKey(key: string): number | null {
  const entry = enterKeys.get(key);
  enterKeys.delete(key);
  return entry && entry.expires > Date.now() ? entry.userId : null;
}
