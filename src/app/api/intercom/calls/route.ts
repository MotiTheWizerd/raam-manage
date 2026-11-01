import { getCurrentUser } from "@/lib/auth";
import { ensureIntercomCalls, getAutoOpen, getIntercomCalls } from "@/lib/intercom-calls";

export const dynamic = "force-dynamic";

// Door panels calling the lobby right now (see lib/intercom-calls.ts), plus
// whether פתיחה אוטומטית is on (every screen's calls-tab switch follows it).
// Polled ~1/s by the call popup on every page. Auth-gated like /api/motion.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  ensureIntercomCalls();
  return Response.json({ now: Date.now(), calls: getIntercomCalls(), autoOpen: getAutoOpen() });
}
