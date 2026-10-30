import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// הקלטות playback, step 1: get the recording file holding a moment ready to
// play. The camera-chat service downloads it whole from the recorder (a
// continuous camera's file can be ~1 GB, so this may take a while) and answers
// with its key and real start time. Every play is audited there.

const CHAT_URL = process.env.TRACING_CHAT_URL ?? "http://127.0.0.1:8095";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.user_role !== "manager") return new Response("Forbidden", { status: 403 });

  const q = new URL(request.url).searchParams;
  const params = new URLSearchParams({ cam: q.get("cam") ?? "", at: q.get("at") ?? "", user: user.lobbyist_name });
  try {
    const upstream = await fetch(`${CHAT_URL}/recordings/clip?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5 * 60_000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Recordings service unavailable" }, { status: 502 });
  }
}
