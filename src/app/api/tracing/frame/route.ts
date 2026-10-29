import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The full camera frame at a sighting's moment, person boxed — the gallery's
// full-resolution view (?s=<sighting id>). Rendered by the tracing service
// from the recording itself; the first frame from a recording waits for its
// download, later ones come from the service's cache. Logged-in staff only.
const CHAT_URL = process.env.TRACING_CHAT_URL ?? "http://127.0.0.1:8095";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("s"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad id", { status: 400 });

  try {
    const res = await fetch(`${CHAT_URL}/frame?s=${id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return new Response("Frame unavailable", { status: res.status === 404 ? 404 : 502 });
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Tracing service unavailable", { status: 502 });
  }
}
