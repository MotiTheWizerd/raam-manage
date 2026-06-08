import type { CameraId } from "@/lib/gates";

// "Escort the car" — one button press plays the whole arrival as a multi-shot
// cut and drives the gates automatically:
//
//   cold open (.60 street) -> upper gate (.107) -> ramp (.61)
//     -> road (cam 29 שביל כניסה) -> lower gate (.112) -> open
//
// The upper gate fires the instant the lobbyist presses (the real car is
// waiting — never delay it for the cinematics). A countdown to the door opening
// runs through the descent; the road/lower cuts are timed by how many seconds
// remain on it. When it hits 0 we open the lower gate (flashing "פותח דלת") and
// SILENTLY re-pulse it so it stays open while the car passes — the gates
// auto-close ~5s, so re-firing a touch faster keeps it solidly open.
//
// TUNE THESE after watching real cars:
export const SEQ = {
  // Overall time to the lower gate opening ≈ coldOpen + upper + ramp +
  // roadAtSecLeft = 3 + 4 + 4 + 14 = 25s (the countdown the lobbyist watches).
  coldOpenMs: 3000, // .60 street — car approaching
  upperMs: 4000, // .107 upper gate — car enters
  rampMs: 4000, // .61 ramp — brief in-ramp shot at the top of the descent
  roadAtSecLeft: 14, // cut to the road cam (cam 29 שביל) when this many seconds remain
  lowerAtSecLeft: 10, // cut to the lower-gate cam (.112) when this many seconds remain
  lowerHoldMs: 30000, // .112 lower — how long we hold the lower gate open after it opens
  pulseEveryMs: 4000, // re-fire cadence (< the ~5s auto-close, so no visible judder)
  closeWatchMs: 7000, // after the last pulse, keep watching until the gate auto-closes (~5s) + margin
  dooringMs: 3000, // how long the big "פותח דלת" flashes when the gate opens
};

export const REFRESH_MS = 400; // live-frame refresh (raw snapshot mode)

// The local vision service (vision/server.py) that serves annotated MJPEG
// detection feeds — same one GateLiveView's scan-eye uses. With detection on,
// the escort shows boxes on the car as it moves through the flow.
export const VISION_URL =
  process.env.NEXT_PUBLIC_VISION_URL ?? "http://127.0.0.1:8089";

// Phase boundaries, measured from button press (T=0). The road/lower cuts are
// derived from the countdown (roadAtSecLeft / lowerAtSecLeft seconds remaining).
export const T_UPPER = SEQ.coldOpenMs;
export const T_RAMP = T_UPPER + SEQ.upperMs;
export const T_ROAD = T_RAMP + SEQ.rampMs; // road cam on; countdown reads roadAtSecLeft
export const T_OPEN = T_ROAD + SEQ.roadAtSecLeft * 1000; // lower gate opens here (countdown 0)
export const T_LOWER_CAM = T_OPEN - SEQ.lowerAtSecLeft * 1000; // lower cam on; countdown reads lowerAtSecLeft
export const T_END = T_OPEN + SEQ.lowerHoldMs;

// Cameras that should auto-enable object-detection mode when their shot is on
// screen — the lower-gate cam shows the car driving in once the gate opens, so
// we light up the detection boxes for the cool factor (and it's the same feed a
// future watcher will use to auto-close once the car is through).
export const AUTO_DETECT_CAMS: CameraId[] = ["lower"];

export type Phase = "cold" | "upper" | "ramp" | "road" | "lower" | "open" | "done";

// Client-side mirror of the camera labels (the real creds/IPs live server-side
// in gates.ts, which is import "server-only").
export const SHOTS: { phase: Phase; cam: CameraId; label: string }[] = [
  { phase: "cold", cam: "street", label: "כניסה" },
  { phase: "upper", cam: "upper", label: "שער עליון" },
  { phase: "ramp", cam: "ramp", label: "רמפה" },
  { phase: "road", cam: "road", label: "שביל כניסה" },
  { phase: "lower", cam: "lower", label: "שער תחתון" },
];

export function buildCaption(phase: Phase, secsToLower: number): string {
  const captions: Record<Phase, string> = {
    cold: "רכב מתקרב לכניסה…",
    upper: "השער העליון נפתח — היכון",
    ramp: `הרכב יורד ברמפה · שער תחתון בעוד ${secsToLower}`,
    road: `הרכב בשביל הכניסה · שער תחתון בעוד ${secsToLower}`,
    lower: `מתקרב לשער התחתון · נפתח בעוד ${secsToLower}`,
    open: "שער תחתון פתוח · נסיעה טובה",
    done: "השער נסגר · הרצף הושלם",
  };
  return captions[phase];
}
