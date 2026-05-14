import { whatsappTest } from "@/lib/whatsapp-test";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    phone?: unknown;
    message?: unknown;
  } | null;

  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!phone || !message) {
    return Response.json(
      { error: "Phone and message are required." },
      { status: 400 }
    );
  }

  try {
    await whatsappTest.sendText(phone, message);
    return Response.json({ ok: true, status: whatsappTest.getStatus() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to send." },
      { status: 500 }
    );
  }
}
