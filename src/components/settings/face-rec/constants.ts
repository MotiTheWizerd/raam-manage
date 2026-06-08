import type { FaceEventFilter } from "@/app/settings/face-actions";

// The face sentry's own HTTP service (vision/face_probe.py). The browser loads
// its annotated MJPEG straight from the lobby PC; override per-machine if the
// port changes. Server-side calls use FACE_VISION_URL (see src/lib/faces.ts).
export const FACE_URL =
  process.env.NEXT_PUBLIC_FACE_VISION_URL ?? "http://127.0.0.1:8090";

// How long the app waits for the (deferred) capture to complete: the sentry
// only starts its ~6s capture once a face appears, so we poll for the saved
// faceprint across the walk-over grace window + the capture itself.
export const AWAIT_WINDOW_MS = 60_000;
export const POLL_MS = 2500;

// Entry-log feed paging + live refresh.
export const LOG_PAGE_SIZE = 24;
export const LOG_REFRESH_MS = 8000;

export const LOG_FILTERS: { value: FaceEventFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "known", label: "מזוהים" },
  { value: "unknown", label: "לא מזוהים" },
];
