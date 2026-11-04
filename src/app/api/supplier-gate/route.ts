import { getCurrentUser } from "@/lib/auth";
import { getSupplierGate, markGateFalsePositive, noteGateViewer } from "@/lib/supplier-gate";

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

// 'בטל' on the strip: { id } of the open row, marked a false positive.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "number") return new Response("Bad id", { status: 400 });
  return Response.json({ ok: markGateFalsePositive(id) });
}
