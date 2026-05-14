import { whatsappTest } from "@/lib/whatsapp-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const status = await whatsappTest.connect();
    return Response.json(status);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to connect." },
      { status: 500 }
    );
  }
}
