import { Readable } from "node:stream";
import fs from "node:fs";
import { isManager } from "@/lib/auth";
import { resolveBackupPath } from "@/lib/backup";

export const runtime = "nodejs";

// Download a backup file. Manager-only (the cookie is sent on same-origin
// requests; /api/* is excluded from the proxy gate so we re-check here).
export async function GET(req: Request) {
  if (!(await isManager())) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  const name = url.searchParams.get("name") ?? "";

  const full = resolveBackupPath(kind, name);
  if (!full) return new Response("Not found", { status: 404 });

  const stat = await fs.promises.stat(full);
  const webStream = Readable.toWeb(fs.createReadStream(full)) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
