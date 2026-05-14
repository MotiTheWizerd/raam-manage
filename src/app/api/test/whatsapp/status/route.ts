import { whatsappTest } from "@/lib/whatsapp-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(whatsappTest.getStatus());
}
