import { getCurrentUser } from "@/lib/auth";
import { ensureMotionListener, getActiveMotion } from "@/lib/motion";

export const dynamic = "force-dynamic";

// Which cameras see motion right now (the cameras' own motion detection —
// see lib/motion.ts). Polled ~1/s by the cameras page's motion-follow mode.
// Auth-gated like /api/gate-cam.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  ensureMotionListener();
  return Response.json({ now: Date.now(), active: getActiveMotion() });
}
