import { getCurrentUser } from "@/lib/auth";
import { fetchCameraSnapshot } from "@/lib/camera";
import { pg } from "@/lib/pg";

export const dynamic = "force-dynamic";

// Live snapshot of a registry camera (Postgres `cameras`), pulled THROUGH its
// recorder's channel — works for every recorded camera, including ones the app
// has no direct id for. ?id=<camera id>, e.g. nvr-100-ch5. Logged-in staff
// only; recorder credentials come from env (<cred_env>_USER/_PASS) and never
// reach the browser.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const { rows } = await pg.query(
    `SELECT c.channel, r.host, r.http_port, r.cred_env
       FROM cameras c JOIN recorders r ON r.id = c.recorder_id
      WHERE c.id = $1`,
    [id]
  );
  const cam = rows[0];
  if (!cam) return new Response("Unknown camera", { status: 400 });

  const userName = process.env[`${cam.cred_env}_USER`];
  const pass = process.env[`${cam.cred_env}_PASS`];
  if (!userName || !pass) return new Response("Recorder not configured", { status: 502 });

  try {
    const frame = await fetchCameraSnapshot({
      host: cam.http_port === 80 ? cam.host : `${cam.host}:${cam.http_port}`,
      user: userName,
      pass,
      path: `/ISAPI/Streaming/channels/${cam.channel}01/picture`,
    });
    if (!frame) return new Response("Camera unavailable", { status: 502 });
    return new Response(frame, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Camera error", { status: 502 });
  }
}
