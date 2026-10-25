import { getCurrentUser } from "@/lib/auth";
import { fetchCameraSnapshot } from "@/lib/camera";
import { getFleetCamera } from "@/lib/fleet-cameras";
import { getCamera, getGate } from "@/lib/gates";

export const dynamic = "force-dynamic";

// Live snapshot of a gate's camera. Auth-gated (the /api/* paths bypass the
// proxy redirect, so we re-check here) — keeps the camera feed to logged-in
// staff only. The camera password never reaches the browser.
//
// Accepts ?cam=<CameraId> (the curated entrance cameras + the wider discovered
// fleet, e.g. net-152 / dvr-24 — used by the cameras explorer) or the legacy
// ?gate=<GateId> (a gate's own live view).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const camId = params.get("cam");
  const gateId = params.get("gate");
  const cam = camId
    ? getCamera(camId) ?? getFleetCamera(camId)
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
