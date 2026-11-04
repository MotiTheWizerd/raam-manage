import { getCurrentUser } from "@/lib/auth";
import { fetchCameraSnapshot } from "@/lib/camera";
import { cameraRtspUrl } from "@/lib/camera-rtsp";
import { fleetRtspUrl, getFleetCamera } from "@/lib/fleet-cameras";
import { getCamera } from "@/lib/gates";

export const dynamic = "force-dynamic";

const VISION_INTERNAL_URL =
  process.env.VISION_INTERNAL_URL ?? "http://127.0.0.1:8089";

// Frame rate per tile, and JPEG quality: the sub stream (640×360) as it comes
// at 80; the HD main stream shrunk to 1280 wide at 75 — a browser decodes a
// full 1080p frame too slowly for 20 fps on two tiles, and 720p is still sharp
// on a wall of one or two.
const LIVE_FPS = 20;
const SUB_QUALITY = 80;
const HD_QUALITY = 75;
const HD_WIDTH = 1280;
const SUB_WIDTH = 640;
// A full wall is 9; a few spare in case tiles change while the list is in flight.
const MAX_CAMS = 12;
// While a camera's video is down: one snapshot this often, and retry the video.
const FALLBACK_GAP_MS = 1000;
// Frames queue here when the browser reads slower than they come; past this,
// new frames are dropped (a tile skips ahead rather than falling behind).
const QUEUE_BYTES = 2_000_000;

// The follow wall's live video. One response carries every tile's frames, so
// the wall uses ONE of the browser's 6 connections to the app instead of one
// per tile (9 open streams would starve everything else on the page).
//
// ?cams=lobby,net-152:hd — a camera per tile, ":hd" for the main stream (few
// tiles or fullscreen), otherwise the sub stream.
//
// The body is a run of frames, each: "<cam> <bytes>\n" then that many bytes of
// JPEG. Video comes from the vision service's /live MJPEG (RTSP cameras, and
// the elevators over Hikvision's SDK); while that's down, a snapshot a second.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const cams = (new URL(request.url).searchParams.get("cams") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_CAMS)
    .map((c) => {
      const [id, flag] = c.split(":");
      return { id, hd: flag === "hd" };
    });
  if (cams.length === 0) return new Response("No cameras", { status: 400 });

  const signal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const send = (id: string, jpeg: Uint8Array) => {
          if (signal.aborted) return;
          if ((controller.desiredSize ?? 1) <= 0) return; // browser behind: drop
          const head = encoder.encode(`${id} ${jpeg.byteLength}\n`);
          const chunk = new Uint8Array(head.byteLength + jpeg.byteLength);
          chunk.set(head);
          chunk.set(jpeg, head.byteLength);
          try {
            controller.enqueue(chunk);
          } catch {
            // closed under us — the abort below ends the loops
          }
        };
        for (const { id, hd } of cams) void pumpCamera(id, hd, signal, send);
        signal.addEventListener("abort", () => {
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
    },
    { highWaterMark: QUEUE_BYTES, size: (chunk) => chunk.byteLength }
  );

  return new Response(stream, {
    headers: {
      // Not a compressible type, so Next streams it as-is instead of gzipping.
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}

// One camera's frames into the shared response until the wall lets go.
async function pumpCamera(
  id: string,
  hd: boolean,
  signal: AbortSignal,
  send: (id: string, jpeg: Uint8Array) => void
) {
  // RTSP cameras, or the SDK-only elevators (their one stream is 720p, so a
  // small tile gets it shrunk like a sub stream).
  const source = cameraRtspUrl(id, hd ? "main" : "sub");
  const quality = hd ? HD_QUALITY : SUB_QUALITY;
  const width = hd ? HD_WIDTH : SUB_WIDTH;
  let gotVideo = false;
  // A first picture straight from the camera while its video opens: the vision
  // service opens RTSP streams one at a time (~1.2 s each), so tiles arriving
  // together would otherwise wait in line. Not for an RTSP-only camera — its
  // still would queue behind those same opens.
  const fleetCam = getFleetCamera(id);
  const rtspOnly = fleetCam ? !!fleetRtspUrl(fleetCam)?.startsWith("rtsp://") : false;
  if (!rtspOnly) {
    void snapshot(id).then((still) => {
      if (still && !gotVideo) send(id, new Uint8Array(still));
    });
  }
  while (!signal.aborted) {
    if (source?.startsWith("rtsp://") || source?.startsWith("hiksdk://")) {
      try {
        const res = await fetch(
          `${VISION_INTERNAL_URL}/live?url=${encodeURIComponent(source)}` +
            `&fps=${LIVE_FPS}&q=${quality}&w=${width}`,
          { cache: "no-store", signal }
        );
        if (res.ok && res.body) {
          for await (const jpeg of mjpegFrames(res.body)) {
            gotVideo = true;
            send(id, jpeg);
          }
        }
      } catch {
        // aborted, or the vision service is down — fall through
      }
      if (signal.aborted) return;
    }
    // No video right now: a snapshot, then try the video again.
    const still = await snapshot(id);
    if (still) send(id, new Uint8Array(still));
    await sleep(FALLBACK_GAP_MS, signal);
  }
}

// One still the way /api/gate-cam gets it: RTSP-only fleet cameras through the
// vision service, the rest over ISAPI straight from the camera.
async function snapshot(id: string): Promise<ArrayBuffer | null> {
  const fleetCam = getFleetCamera(id);
  const rtsp = fleetCam ? fleetRtspUrl(fleetCam) : null;
  try {
    if (rtsp) {
      const res = await fetch(
        `${VISION_INTERNAL_URL}/rtsp?url=${encodeURIComponent(rtsp)}`,
        { cache: "no-store", signal: AbortSignal.timeout(20000) }
      );
      return res.ok ? await res.arrayBuffer() : null;
    }
    const cam = getCamera(id) ?? fleetCam;
    return cam ? await fetchCameraSnapshot(cam) : null;
  } catch {
    return null;
  }
}

// The JPEGs out of a multipart MJPEG body (each part carries Content-Length).
async function* mjpegFrames(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let buf = Buffer.alloc(0);
  let need = -1;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buf = buf.length ? Buffer.concat([buf, value]) : Buffer.from(value);
      for (;;) {
        if (need < 0) {
          const end = buf.indexOf("\r\n\r\n");
          if (end < 0) break;
          const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, end).toString("latin1"));
          buf = buf.subarray(end + 4);
          if (!m) continue;
          need = Number(m[1]);
        }
        if (buf.length < need) break;
        yield buf.subarray(0, need);
        buf = buf.subarray(need);
        need = -1;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}
