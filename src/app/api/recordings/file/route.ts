import { getCurrentUser } from "@/lib/auth";

// הקלטות playback, step 2: stream a prepared recording (MP4) to the <video>.
// Range requests pass through so the player can seek.

const CHAT_URL = process.env.TRACING_CHAT_URL ?? "http://127.0.0.1:8095";
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.user_role !== "manager") return new Response("Forbidden", { status: 403 });

  const f = new URL(request.url).searchParams.get("f") ?? "";
  const range = request.headers.get("range");
  try {
    const upstream = await fetch(`${CHAT_URL}/recordings/file?${new URLSearchParams({ f })}`, {
      cache: "no-store",
      headers: range ? { range } : {},
      signal: request.signal,
    });
    const headers = new Headers({ "Cache-Control": "private, max-age=3600" });
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response("Recordings service unavailable", { status: 502 });
  }
}
