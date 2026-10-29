import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The camera chat agent (vision/tracing/chat_service.py) — same box, localhost
// only. The browser never talks to it directly: this route checks the login,
// stamps who's asking (for the trace_audit log) and streams the NDJSON reply.
const CHAT_URL = process.env.TRACING_CHAT_URL ?? "http://127.0.0.1:8095";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { session_id?: string; message?: string }
    | null;
  const message = body?.message?.trim();
  if (!message) return new Response("Empty message", { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(`${CHAT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: body?.session_id,
        message: message.slice(0, 2000),
        user: user.lobbyist_name,
      }),
      cache: "no-store",
    });
  } catch {
    return new Response("Camera chat service unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Camera chat service error", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
