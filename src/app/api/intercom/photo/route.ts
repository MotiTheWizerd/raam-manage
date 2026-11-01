import { getCurrentUser } from "@/lib/auth";
import { readOpeningPhoto } from "@/lib/intercom-calls";

export const runtime = "nodejs";

// One door-opening photo (?f=<day>/<file>.jpg). Any logged-in staff may load it —
// same trust level as the camera proxy. /api/* is outside the proxy auth gate,
// so the session is re-checked here.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Forbidden", { status: 403 });

  const buf = await readOpeningPhoto(new URL(req.url).searchParams.get("f") ?? "");
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/jpeg",
      // a given opening's photo never changes
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
