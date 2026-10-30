import { getCurrentUser } from "@/lib/auth";
import { cameraRtspUrl } from "@/lib/camera-rtsp";

export const dynamic = "force-dynamic";

const VISION_INTERNAL_URL =
  process.env.VISION_INTERNAL_URL ?? "http://127.0.0.1:8089";

// How often YOLO runs per camera. A single view gets near-full motion on the HD
// main stream; a wall tile (lite) the lighter sub stream at a few frames a
// second, so a full wall of 9 fits on the box's GPU.
const FULL_FPS = 20;
const LITE_FPS = 4;

// One object-detection frame (YOLO boxes drawn by the vision service) from any
// camera, every object marked (the vision service can also mark only moving
// ones, ?moving=1 — tried 2026-10-30, it missed real ones too often). Auth-gated;
// the RTSP URL (with credentials) is built here and only travels over localhost.
//
// ?cam=<id>&lite=1&after=<seq> — long-poll: waits for a frame newer than the
// caller's; the reply's X-Frame-Seq is the next `after`. Short requests on
// purpose — a wall of open MJPEG streams would use up the browser's 6
// connections to the app. 502 = vision service down, 503 = no picture from the
// camera.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const lite = params.get("lite") === "1";
  const rtsp = cameraRtspUrl(params.get("cam") ?? "", lite ? "sub" : "main");
  if (!rtsp) return new Response("Unknown camera", { status: 400 });
  const after = Number.parseInt(params.get("after") ?? "", 10);

  let res: Response;
  try {
    res = await fetch(
      `${VISION_INTERNAL_URL}/frame?url=${encodeURIComponent(rtsp)}` +
        `&fps=${lite ? LITE_FPS : FULL_FPS}&after=${Number.isNaN(after) ? -1 : after}`,
      {
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      }
    );
  } catch {
    return new Response("Vision service unavailable", { status: 502 });
  }
  if (!res.ok) return new Response("Camera unavailable", { status: 503 });

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Frame-Seq": res.headers.get("x-frame-seq") ?? "-1",
    },
  });
}
