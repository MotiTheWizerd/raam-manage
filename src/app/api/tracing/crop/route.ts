import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { pg } from "@/lib/pg";

export const dynamic = "force-dynamic";

// One person-crop from the tracing index, by sighting id (?s=123). These are
// pictures of people — logged-in staff only. Paths come from the db, never
// from the request, and must stay inside data/tracing.
const ROOT = path.join(process.cwd(), "data", "tracing");

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("s"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad id", { status: 400 });

  const { rows } = await pg.query("SELECT crop_path FROM sightings WHERE id = $1", [id]);
  if (!rows[0]) return new Response("Not found", { status: 404 });

  const file = path.resolve(ROOT, rows[0].crop_path);
  if (!file.startsWith(ROOT + path.sep)) return new Response("Bad path", { status: 400 });
  try {
    return new Response(await readFile(file), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
