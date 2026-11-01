import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";
import { INTERCOM_PANELS } from "@/lib/intercom";
import {
  endPanelCall,
  logControl,
  readPanelCallStatus,
  type PanelCallStatus,
} from "@/lib/intercom-control";
import { followIntercomLog } from "@/lib/intercom-log";

// A visitor pressing a door panel's call button, as the panels report it over
// Hik's SDK (decoded from 80 real calls, 2026-10-30/31): alarm 17 when it starts
// ringing on the lobby tablet, an unlock event if the lobby opens (typically
// 6–13s in), alarm 18 when the call ends. The lobby's own direct connect to a
// panel sends only the 18, so it never shows up as a call.
const CALL_START = 17;
const CALL_END = 18;
// An ended call stays a moment so the popup can say how it ended.
const ENDED_SHOW_MS = 4000;
// A call whose end we never heard (listener restart, missed line).
const MAX_CALL_MS = 3 * 60_000;

// The lobby tablet's device number — the unlock source when it opens.
const LOBBY_TABLET = "10010110001";

const PHOTOS_DIR = path.join(process.cwd(), "data", "intercom-photos");
const OPENINGS_FILE = path.join(PHOTOS_DIR, "openings.jsonl");

export type IntercomCall = {
  id: string;
  camId: string;
  name: string;
  startedAt: number;
  openedAt: number | null;
  // "tablet" | "remote" (our 🔑 or iVMS) | other unlock kinds as the panel names them
  openedBy: string | null;
  endedAt: number | null;
  replay: boolean;
  // the panel's own call state while the call is live: ring / onCall (answered
  // on the tablet) / idle — read once a second, null until the first read
  panelStatus: PanelCallStatus | null;
};

// How often a live call's panel is asked for its state.
const STATUS_EVERY_MS = 1000;

type PanelEvent = {
  panel?: string;
  cmd?: string;
  type?: number;
  replay?: boolean;
  unlock?: { by: string; src: string; lock: string };
};

type CallsState = {
  tailing: boolean;
  calls: Map<string, IntercomCall>;
  // panel host -> when its call state was last asked for (or is being asked now)
  statusAskedAt?: Map<string, number>;
};

// One tail per server process (survives dev hot-reloads via globalThis).
const g = globalThis as typeof globalThis & { __raamIntercomCalls?: CallsState };
const state: CallsState = (g.__raamIntercomCalls ??= { tailing: false, calls: new Map() });
state.statusAskedAt ??= new Map();
const statusAskedAt = state.statusAskedAt;

const panelsByHost = new Map(INTERCOM_PANELS.map((p) => [p.host, p]));

function openedBy(unlock: PanelEvent["unlock"]): string | null {
  if (!unlock) return null;
  if (unlock.by === "indoor") return unlock.src === LOBBY_TABLET ? "tablet" : `indoor ${unlock.src}`;
  if (unlock.by === "center") return "remote";
  return unlock.by;
}

function onEvent(line: string) {
  let ev: PanelEvent;
  try {
    ev = JSON.parse(line);
  } catch {
    return;
  }
  const panel = panelsByHost.get(ev.panel ?? "");
  if (!panel) return;
  const now = Date.now();
  const call = state.calls.get(panel.host);
  const live = call && call.endedAt === null;

  if (ev.cmd === "0x1133" && ev.type === CALL_START) {
    state.calls.set(panel.host, {
      id: `${panel.host}-${now}`,
      camId: panel.camId,
      name: panel.name,
      startedAt: now,
      openedAt: null,
      openedBy: null,
      endedAt: null,
      replay: !!ev.replay,
      panelStatus: null,
    });
  } else if (ev.cmd === "0x1133" && ev.type === CALL_END) {
    if (live) call.endedAt = now;
  } else if (ev.cmd === "0x1132" && ev.type === 1) {
    if (live && call.openedAt === null) {
      call.openedAt = now;
      call.openedBy = openedBy(ev.unlock);
    }
  }
}

export function ensureIntercomCalls() {
  if (state.tailing) return;
  state.tailing = true;
  void followIntercomLog(onEvent);
}

// Ask a live call's panel for its state, at most once a second, in the
// background (the popup's poll never waits on the panel). Each change is
// logged: it tells us whether the panel's status really follows a visitor call.
function refreshPanelStatus(host: string, call: IntercomCall) {
  const now = Date.now();
  if (now - (statusAskedAt.get(host) ?? 0) < STATUS_EVERY_MS) return;
  statusAskedAt.set(host, now);
  void readPanelCallStatus(call.camId).then((status) => {
    if (status !== call.panelStatus) {
      void logControl({ camId: call.camId, step: "watch", call: call.id, status });
    }
    call.panelStatus = status;
  });
}

// Calls ringing or in progress now, plus ones that just ended.
export function getIntercomCalls(): IntercomCall[] {
  const now = Date.now();
  for (const [host, c] of state.calls) {
    const over = c.endedAt !== null ? now - c.endedAt > ENDED_SHOW_MS : now - c.startedAt > MAX_CALL_MS;
    if (over) state.calls.delete(host);
    else if (c.endedAt === null && !c.replay) refreshPanelStatus(host, c);
  }
  return [...state.calls.values()].sort((a, b) => b.startedAt - a.startedAt);
}

// End a panel's live call from our side, so the tablet stops ringing / talking
// too: after our 🔑 opened the door ("opened"), or the popup's hang-up button.
// Only while we know of a live call there — a 🔑 press outside a call never
// sends call commands. A replayed call has no real call behind it, so it just
// ends here. Once the panel accepts, the popup closes without waiting for its
// end event.
export async function endIntercomCall(camId: string, reason: "opened" | "hangup"): Promise<boolean> {
  const call = [...state.calls.values()].find((c) => c.camId === camId && c.endedAt === null);
  if (!call) return false;
  const ok = call.replay ? true : await endPanelCall(camId, reason);
  if (ok) call.endedAt ??= Date.now();
  return ok;
}

export type IntercomOpening = {
  at: number;
  camId: string | null;
  name: string;
  openedBy: string | null;
  // who pressed our 🔑, when the opening matches one (door_events)
  lobbyist: string | null;
  photo: string | null;
  replay: boolean;
};

// door_events.created_at is SQLite CURRENT_TIMESTAMP: UTC "YYYY-MM-DD HH:MM:SS".
const sqlUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

// The latest door openings the listener recorded (newest first), each with the
// photo the panel took. A remote opening is matched to our own 🔑 press, if any.
export async function getRecentOpenings(limit = 24): Promise<IntercomOpening[]> {
  let text: string;
  try {
    text = await fs.readFile(OPENINGS_FILE, "utf8");
  } catch {
    return [];
  }
  const pressed = db.prepare(
    `SELECT lobbyist_name FROM door_events
     WHERE door_id = ? AND source = 'intercom' AND ok = 1 AND created_at BETWEEN ? AND ?
     ORDER BY created_at DESC LIMIT 1`
  );
  const out: IntercomOpening[] = [];
  for (const line of text.trimEnd().split("\n").reverse()) {
    if (out.length >= limit) break;
    let row: { at: string; panel: string; by: string; src: string; lock: string; photo: string | null; replay?: boolean };
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const panel = panelsByHost.get(row.panel);
    // Local time without a zone, as the listener writes it.
    const at = new Date(row.at).getTime();
    const by = openedBy(row);
    let lobbyist: string | null = null;
    if (by === "remote" && panel) {
      const hit = pressed.get(`intercom-${panel.camId}`, sqlUtc(at - 15_000), sqlUtc(at + 15_000)) as
        | { lobbyist_name: string }
        | undefined;
      lobbyist = hit?.lobbyist_name || null;
    }
    out.push({
      at,
      camId: panel?.camId ?? null,
      name: panel?.name ?? row.panel,
      openedBy: by,
      lobbyist,
      photo: row.photo,
      replay: !!row.replay,
    });
  }
  return out;
}

// data/intercom-photos/<day>/<HHMMSS-mmm>_<panel>.jpg, as the listener names them.
const PHOTO_NAME = /^\d{4}-\d{2}-\d{2}\/\d{6}-\d{3}_\d{1,3}\.jpg$/;

export async function readOpeningPhoto(name: string): Promise<Buffer | null> {
  if (!PHOTO_NAME.test(name)) return null;
  try {
    return await fs.readFile(path.join(PHOTOS_DIR, name));
  } catch {
    return null;
  }
}
