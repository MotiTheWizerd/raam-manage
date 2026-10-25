import type { FaceEventFilter } from "@/app/settings/face-actions";

// The lobby face camera's annotated MJPEG, relayed by the app (src/app/api/
// face-cam) so it plays from any staff computer — not just the sentry's box.
export const FACE_CAM_PATH = "/api/face-cam";

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
