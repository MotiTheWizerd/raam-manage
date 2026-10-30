import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// הקלטות: which stretches each camera recorded in a window. The recorder
// searches (and their audit) run in the camera-chat service, which already
// speaks to the DVR/NVR.

const CHAT_URL = process.env.TRACING_CHAT_URL ?? "http://127.0.0.1:8095";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.user_role !== "manager") return new Response("Forbidden", { status: 403 });

  const q = new URL(request.url).searchParams;
  const params = new URLSearchParams({
    cams: q.get("cams") ?? "",
    from: q.get("from") ?? "",
    to: q.get("to") ?? "",
    q: q.get("q") ?? "",
    user: user.lobbyist_name,
  });
  try {
    const upstream = await fetch(`${CHAT_URL}/recordings?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Recordings service unavailable" }, { status: 502 });
  }
}
