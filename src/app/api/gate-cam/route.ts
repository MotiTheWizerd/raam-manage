import { getCurrentUser } from "@/lib/auth";
import { fetchCameraSnapshot } from "@/lib/camera";
import { getGate } from "@/lib/gates";

export const dynamic = "force-dynamic";

// Live snapshot of a gate's camera. Auth-gated (the /api/* paths bypass the
// proxy redirect, so we re-check here) — keeps the camera feed to logged-in
// staff only. The camera password never reaches the browser.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const gateId = new URL(request.url).searchParams.get("gate");
  const gate = gateId ? getGate(gateId) : undefined;
  if (!gate) return new Response("Unknown gate", { status: 400 });

  try {
    const frame = await fetchCameraSnapshot(gate.cam);
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
