import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The face sentry's HTTP service — same box, localhost (see src/lib/faces.ts).
const FACE_INTERNAL_URL =
  process.env.FACE_VISION_URL ?? "http://127.0.0.1:8090";

// Live annotated MJPEG of the lobby face camera, relayed through the app so any
// staff browser can watch it — the browser never talks to :8090 directly (that
// only worked on the sentry's own box). Auth-gated: /api/* bypasses the proxy
// redirect, so we re-check the session here.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Abort the upstream stream when the viewer closes the page.
  const upstream = new AbortController();
  request.signal.addEventListener("abort", () => upstream.abort());

  try {
    const res = await fetch(`${FACE_INTERNAL_URL}/lobby`, {
      cache: "no-store",
      signal: upstream.signal,
    });
    if (!res.ok || !res.body) {
      return new Response("Camera unavailable", { status: 502 });
    }
    return new Response(res.body, {
      headers: {
        // multipart/x-mixed-replace; boundary=frame — pass it through as-is.
        "Content-Type":
          res.headers.get("Content-Type") ??
          "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Most likely the face sentry isn't running on :8090.
    return new Response("Face service unavailable", { status: 502 });
  }
}
