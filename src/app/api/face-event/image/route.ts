import fs from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// Serves a single face-event snapshot. Any logged-in staff may load it (the live
// "X נכנס" toast shows the photo) — same trust level as the camera proxy. /api/*
// is excluded from the proxy auth gate, so we re-check the session cookie here.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Forbidden", { status: 403 });

  const id = Number(new URL(req.url).searchParams.get("id") ?? "");
  if (!Number.isFinite(id)) return new Response("Bad request", { status: 400 });

  const row = db
    .prepare(`SELECT image_path FROM face_events WHERE id = ?`)
    .get(id) as { image_path: string | null } | undefined;
  if (!row?.image_path) return new Response("Not found", { status: 404 });

  // image_path is our own value; basename it anyway to bar any traversal.
  const file = path.join(
    process.cwd(),
    "data",
    "face_events",
    path.basename(row.image_path)
  );
  try {
    const buf = await fs.promises.readFile(file);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        // immutable: a given event id's snapshot never changes
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
