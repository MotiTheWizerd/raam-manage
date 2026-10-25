import { getCurrentUser } from "@/lib/auth";
import { fetchCameraSnapshot } from "@/lib/camera";
import { fleetRtspUrl, getFleetCamera } from "@/lib/fleet-cameras";
import { getCamera, getGate } from "@/lib/gates";

export const dynamic = "force-dynamic";

// The vision service (OpenCV) that decodes RTSP cameras into frames. Same box,
// localhost — it's the only thing that can read the non-ISAPI cameras.
const VISION_INTERNAL_URL =
  process.env.VISION_INTERNAL_URL ?? "http://127.0.0.1:8089";

// Pull one JPEG from an RTSP camera via the vision service. The RTSP URL (with
// credentials) is built server-side and sent over localhost only.
async function fetchRtspFrame(rtspUrl: string): Promise<Response> {
  try {
    const res = await fetch(
      `${VISION_INTERNAL_URL}/rtsp?url=${encodeURIComponent(rtspUrl)}`,
      { cache: "no-store", signal: AbortSignal.timeout(20000) }
    );
    if (!res.ok) return new Response("Camera unavailable", { status: 502 });
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch {
    // Most likely the vision service isn't running on :8089.
    return new Response("Vision service unavailable", { status: 502 });
  }
}

// Live snapshot of a camera. Auth-gated (the /api/* paths bypass the proxy
// redirect, so we re-check here) — logged-in staff only. Credentials never
// reach the browser.
//
// Accepts ?cam=<CameraId> (curated entrance cameras + the discovered fleet, e.g.
// net-152 / dvr-24 / rtsp-180) or the legacy ?gate=<GateId> (a gate's live view).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const camId = params.get("cam");
  const gateId = params.get("gate");

  // RTSP fleet camera → decode a frame via the vision service.
  const fleetCam = camId ? getFleetCamera(camId) : undefined;
  if (fleetCam) {
    const rtspUrl = fleetRtspUrl(fleetCam);
    if (rtspUrl) return fetchRtspFrame(rtspUrl);
  }

  // Otherwise an ISAPI HTTP snapshot (curated camera, gate camera, or an ISAPI
  // fleet camera).
  const cam = camId
    ? getCamera(camId) ?? fleetCam
    : gateId
      ? getGate(gateId)?.cam
      : undefined;
  if (!cam) return new Response("Unknown camera", { status: 400 });

  try {
    const frame = await fetchCameraSnapshot(cam);
    if (!frame) return new Response("Camera unavailable", { status: 502 });

    return new Response(frame, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Camera error", { status: 502 });
  }
}
