import { isManager } from "@/lib/auth";
import { readGatePhoto } from "@/lib/supplier-gate";

export const runtime = "nodejs";

// One boom-gate log photo (?f=<day>/<file>.jpg) for the settings log tab —
// managers only, like the tab. /api/* is outside the proxy auth gate, so the
// session is re-checked here.
export async function GET(req: Request) {
  if (!(await isManager())) return new Response("Forbidden", { status: 403 });

  const buf = readGatePhoto(new URL(req.url).searchParams.get("f") ?? "");
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/jpeg",
      // a given opening's photo never changes
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
