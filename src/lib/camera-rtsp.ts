import "server-only";

import { getFleetCamera } from "@/lib/fleet-cameras";
import { getCamera, type CameraCreds } from "@/lib/gates";

// RTSP addresses for any camera the app knows (the curated entrance cams + the
// whole fleet), for the vision service's object detection. Credentials are
// embedded, so this stays server-side; the URL only travels over localhost.

export type StreamKind = "main" | "sub";

// Hikvision channel number from a snapshot path (/ISAPI/Streaming/channels/2901/... -> 29).
export function hikChannel(cam: CameraCreds): number {
  const m = cam.path ? /channels\/(\d+)\d{2}\//.exec(cam.path) : null;
  return m ? Number(m[1]) : 1;
}

// Hikvision numbers streams /Streaming/Channels/<channel><stream>: 101 = channel 1
// main (HD), 102 = its sub stream (lighter), 2902 = DVR channel 29's sub. Fleet
// RTSP-only cams keep their own path (Easy-Rtsp units have just the one stream).
export function cameraRtspUrl(id: string, stream: StreamKind): string | null {
  const fleet = getFleetCamera(id);
  const cam = getCamera(id) ?? fleet;
  if (!cam) return null;
  // SDK-only recorder (the elevators): one source, captured over the SDK.
  if (fleet?.sdk !== undefined) return `hiksdk://${fleet.host}/${fleet.sdk}`;
  const path =
    fleet?.rtsp !== undefined
      ? stream === "sub"
        ? fleet.rtsp.replace(/(\/Streaming\/Channels\/\d+)01$/i, (_, base) => `${base}02`)
        : fleet.rtsp
      : `/Streaming/Channels/${hikChannel(cam) * 100 + (stream === "main" ? 1 : 2)}`;
  const auth = cam.user
    ? `${encodeURIComponent(cam.user)}:${encodeURIComponent(cam.pass)}@`
    : "";
  // host may carry the web port (the NVR's "10.0.0.100:81"); RTSP is on 554.
  return `rtsp://${auth}${cam.host.split(":")[0]}:554${path}`;
}
