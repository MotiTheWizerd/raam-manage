import { whatsappTest } from "@/lib/whatsapp-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const status = await whatsappTest.logout();
  return Response.json(status);
}
