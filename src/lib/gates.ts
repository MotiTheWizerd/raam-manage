import "server-only";

// Programmatic control of the building's parking gates.
//
// The gates are opened by replaying the SLPR cameras' own manual-open command:
// a plain HTTP GET to the HOSTLINK gate controller at 10.0.0.80:9080. These
// exact URLs come from the SLPR `camera` table (action_manual column) and were
// verified live in session 17 — both gates opened, controller returned 200/WVD*.
//
// This is additive control: the physical button box stays the primary path.

const HOST = "10.0.0.80";
const PORT = 9080;

export type GateId = "upper" | "lower";

// A Hikvision camera + its credentials, used for the live-view popup
// (ISAPI snapshot over digest auth — see camera.ts). The CCTV overview cams
// use admin/Sami0207; the LPR gate cams use admin/topline123.
export type CameraCreds = { host: string; user: string; pass: string };

export type GateDef = {
  id: GateId;
  name: string;
  url: string;
  cam: CameraCreds;
};

export const GATES: readonly GateDef[] = [
  {
    id: "upper",
    name: "שער עליון",
    url: `http://${HOST}:${PORT}/HOSTLINK/WVD00010001*`,
    // "Main Cars Gate" — the wide overview camera of the main vehicle entrance.
    cam: { host: "10.0.0.107", user: "admin", pass: "Sami0207" },
  },
  {
    id: "lower",
    name: "שער תחתון",
    url: `http://${HOST}:${PORT}/HOSTLINK/WVD00030001*`,
    // Unlabeled HD cam (.112) overlooking the inner electric gate (שער חשמלי).
    cam: { host: "10.0.0.112", user: "admin", pass: "Sami0207" },
  },
];

export function getGate(id: string): GateDef | undefined {
  return GATES.find((gate) => gate.id === id);
}

export type FireResult = { ok: boolean; status: number | null; body: string };

// Fires a SINGLE manual-open pulse at the gate. No retry — a stuck request must
// never hold a gate open. 5s timeout so a degraded controller can't hang us.
export async function fireGate(gate: GateDef): Promise<FireResult> {
  const res = await fetch(gate.url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
