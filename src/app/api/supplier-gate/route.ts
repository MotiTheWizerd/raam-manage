import { getCurrentUser } from "@/lib/auth";
import { getSupplierGate, noteGateViewer } from "@/lib/supplier-gate";

export const dynamic = "force-dynamic";

// Is the supplier-yard boom gate open, and since when (see lib/supplier-gate.ts).
// Polled by the header info row on every page; the poller's name is what the
// opening log records as the lobbyist on shift.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  noteGateViewer(user.lobbyist_name);
  return Response.json({ now: Date.now(), ...getSupplierGate() });
}
